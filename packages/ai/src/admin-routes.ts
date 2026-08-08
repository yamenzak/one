/**
 * THE AI OPERATOR CONSOLE'S ENDPOINTS.
 *
 * ── Why these moved ─────────────────────────────────────────────────────────
 *
 * They were Kova's, in `apps/api/src/ai-routes.ts`, and none of them was ever
 * about Kova: the Gemini key, the mock lane, the credit markup and the model
 * catalog are all THIS package's state. The consequence of leaving them in an
 * app was not theoretical — Tessa shipped `GET /admin/ai` and `POST /admin/ai`,
 * two endpoints against Kova's eight, so its AI console could show a key field
 * and a read-only model list and nothing else. Not because anyone decided that,
 * but because reimplementing eight endpoints from scratch is a project and
 * writing two is an afternoon.
 *
 * What stays in the app is what genuinely is the app's: a self-test that runs
 * the product's own prompts through its own parsers, and whatever it does with
 * user feedback on generated output. Those need registries this package has no
 * business knowing about. Everything here is provider mechanics.
 *
 * ── The mock lane is the dangerous one ──────────────────────────────────────
 *
 * `mockMode: "on"` outside development makes every AI call return fabricated
 * output — and still bill the tenant credits for it. In a medical app that
 * includes clinical values read off a label. The write is refused here so the
 * console cannot create the state, AND the read point ignores a stored "on"
 * (see `mock-lane.ts`), so a hand-edited `app_config` row or a restored backup
 * cannot either. Two independent checks, because this route is only one of the
 * ways that row can be set.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getConfig, nowIso, setConfig, type HasDb, type HasEnvironment, type HasPlatformConfig } from "@4dl/core";
import type { Context } from "hono";
import { listModels, modelPricing, modelTasks, seedAiModels, type AiModelRow } from "./generate.js";
import { mockModeSettable } from "./mock-lane.js";
import { disableRetiredModels, fetchPricingDoc, syncModelCatalog } from "./catalog-sync.js";
import { publishSharedCatalog, readSharedCatalog } from "./shared-catalog.js";
import { applySharedSelection, broadcastSelection } from "./shared-selection.js";

/** The slice of an app's Hono env these routes actually read. */
export type AiRouteEnv = {
  Bindings: HasDb & HasEnvironment & HasPlatformConfig;
  Variables: Record<string, unknown>;
};

/**
 * 3× the real provider cost. High enough that a mispriced model cannot be sold
 * at a loss, low enough that credits stay comprehensible.
 */
export const DEFAULT_AI_MARKUP = 3;

export const globalMarkup = (cfg: Record<string, string>): number => {
  const n = Number(cfg["ai.markup"]);
  return n >= 1 && n <= 100 ? n : DEFAULT_AI_MARKUP;
};

export interface AiAdminDeps<E extends AiRouteEnv = AiRouteEnv> {
  /** Platform operator — an allowlist, a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: Context<E>) => boolean;
  /**
   * This app's name, stamped on a catalog it publishes for the platform.
   *
   * Only ever read back by another app's console, to say where its catalog came
   * from. Optional because a deployment with no shared store never publishes.
   */
  appName?: string;
  /**
   * Called once, when a real Gemini key is stored where there was none.
   *
   * Kova uses it to drop cached TTS cues: without a key those were voiced by the
   * keyless mock lane (silent WAVs), so keeping them would leave an owner stuck
   * with silence they had already "generated". Optional, because that is a
   * consequence of one app's caching, not of storing a key.
   */
  onFirstProviderKey?: (db: D1Database) => Promise<void>;
}

export function aiCatalogAdminRoutes<E extends AiRouteEnv = AiRouteEnv>(deps: AiAdminDeps<E>) {
  const forbidden = (c: Context<E>) => c.json({ error: "forbidden" }, 403);

  return new Hono<E>()
    /**
     * The EFFECTIVE configuration, and where each part of it comes from.
     *
     * This read used to be `getConfig(c.env.DB)` — this app's own `app_config`
     * row and nothing else — while `generate()` has always read the MERGED
     * config. The moment the Gemini key moved to the shared platform store,
     * those two disagreed: the vision suite worked perfectly and this screen
     * said "No Gemini key — the vision suite is dead".
     *
     * A wrong status here is worse than a wrong status usually is, because of
     * what it invites. An operator reading it goes and pastes the key in again,
     * and THAT writes a local row — a permanent per-app override of the shared
     * value, which is precisely the state the shared store exists to abolish.
     * The screen would have manufactured the problem it was misreporting.
     *
     * So the claim is the effective one, and `from` says whose value it is. The
     * per-app panels are local-only on purpose (a panel that saves every field
     * it displays would copy a shared value into a local override on the next
     * save) — but that rule is about what a form WRITES BACK, and this is a
     * status, not a field. The three writes below are each sent on their own,
     * so nothing here is ever echoed into a save the operator did not make.
     */
    .get("/admin/ai/config", async (c) => {
      if (!deps.isPlatformAdmin(c)) return forbidden(c);
      const local = await getConfig(c.env.DB);
      const effective = await getConfig(c.env);
      const models = await listModels(c.env.DB);
      /** Whose value is in force: this app's own row, or the shared store. */
      const from = (key: string): "app" | "shared" | null =>
        local[key] ? "app" : effective[key] ? "shared" : null;
      // Never echo the key — only whether it's set, and where it came from.
      return c.json({
        geminiKeySet: !!effective["google.gemini_key"],
        geminiKeyFrom: from("google.gemini_key"),
        mockMode: effective["ai.mock"] ?? "auto",
        mockModeFrom: from("ai.mock"),
        markup: globalMarkup(effective),
        markupFrom: from("ai.markup"),
        modelCount: models.length,
      });
    })

    .post("/admin/ai/config", async (c) => {
      if (!deps.isPlatformAdmin(c)) return forbidden(c);
      const d = z
        .object({
          geminiKey: z.string().min(1).optional(),
          mockMode: z.enum(["auto", "on", "off"]).optional(),
          markup: z.number().min(1).max(100).optional(),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!d.success) return c.json({ error: "invalid body" }, 400);

      if (d.data.geminiKey) {
        const prev = await getConfig(c.env.DB);
        await setConfig(c.env.DB, "google.gemini_key", d.data.geminiKey.trim());
        if (!prev["google.gemini_key"]) await deps.onFirstProviderKey?.(c.env.DB);
      }

      // See the header: refused here, and ignored at the read point.
      if (d.data.mockMode) {
        if (!mockModeSettable(d.data.mockMode, c.env.ENVIRONMENT === "development")) {
          return c.json(
            { error: "mock mode cannot be turned on outside development — it fabricates output and bills credits for it" },
            400,
          );
        }
        await setConfig(c.env.DB, "ai.mock", d.data.mockMode);
      }

      // Setting the global markup applies it to every model in the catalog so
      // credit charges stay markup × real provider cost across the board.
      if (d.data.markup !== undefined) {
        await setConfig(c.env.DB, "ai.markup", String(d.data.markup));
        await c.env.DB.prepare("UPDATE ai_models SET markup = ?").bind(d.data.markup).run();
      }
      return c.json({ ok: true });
    })

    /** The full catalog, disabled models included. */
    .get("/admin/ai/models", async (c) => {
      if (!deps.isPlatformAdmin(c)) return forbidden(c);
      // Seeded WITH the env, so a fresh app opening this screen arrives with the
      // whole priced catalog the platform already parsed rather than the twelve
      // hardcoded rows that exist only as a floor. This is where a new product's
      // catalog now comes from — no Sync, no operator action.
      await seedAiModels(c.env.DB, c.env);
      // Anything another app broadcast with "apply to every app" and this one
      // has not seen yet. Applied HERE so an operator who goes looking sees the
      // effect immediately; the daily sweep applies it too, so an app nobody
      // opens still converges. Idempotent by cursor — whichever runs first wins.
      await applySharedSelection(c.env).catch(() => undefined);
      // And anything whose announced shutdown date came true since the last
      // sync. Same reason as the line above: an operator looking at this screen
      // must not be shown a model as available when it has stopped answering.
      await disableRetiredModels(c.env.DB).catch(() => undefined);
      const rows = await c.env.DB.prepare("SELECT * FROM ai_models ORDER BY COALESCE(sort, 9999), provider, task, label").all<AiModelRow>();
      // Every row carries its price in CREDITS as well as its neuron rate card.
      // Neurons are the cost basis and stay useful, but they are not the currency
      // anyone spends — without the conversion the catalog cannot answer "is this
      // model expensive?", which is the only question being asked of it.
      //
      // `supports` is what the lane pickers filter on. Filtering on `task` alone
      // put every Gemini model out of the Vision lane (no Gemini row is ever
      // tagged `vision`) while letting a Gemini text model into the Image lane —
      // exactly backwards: they all read images, only the image family makes them.
      const models = (rows.results ?? []).map((m) => ({ ...m, pricing: modelPricing(m), supports: modelTasks(m) }));
      return c.json({ models });
    })

    /**
     * Toggle / default / per-model markup override.
     *
     * `allApps` broadcasts the on/off and default decision to every other 4DL
     * app, which each applies once and then owns. It is a one-time event rather
     * than a shared default on purpose — see shared-selection.ts. `markup` is
     * deliberately NOT broadcast: it is this app's price for this model, and
     * pushing one product's pricing onto another is a different decision from
     * "we all want this model available".
     */
    .patch("/admin/ai/models/:id", async (c) => {
      if (!deps.isPlatformAdmin(c)) return forbidden(c);
      const d = z
        .object({
          enabled: z.boolean().optional(),
          isDefault: z.boolean().optional(),
          markup: z.number().min(1).max(100).optional(),
          allApps: z.boolean().optional(),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!d.success) return c.json({ error: "invalid body" }, 400);
      const id = c.req.param("id");

      // Making a model the default for its task clears the previous default.
      if (d.data.isDefault) {
        const row = await c.env.DB.prepare("SELECT task FROM ai_models WHERE id = ?").bind(id).first<{ task: string }>();
        if (row) await c.env.DB.prepare("UPDATE ai_models SET is_default = 0 WHERE task = ?").bind(row.task).run();
      }
      const sets: string[] = [];
      const binds: unknown[] = [];
      if (d.data.enabled !== undefined) (sets.push("enabled = ?"), binds.push(d.data.enabled ? 1 : 0));
      if (d.data.isDefault !== undefined) (sets.push("is_default = ?"), binds.push(d.data.isDefault ? 1 : 0));
      if (d.data.markup !== undefined) (sets.push("markup = ?"), binds.push(d.data.markup));
      if (sets.length) await c.env.DB.prepare(`UPDATE ai_models SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();

      // This app is already done above; the broadcast is for the others.
      let broadcast = false;
      if (d.data.allApps && (d.data.enabled !== undefined || d.data.isDefault !== undefined)) {
        broadcast = await broadcastSelection(c.env, {
          modelId: id,
          enabled: d.data.enabled,
          isDefault: d.data.isDefault,
          by: deps.appName ?? "an app",
          at: nowIso(),
        });
      }
      // Reported rather than assumed. A deployment with no shared store cannot
      // broadcast, and an operator who ticked the box deserves to know that
      // rather than believe every app just changed.
      return c.json({ ok: true, broadcast });
    })

    /**
     * Refresh the catalog from the official pricing docs — and share the result.
     *
     * The rates on those two pages are a fact about what the providers charge,
     * identical in every deployment, and every app used to fetch and parse them
     * for itself. So a successful sync PUBLISHES what it parsed to the platform
     * store, and two things follow:
     *
     *   • a brand-new app seeds its whole priced catalog on first boot with no
     *     operator action, instead of living on twelve hardcoded rows until
     *     somebody remembers to press this button;
     *   • when both pages fail — a doc-format change, a provider having a bad
     *     day — this falls back to the last published catalog rather than
     *     reporting total failure and applying nothing.
     *
     * Publishing is best-effort and never turns a good sync into an error: the
     * app that ran it already has the fresh rows, and the next sync republishes.
     */
    .post("/admin/ai/models/sync", async (c) => {
      if (!deps.isPlatformAdmin(c)) return forbidden(c);
      // The MERGED config, so a markup set once for the platform reaches the
      // rows this sync inserts. (It is the default for NEW rows; existing rows
      // keep their own column, which is what the per-model control edits.)
      const cfg = await getConfig(c.env);
      const markup = globalMarkup(cfg);

      let report = await syncModelCatalog(c.env.DB, { markup, fetchMd: fetchPricingDoc });
      let published = false;

      if (report.ok) {
        published = await publishSharedCatalog(c.env, report.parsedModels, deps.appName ?? "an app", nowIso());
      } else {
        const shared = await readSharedCatalog(c.env);
        if (shared) report = await syncModelCatalog(c.env.DB, { markup, fetchMd: fetchPricingDoc, from: shared.models });
      }

      // 502 only when NEITHER provider produced a usable parse AND no shared
      // catalog could stand in — a one-sided failure still applied real work
      // and must return it, not a bare error.
      const { parsedModels: _dropped, ...body } = report;
      return c.json({ ...body, published }, report.ok ? 200 : 502);
    });
}
