/**
 * A real React error boundary — a render/runtime crash in any routed screen is
 * caught here and shown as a recoverable fallback instead of white-screening the
 * whole app. Pass `resetKey` (e.g. the current pathname): when it changes the
 * boundary clears its error WITHOUT remounting children, so navigating away from
 * a broken route recovers on its own.
 *
 * ── Put one at the ROOT, above the providers, or this is all theatre ────────
 *
 * A boundary only catches what is BELOW it. An app that wraps its `<Routes>` and
 * nothing else leaves its session provider, its theme provider and every early
 * `return` above the router unguarded — and a throw there does not white-screen,
 * it BLACK-screens: React unmounts the root, `#root` empties, and all that is
 * left is the `body` background. No message, no button, no console for a phone
 * user to open. Kova shipped exactly that and a client hit it after finishing
 * their intake; the only evidence anyone could produce was a photograph of a
 * dark rectangle, which is precisely as diagnostic as it sounds.
 *
 * ── The message is shown ON PURPOSE ────────────────────────────────────────
 *
 * Normally an end user should not read `Cannot read properties of undefined`.
 * But the alternative here is worse: without it the only thing a stuck person
 * can report is "it's blank", and a defect nobody can name is a defect nobody
 * can fix. A render error carries no credentials and no personal data — it is a
 * type name and a property — so the cost is a moment of ugliness and the benefit
 * is that the next screenshot IS the bug report.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@4dl/ui";
import { RefreshNote } from "./RefreshNote.js";

interface Props {
  children: ReactNode;
  resetKey?: unknown;
  fallback?: ReactNode;
  /** Where "Go home" goes. The app's, because the platform has no idea what its
   *  first screen is called. */
  homePath?: string;
  /**
   * The app's mark, above the message.
   *
   * Scena kept a whole second boundary for this — 60 lines duplicating the 88
   * here, minus the error text and minus `RefreshNote`, both of which are the
   * reason this one is worth having. A brand is not a reason to fork a
   * component; it is a slot.
   */
  art?: ReactNode;
}
interface State { error: Error | null; key: unknown }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  // Clear a caught error once the reset key (route) changes — the new route's
  // children render fresh; if they crash too, the boundary catches again.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.error && props.resetKey !== state.key) return { error: null, key: props.resetKey };
    if (props.resetKey !== state.key) return { key: props.resetKey };
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught a render error:", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="grid min-h-dvh place-items-center p-8">
          <div className="max-w-sm text-center">
            {this.props.art}
            <div className="text-body-lg">Something went wrong</div>
            <p className="mt-1 text-body text-muted-foreground">This screen hit an unexpected error. You can try again or head back home.</p>
            {/* The reason, verbatim. See the header: a screenshot of this line is
                a usable bug report, and a screenshot of a blank screen is not. */}
            <p className="mt-3 select-all break-words rounded-lg bg-surface-2 px-3 py-2 text-left font-mono text-caption leading-relaxed text-muted-foreground">
              {this.state.error.message || String(this.state.error)}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="secondary" onClick={() => this.setState({ error: null })}>Try again</Button>
              <Button onClick={() => { window.location.href = this.props.homePath ?? "/" }}>Go home</Button>
            </div>
            {/* Neither button helps when the crash is a stale precached bundle
                talking to a newer API — both re-run the same broken build. */}
            <RefreshNote className="mt-6" label="Still broken after a reload?" />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
