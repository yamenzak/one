/**
 * "PUT THIS ON YOUR HOME SCREEN" — the nudge, and the iPhone guide behind it.
 *
 * The mechanics are `@4dl/app-kit`'s `useInstallState` (is this a tab or the
 * installed app; is there a real install API here). What lives in Kova is what
 * it SAYS and where it sits — the same split as the notification bell and the
 * passkey nudge, and the same reason: a warehouse app installs too, but it does
 * not open with "your coach's app".
 *
 * ── Why this is a row and not a banner ───────────────────────────────────────
 *
 * The passkey nudge next to it is one row (§7), and it is the more important
 * of the two — a passkey removes a step from every future sign-in, an install
 * removes a step from every future OPEN. Both are housekeeping, and housekeeping
 * that shouts is the thing UI-LANGUAGE §1 exists to stop. So: one row, one
 * verb, and it disappears the moment it is done or declined.
 *
 * ── Why iOS gets a sheet ─────────────────────────────────────────────────────
 *
 * WebKit ships no install API, by policy, and never will on our timescale. On
 * an iPhone the only route is Share → Add to Home Screen, which is three taps
 * inside a menu most people have never opened deliberately. An install row that
 * only works where `beforeinstallprompt` fires shows nothing at all to exactly
 * the audience that needs telling — so the manual lane is not a fallback here,
 * it is half the design.
 *
 * ── Why declining is remembered, and for how long ────────────────────────────
 *
 * Asking again on the next open is nagging; asking never again is losing the
 * install to one badly-timed tap. Fourteen days, in the device's own storage
 * (it is a fact about this device, not about the account — the same person on a
 * laptop should still be asked there).
 */

import { useState } from "react";
import {
  Button, Group, Row, Sheet, Card, IconBadge,
  Share, SquarePlus, Download, Check,
} from "@4dl/ui";
import { useInstallState, type InstallPlatform } from "@4dl/app-kit";
import { useSession, store } from "./session.js";

/** How long a "not now" holds. Long enough not to nag, short enough to re-ask. */
const SNOOZE_DAYS = 14;
const SNOOZE_KEY = "install-snoozed-until";

function snoozedUntil(): number {
  const v = store.read<number>(SNOOZE_KEY);
  return typeof v === "number" ? v : 0;
}

/** The steps, per platform. Kept as data so the sheet has no branching in it. */
const GUIDE: Record<InstallPlatform, { title: string; intro: string; steps: { icon: typeof Share; text: string }[] }> = {
  ios: {
    title: "Add to your Home Screen",
    intro: "and on iPhone and iPad you add it from Safari's Share menu.",
    steps: [
      { icon: Share, text: "Tap the Share button in Safari's toolbar — the square with an arrow pointing up." },
      { icon: SquarePlus, text: "Scroll down the list and choose “Add to Home Screen”." },
      { icon: Check, text: "Tap Add. The app appears on your Home Screen with its own icon." },
    ],
  },
  android: {
    title: "Add to your home screen",
    intro: "and you add it from the browser's own menu.",
    steps: [
      { icon: Share, text: "Open the browser menu — the three dots at the top right." },
      { icon: SquarePlus, text: "Choose “Install app” or “Add to Home screen”." },
      { icon: Check, text: "Confirm. The app appears with its own icon." },
    ],
  },
  desktop: {
    title: "Install the app",
    intro: "and your browser can run it in its own window, with no tabs or address bar.",
    steps: [
      { icon: Download, text: "Look for the install icon at the right-hand end of the address bar." },
      { icon: SquarePlus, text: "Or open the browser menu and choose “Install”." },
      { icon: Check, text: "Confirm. It opens in its own window from then on." },
    ],
  },
};

/**
 * ONE COMPONENT, because the state is one fact.
 *
 * This was briefly two — a `Row` and a `Card` that wrapped it — and each held
 * its own `snoozed`. Dismissing from the row left the wrapper still rendering,
 * so the nudge collapsed into an EMPTY CARD: a 56px slab of nothing where the
 * thing you just dismissed used to be. Splitting a component in two is free
 * only while neither half has state.
 *
 * Renders nothing when the app is already installed or the person has said no
 * — which is most of the time, and is the point: a nudge you cannot act on is a
 * nudge that should not be on the screen.
 */
export function InstallAppCard() {
  const { mode, platform, promptInstall } = useInstallState();
  const { host } = useSession();
  const [snoozed, setSnoozed] = useState(() => snoozedUntil() > Date.now());
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);

  if (mode === "installed" || snoozed) return null;

  const studio = host?.tenant?.name ?? "the app";
  const snooze = () => {
    store.write(SNOOZE_KEY, Date.now() + SNOOZE_DAYS * 86_400_000);
    setSnoozed(true);
  };

  const act = async () => {
    // One button, two lanes. Where the browser has a real install we use it;
    // where it does not, the sheet IS the install.
    if (mode !== "installable") { setGuide(true); return; }
    setBusy(true);
    const accepted = await promptInstall();
    setBusy(false);
    // A declined native prompt is a "not now" — re-asking on the next open is
    // the behaviour that makes people uninstall.
    if (!accepted) snooze();
  };

  const g = GUIDE[platform];

  return (
    <>
      <Group>
      {/*
        ONE trailing action, like the passkey row beside it.

        It shipped with two — "Not now" and the verb — and at 412px that left
        about 170px for the text, so the title truncated to "Add Northlight
        S…" and the sub-line to "Open it like a normal ap…". Two trailing
        actions is §7's CEILING, not its target, and a row whose own words are
        cut off to make room for a control has spent its budget in the wrong
        place.

        The studio's name went with it: the app bar says "Northlight Strength"
        four inches above this row, and §10 does not want it twice on one
        screen. Declining now lives one level in — in the sheet for the manual
        lane, and in the browser's own Cancel for the native one, which we
        already treat as a "not now".
      */}
      <Row
        icon={Download}
        iconTone="primary"
        // Short enough to survive 412px beside the button — the first pass read
        // "Opens like a normal app, no browser b…", which is a sub-line spending
        // its last four characters on an ellipsis.
        sub={platform === "ios" ? "Three taps in the Share menu" : "Opens like a normal app"}
        divider={false}
        trailing={
          <Button size="sm" variant="tonal" disabled={busy} onClick={() => void act()}>
            {busy ? "…" : mode === "installable" ? "Install" : "How"}
          </Button>
        }
      >
        Add to your home screen
      </Row>
      </Group>

      <Sheet
        open={guide}
        onClose={() => setGuide(false)}
        title={g.title}
        footer={
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => { snooze(); setGuide(false); }}>Not now</Button>
            <Button size="lg" className="flex-1" onClick={() => setGuide(false)}>Got it</Button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <p className="text-sm text-muted-foreground">{studio} runs from your home screen with its own icon — {g.intro}</p>
          <div className="space-y-2.5">
            {g.steps.map((s, i) => (
              /* Icon only — no trailing numeral. The three glyphs DIFFER (a
                 share arrow, a plus, a tick), so they carry identity rather
                 than texture (§7), and the order is already in the vertical
                 position, as it is in every instruction list ever written. A
                 numeral on the right restated the row's position while sitting
                 as far from it as the card allows. */
              <Card key={i} className="flex items-center gap-3 py-3">
                <IconBadge icon={s.icon} tone="primary" size="sm" />
                <span className="min-w-0 flex-1 text-sm">{s.text}</span>
              </Card>
            ))}
          </div>
        </div>
      </Sheet>
    </>
  );
}
