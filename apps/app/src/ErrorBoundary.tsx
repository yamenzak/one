/**
 * Kova's binding of `@4dl/app-kit`'s error boundary.
 *
 * One thing is Kova's: where "Go home" goes. `/today` is the app's first screen
 * for every persona, and the platform has no idea what a deployment calls its.
 */
import { ErrorBoundary as Kit } from "@4dl/app-kit";
import type { ComponentProps } from "react";

export function ErrorBoundary(props: Omit<ComponentProps<typeof Kit>, "homePath">) {
  return <Kit {...props} homePath="/today" />;
}
