/**
 * A PRODUCT'S OWN SCREENS, INSIDE THE SAME SHELL.
 *
 * ⚠️ THE SHELL IS THE PLATFORM'S; THE SCREEN'S CONTENT IS THE APP'S. Routing,
 * chrome, reachability and the switcher are all decided out here — what a
 * product contributes is the inside of each declared screen, registered by
 * route through `mountScreen`. A screen an app has declared and not yet
 * shipped renders an honest notice rather than a blank page, because those
 * are indistinguishable and only one of them gets reported.
 */

import { Card } from "@heroui/react";
import { Section, Stack } from "@quad/web";
import type { CentreApp } from "./data.js";

/**
 * ⚠️ THE ONE REGISTRY, keyed `appId + declared route`. A deployment that ships
 * a product's screens fills it at boot; nothing else may draw inside an app's
 * frame. This is the seam the app-migration stages fill — the centre does not
 * grow product screens of its own (D12, applied to UI).
 */
const MOUNTS = new Map<string, React.ComponentType<{ readonly app: CentreApp }>>();

export const mountScreen = (
  appId: string, route: string, screen: React.ComponentType<{ readonly app: CentreApp }>,
): void => { MOUNTS.set(`${appId}${route}`, screen); };

export function AppSurface({ app, route }: {
  readonly app: CentreApp;
  readonly route: string;
}) {
  const declared = app.screens.find((s) => s.route === route)
    ?? app.screens.find((s) => s.route === "/")
    ?? app.screens[0];

  const Mounted = declared ? MOUNTS.get(`${app.id}${declared.route}`) : undefined;
  if (Mounted) return <Mounted app={app} />;

  return (
    <Section label={declared?.label ?? app.name}>
      <Stack space="snug">
        <Card>
          <Card.Header>
            <Card.Title>{app.mark} {declared?.label ?? app.name}</Card.Title>
            <Card.Description>
              This screen ships with {app.name}. The workspace, its people, its money and its
              settings are already live in the areas on the left.
            </Card.Description>
          </Card.Header>
        </Card>
      </Stack>
    </Section>
  );
}
