/**
 * Page-level error boundary. A single page throwing must never blank the whole
 * app (nav + shell included) — it isolates the failure to the content area and
 * offers a way back, keeping the operator in control of their fleet even when
 * one screen misbehaves. Reset key = the route path, so navigating away clears it.
 */
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { ScenaMascot } from "../brand.js";
import { Button } from "./ui/button.js";

interface Props {
  resetKey: string;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    // Clear the error when the route changes so a bad page doesn't stick.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[scena] page error", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-[60vh] place-items-center p-6">
          <div className="max-w-md text-center">
            <ScenaMascot mood="sad" size={104} className="mx-auto mb-2" />
            <h2 className="text-lg font-semibold">This page hit a snag</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Something went wrong rendering this view. The rest of Scena is still running — try again or head back to your fleet.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                <RotateCcw className="size-4" /> Try again
              </Button>
              <Button onClick={() => (window.location.href = "/")}>Go to Devices</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
