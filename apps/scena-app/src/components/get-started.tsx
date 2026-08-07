/**
 * First-run onboarding (§ onboarding vision) — the empty-tenant welcome.
 *
 * Shown on the Screens page when a workspace has no paired screens yet. Instead
 * of a bare "pair a screen" nudge, it presents the two ways in — pair a real TV
 * now, or build a display first — plus a three-step "how it works" so a brand-new
 * operator (or a client watching a demo) understands the flow before they start.
 * It disappears the moment the first screen is paired.
 */
import { MonitorPlay, Sparkles, LayoutGrid, Rocket, ArrowRight } from "lucide-react";
import { ScenaMascot } from "../brand.js";
import { Button } from "@4dl/ui";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: MonitorPlay, title: "Pair or create", body: "Claim a screen's code, or build a display first — either way it gets its own editable content." },
  { icon: LayoutGrid, title: "Build in the Studio", body: "Add slides, music, and widgets on one page. Preview updates live as you go." },
  { icon: Rocket, title: "Publish", body: "One click pushes to every screen on that display — frame-synced, instantly." },
];

export function GetStarted({
  canPair,
  canCreate,
  creating,
  onPair,
  onNewDisplay,
}: {
  canPair: boolean;
  canCreate: boolean;
  creating: boolean;
  onPair: () => void;
  onNewDisplay: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Hero */}
      <div className="flex flex-col items-center px-6 pb-8 pt-6 text-center">
        <ScenaMascot mood="happy" size={132} className="mb-2" />
        <h2 className="text-2xl font-extrabold tracking-tight">Welcome to Scena</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Get a screen showing beautiful, clock-synced content in about a minute. Pick how you'd like to start.
        </p>
      </div>

      {/* Two ways in */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceCard
          icon={<MonitorPlay />}
          title="Pair a screen"
          body="Have a TV or browser open on the Scena player? Enter its code and it goes live in seconds — with a sample scene if you like."
          cta={canPair ? { label: "Pair a screen", onClick: onPair, disabled: false } : undefined}
          accent
        />
        <ChoiceCard
          icon={<Sparkles />}
          title="Create a display"
          body="No screen handy? Build the content first — we'll start you with a sample scene — then bind it to a screen whenever you pair one."
          cta={canCreate ? { label: creating ? "Creating…" : "Create a display", onClick: onNewDisplay, disabled: creating } : undefined}
        />
      </div>

      {/* How it works */}
      <div className="mt-8">
        <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">How it works</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-xl border bg-card/40 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"><s.icon /></span>
                <span className="text-[11px] font-semibold text-muted-foreground">Step {i + 1}</span>
              </div>
              <div className="text-sm font-semibold">{s.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground/40 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  body,
  cta,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void; disabled: boolean };
  accent?: boolean;
}) {
  return (
    <div className={cn("flex flex-col rounded-2xl border p-5 transition-colors", accent ? "border-primary/30 bg-primary/[0.03]" : "bg-card/40")}>
      <div className={cn("mb-3 grid size-11 place-items-center rounded-xl [&_svg]:size-5", accent ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{icon}</div>
      <div className="text-base font-bold">{title}</div>
      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      {cta && (
        <Button className="mt-4 w-full" variant={accent ? "default" : "outline"} onClick={cta.onClick} disabled={cta.disabled}>
          {cta.label} <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}
