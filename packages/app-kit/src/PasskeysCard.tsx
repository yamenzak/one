/**
 * PASSKEYS — the surface for the ceremony this package already owns.
 *
 * `passkey.ts` has shipped `enrollPasskey`, `listPasskeys`, `removePasskey`,
 * `signInWithPasskey` and the conditional-UI probe since Stage 8. What it never
 * shipped was a screen, so every app had to write one — and the second app
 * didn't. Tessa has no passkey UI at all: not in settings, not on the login
 * screen. Its users are on email codes only, on a platform whose own
 * documentation says "100% passwordless: email OTP + passkeys".
 *
 * That is the same shape of gap as the console panels, and it deserves the same
 * fix: the package that owns the mechanism ships the surface too.
 *
 * ── One passkey is one device ───────────────────────────────────────────────
 *
 * Removing one unregisters that credential and nothing else. Email codes stay as
 * the fallback in every case, which is why removal is safe to offer without a
 * "you might lock yourself out" warning — there is no lockout to warn about.
 *
 * ── A device that cannot do passkeys says so ────────────────────────────────
 *
 * `passkeySupported()` is false on plenty of real browsers. Rendering a button
 * that opens a dialog the device will refuse is worse than saying plainly that
 * email codes are what this device uses.
 */

import { useCallback, useEffect, useState } from "react";
import { ActionResult, Badge, Button, Card, ConfirmDialog, KeyRound, Reveal, Skeleton, SkeletonLine, Trash2 } from "@4dl/ui";
import { deviceLabel, enrollPasskey, listPasskeys, passkeyErrorMessage, passkeySupported, removePasskey } from "./passkey.js";

export interface PasskeysCardProps {
  /**
   * Called after a passkey is added or removed.
   *
   * Kova uses it to refresh its "add a passkey?" prompt, which decides whether
   * to nag based on how many the account has. Optional, because that prompt is
   * one app's idea rather than part of passkeys.
   */
  onChanged?: () => void;
}

export function PasskeysCard({ onChanged }: PasskeysCardProps) {
  /*
    `null` until the list is KNOWN, and the distinction is the whole fix.

    Seeded as `[]`, this card rendered a confident "0" badge and an "Add a
    passkey" button for the length of the round trip — so someone with three
    passkeys was told, briefly but unambiguously, that they had none. That is
    not a missing loading state, it is a wrong answer with a loading state's
    excuse: the shape of `[]` and "we have not asked yet" are different facts and
    only one of them can be drawn.
  */
  const [passkeys, setPasskeys] = useState<{ id: string; name: string | null; createdAt: string }[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    // A device with no passkey support has nothing to fetch and nothing to wait
    // for — resolve to empty rather than shimmering forever over a list that
    // will never arrive.
    if (!passkeySupported()) { setPasskeys([]); return; }
    void listPasskeys().then(setPasskeys).catch(() => setPasskeys([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setEnrolling(true);
    setMsg(null);
    setErr(null);
    try {
      await enrollPasskey(deviceLabel());
      setPasskeys(await listPasskeys());
      onChanged?.();
      setMsg("Passkey added — next time, sign in with a tap.");
    } catch (e) {
      // A cancelled ceremony is not an error the person needs to see as a
      // failure, and `passkeyErrorMessage` already distinguishes the cases.
      setErr(passkeyErrorMessage(e));
    } finally {
      setEnrolling(false);
    }
  };

  const remove = async (id: string) => {
    setMsg(null);
    setErr(null);
    try {
      await removePasskey(id);
      setPasskeys(await listPasskeys());
      onChanged?.();
      setMsg("Passkey removed from your account.");
    } catch {
      setErr("Couldn't remove that passkey — try again.");
    } finally {
      setToRemove(null);
    }
  };

  const added = (iso: string) => {
    const d = new Date(iso);
    return isNaN(+d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Passkeys</div>
            <div className="text-sm text-muted-foreground">One-tap sign-in with Face ID / fingerprint.</div>
          </div>
          {passkeys !== null && <Badge tone={passkeys.length ? "success" : "neutral"}>{passkeys.length}</Badge>}
        </div>

        <Reveal
          loading={passkeys === null}
          className="space-y-3"
          skeleton={
            // The real row's geometry: an 8-unit glyph, two lines of text, a
            // trailing icon button. A grey blob here would teach the eye a shape
            // and then move everything (UI-LANGUAGE §7).
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="30%" h="xs" /></div>
              <Skeleton className="size-9 shrink-0 rounded-xl" />
            </div>
          }
        >
        {(passkeys ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary [&_svg]:size-4"><KeyRound /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name ?? "Passkey"}</div>
              {added(p.createdAt) && <div className="text-xs text-muted-foreground">Added {added(p.createdAt)}</div>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${p.name ?? "passkey"}`}
              onClick={() => setToRemove({ id: p.id, name: p.name ?? "this passkey" })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}

        {passkeySupported() ? (
          <Button variant="tonal" className="w-full" disabled={enrolling} onClick={() => void add()}>
            <KeyRound /> {enrolling ? "Waiting for your device…" : (passkeys ?? []).length ? "Add another passkey" : "Add a passkey"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">This device doesn&rsquo;t support passkeys — you&rsquo;ll keep using email codes.</p>
        )}
        </Reveal>

        <ActionResult msg={msg} err={err} />
      </Card>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title={toRemove ? `Remove ${toRemove.name}?` : "Remove passkey?"}
        description="That device won't be able to sign in with a tap anymore — it'll need an email code. You can add a passkey again anytime."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (toRemove) void remove(toRemove.id); }}
      />
    </>
  );
}
