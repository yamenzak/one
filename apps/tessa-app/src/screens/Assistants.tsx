/**
 * THE ASSISTANTS — the two that are not tied to a screen.
 *
 * `read-label` belongs inside the receive flow and `recall-report` inside a
 * recall, because both are a step in something you are already doing. These two
 * are not: "what should I order" and "what does this document say" are questions
 * you arrive with, so they get a place to be asked.
 *
 * ── Every one of them costs credits, and says so ────────────────────────────
 *
 * The balance is on screen before the button, and a 402 comes back with the
 * numbers rather than a generic failure — because the only useful response to
 * running out is to buy more, and that needs the shortfall named.
 */

import { useCallback, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  LoadError,
  Sheet,
  Spinner,
  Wand2,
  useAction,
  useLoad,
} from "@4dl/ui";
import { ai as aiApi, fmt } from "../data.js";
import { useI18n, useT } from "../i18n.js";

export function AssistantsSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const load = useCallback(() => aiApi.features(), []);
  const { data, error, loading, reload } = useLoad(load, t("ai.title"), fmt);
  const act = useAction(fmt);

  const [briefing, setBriefing] = useState<string | null>(null);
  const [doc, setDoc] = useState("");
  const [summary, setSummary] = useState<string | null>(null);

  const enabled = (key: string) => data?.features.find((f) => f.key === key)?.enabled ?? false;

  return (
    <Sheet open onClose={onClose} title={t("ai.title")}>
      {loading && <Spinner />}
      {error && <LoadError what={t("ai.title")} error={error} onRetry={reload} />}

      {data && (
        <div className="space-y-4">
          {/* What is left, before anything is spent. */}
          <div className="flex items-center justify-between px-1">
            <span className="text-caption text-muted-foreground">{t("ai.credits")}</span>
            <Badge tone={(data.balance?.available ?? 0) > 0 ? "success" : "danger"}>{data.balance?.available ?? 0}</Badge>
          </div>

          {!data.allowed && <Callout tone="warning" icon={Wand2}>{t("settings.ai.lockedBody")}</Callout>}
          {act.err && <p className="px-1 text-sm text-danger">{act.err}</p>}

          {/* ── What to order ───────────────────────────────────────────── */}
          <Card className="space-y-3 p-4">
            <div>
              <h3 className="text-body-lg">{t("ai.reorder")}</h3>
              <p className="text-caption text-muted-foreground">{t("ai.reorder.sub")}</p>
            </div>
            <Button
              className="w-full"
              disabled={!data.allowed || !enabled("reorder-advisor") || act.busy === "reorder"}
              onClick={() =>
                void act.run("reorder", async () => {
                  const r = await aiApi.reorder();
                  // An empty stock room is a legitimate answer and costs nothing
                  // — the route refuses to spend a credit on no rows.
                  setBriefing(r.empty ? t("ai.reorder.empty") : r.briefing);
                  reload();
                })
              }
            >
              {act.busy === "reorder" ? t("ai.working") : t("ai.run")}
            </Button>
            {briefing && <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{briefing}</pre>}
          </Card>

          {/* ── Summarise a document ────────────────────────────────────── */}
          <Card className="space-y-3 p-4">
            <div>
              <h3 className="text-body-lg">{t("ai.document")}</h3>
              <p className="text-caption text-muted-foreground">{t("ai.document.sub")}</p>
            </div>
            <textarea
              className="min-h-32 w-full rounded-lg border border-border bg-surface-2 p-3 text-sm"
              placeholder={t("ai.document.placeholder")}
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
            />
            <Button
              className="w-full"
              // 40 characters is the server's own floor. Enforcing it here too
              // means a too-short paste is a disabled button rather than a 400.
              disabled={!data.allowed || !enabled("read-document") || doc.trim().length < 40 || act.busy === "doc"}
              onClick={() =>
                void act.run("doc", async () => {
                  const r = await aiApi.readDocument(doc.trim(), locale === "de" ? "de" : "en");
                  setSummary(r.summary);
                  reload();
                })
              }
            >
              {act.busy === "doc" ? t("ai.working") : t("ai.run")}
            </Button>
            {summary && <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{summary}</pre>}
          </Card>

          <p className="px-1 text-caption text-muted-foreground">{t("ai.disclaimer")}</p>
        </div>
      )}
    </Sheet>
  );
}
