/**
 * A real React error boundary — a render/runtime crash in any routed screen is
 * caught here and shown as a recoverable fallback instead of white-screening the
 * whole app. Pass `resetKey` (e.g. the current pathname): when it changes the
 * boundary clears its error WITHOUT remounting children, so navigating away from
 * a broken route recovers on its own.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@4dl/ui";

interface Props { children: ReactNode; resetKey?: unknown; fallback?: ReactNode }
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
            <div className="text-body-lg">Something went wrong</div>
            <p className="mt-1 text-sm text-muted-foreground">This screen hit an unexpected error. You can try again or head back home.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="secondary" onClick={() => this.setState({ error: null })}>Try again</Button>
              <Button onClick={() => { window.location.href = "/today" }}>Go home</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
