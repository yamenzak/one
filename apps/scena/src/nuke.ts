/**
 * Platform factory-reset ("nuke") — WIPES ALL DATA back to a fresh-deployment
 * state. Platform-super-admin only (the /api/admin/* guard) AND gated behind an
 * emailed one-time code: request a code, then confirm with it. Irreversible.
 *
 * Wipes:
 *   • every D1 table — tenants, users, orgs, sessions, screens, channels,
 *     boards, board_users, media rows, feeds, schedules, billing, …
 *   • the whole KV namespace — pairing codes, manifest pointers, board tokens
 *   • every R2 object — uploaded media/assets
 * then re-seeds the billing catalog + config, so the platform is immediately
 * usable — exactly what the first boot of a clean deployment produces.
 *
 * NOT wiped: Durable Object storage (ScreenDO / ChannelDO / QueueDO /
 * RoomBoardDO / ScoreDO / TenantBillingDO). DOs can't be enumerated from a
 * Worker; they're addressed by name (idFromName), so once D1 is empty nothing
 * references the old ones and new entities mint fresh DOs. The orphaned storage
 * is invisible and harmless.
 */
import { emailShell, sendEmail } from "./mailer.js";
import { forceReseedBilling } from "./billing-store.js";
import type { Env } from "./env.js";

const OTP_KEY = "_nuke_otp";
const OTP_TTL_SEC = 600; // 10 minutes

function sixDigit(): string {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0]! % 1_000_000).padStart(6, "0");
}

/** Email a fresh factory-reset code to the admin. Overwrites any pending code. */
export async function requestNuke(env: Env, adminEmail: string): Promise<void> {
  const otp = sixDigit();
  await env.PAIRING.put(OTP_KEY, otp, { expirationTtl: OTP_TTL_SEC });
  await sendEmail(
    env.DB,
    {
      to: adminEmail,
      subject: `${otp} — confirm Scena factory reset`,
      html: emailShell(
        "Confirm a full data wipe",
        `<p><b>This permanently deletes everything</b> in this Scena deployment — every workspace, user, screen, channel, board, and uploaded file — and resets it to a clean install.</p>
         <p>If you started this, enter the code below to confirm. It expires in 10 minutes and works once.</p>
         <div style="font-size:30px;font-weight:800;letter-spacing:8px;margin:14px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${otp}</div>
         <p style="color:#b91c1c;font-size:13px">If you did NOT request this, ignore this email and review your admin access — someone is trying to wipe your deployment.</p>`,
      ),
      text: `Scena factory-reset code: ${otp} (expires in 10 minutes). This PERMANENTLY deletes all data. If you didn't request it, ignore this email.`,
    },
    env.EMAIL,
  );
}

export interface NukeResult {
  tables: number;
  kvKeys: number;
  objects: number;
}

/** Verify the emailed code, then wipe everything and re-seed. Throws on a bad or
 *  expired code (so nothing is touched unless the code is valid). */
export async function confirmNuke(env: Env, otp: string): Promise<NukeResult> {
  const expected = await env.PAIRING.get(OTP_KEY);
  if (!expected || expected !== (otp ?? "").trim()) throw new Error("invalid or expired code");
  await env.PAIRING.delete(OTP_KEY);

  // D1 first: it's a single atomic batch, so if anything fails it rolls back and
  // we abort before touching R2/KV — no half-wiped state. Then media, then KV.
  const tables = await wipeD1(env.DB);
  const objects = await wipeR2(env.MEDIA);
  const kvKeys = await wipeKV(env.PAIRING);
  // Restore the default plan catalog + config so a fresh workspace works at once.
  await forceReseedBilling(env.DB);
  return { tables, kvKeys, objects };
}

/** DELETE FROM every application table (schema preserved). Returns table count. */
async function wipeD1(db: D1Database): Promise<number> {
  const res = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
    )
    .all<{ name: string }>();
  const names = (res.results ?? []).map((r) => r.name);
  if (names.length) await db.batch(names.map((n) => db.prepare(`DELETE FROM "${n}"`)));
  return names.length;
}

/** Delete every key in the KV namespace. Returns the number deleted. */
async function wipeKV(kv: KVNamespace): Promise<number> {
  let cursor: string | undefined;
  let n = 0;
  for (;;) {
    const list = await kv.list({ cursor });
    for (const k of list.keys) {
      await kv.delete(k.name);
      n += 1;
    }
    if (list.list_complete) break;
    cursor = list.cursor;
  }
  return n;
}

/** Delete every object in the media bucket. Returns the number deleted. */
async function wipeR2(bucket: R2Bucket): Promise<number> {
  let cursor: string | undefined;
  let n = 0;
  for (;;) {
    const list = await bucket.list({ cursor });
    if (list.objects.length) {
      await bucket.delete(list.objects.map((o) => o.key));
      n += list.objects.length;
    }
    if (!list.truncated) break;
    cursor = list.cursor;
  }
  return n;
}
