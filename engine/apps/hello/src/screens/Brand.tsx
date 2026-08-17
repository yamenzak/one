/**
 * THE WORKSPACE'S OWN IDENTITY — one brand, every app under it.
 *
 * ⚠️ THIS SCREEN IS DECLARED `commercial`, AND WHAT A PERSONAL WORKSPACE SEES IS
 * THE HALF THAT MATTERS. Hiding it would leave somebody with no way to find out
 * that becoming a business is what unlocks it; showing it and refusing every
 * control would be a screen that lies. So it renders the offer instead — the
 * same sentence the gate would give, with the way forward attached.
 *
 * ⚠️ AND THE PREVIEW IS THE INSTALLED TILE, NOT A COLOUR SWATCH. What somebody
 * is actually choosing is what their staff will look for on a home screen, so
 * that is what is drawn — the same two values `installable.ts` paints it from,
 * resolved the same way, so the picture cannot promise a tile the worker would
 * not serve.
 */

import * as React from "react";
import { field, mayBrand, type Kind } from "@engine/kernel";
import { BrandTile, Field, Group, Nothing, Screen, Stack, ToggleRow } from "@engine/design";

/** ⚠️ The tokens a workspace edits, declared — so each gets its own control. */
const FIELDS = {
  ground: field.colour({ label: "Behind everything", holds: "none" }),
  ink: field.colour({ label: "Words and marks", holds: "none" }),
  accent: field.colour({ label: "What draws the eye", holds: "none" }),
  mark: field.text({ label: "One character for the icon", holds: "none", max: 2 }),
} as const;

export interface BrandTheme {
  readonly ground?: string;
  readonly ink?: string;
  readonly accent?: string;
  readonly mark?: string;
}

/**
 * ⚠️ THE SAME RESOLUTION THE WORKER USES (`paintFor`), and it is repeated here
 * rather than imported because the worker's copy lives beside a binding this
 * bundle must never load (D3). What keeps them honest is that both fall back to
 * the workspace's initial and neither invents a colour.
 */
const tile = (theme: BrandTheme, name: string) => ({
  ground: theme.ground || "#111113",
  ink: theme.ink || "#f4f4f5",
  glyph: theme.mark || name.trim().charAt(0).toUpperCase() || "·",
});

export function Brand({ title, name, kind, theme, surfaces, offered, onTheme, onSurface, onBecome }: {
  readonly title?: string;
  readonly name: string;
  readonly kind: Kind;
  readonly theme: BrandTheme;
  /** Which surfaces this workspace has asked to brand. */
  readonly surfaces: ReadonlySet<string>;
  /** Which surfaces the apps here actually have — the intersection is what applies. */
  readonly offered: readonly { readonly id: string; readonly label: string; readonly under: string }[];
  readonly onTheme: (key: keyof BrandTheme, value: unknown) => void;
  readonly onSurface: (id: string, on: boolean) => void;
  readonly onBecome: () => void;
}) {
  /* ⚠️ ASKED, NEVER COMPARED. The screen and the gate read the same function, so
     a screen cannot come to offer what a route refuses — and the day what
     commercial buys changes, it changes here too without this file being
     touched. A `kind === "commercial"` here is one product's private opinion. */
  if (!mayBrand(kind)) {
    return (
      <Screen shape="detail" title={title}>
        <Nothing
          says="This is for business workspaces"
          under={`Make ${name} a business and it carries your logo, your colour and your icon across every app here.`}
          offer={{ label: "Make it a business", onDo: onBecome }}
        />
      </Screen>
    );
  }

  const { ground, ink, glyph } = tile(theme, name);

  return (
    <Screen shape="detail" title={title}>
      <Stack space="roomy">
        {/* ⚠️ THE TILE FIRST, BECAUSE IT IS WHAT IS BEING DECIDED. Controls above
            a preview make somebody change a value and then go looking for the
            result; the result above them moves while they are still holding the
            control. */}
        <Group label="On a home screen" under="What your staff will look for">
          <div className="flex justify-center py-6">
            <BrandTile name={name} ground={ground} ink={ink} glyph={glyph} />
          </div>
        </Group>

        <Group label="Colour" under="Refused if the pair is too close to read">
          <Stack space="snug">
            {(Object.keys(FIELDS) as (keyof typeof FIELDS)[]).map((key) => (
              <Field
                key={key}
                name={key}
                spec={FIELDS[key]}
                value={theme[key] ?? ""}
                onChange={(value) => onTheme(key, value)}
              />
            ))}
          </Stack>
        </Group>

        {/* ⚠️ WHAT THE APPS HERE ACTUALLY OFFER, never the whole closed set. A
            surface a workspace can switch on that no app has is a promise the
            product cannot keep, and it fails silently — the toggle stays on and
            nothing anywhere looks different. */}
        <Group label="Where it shows" under="Only what the apps here have">
          <Stack space="snug">
            {offered.map((s) => (
              <ToggleRow
                key={s.id}
                label={s.label}
                under={s.under}
                value={surfaces.has(s.id)}
                onChange={(on) => onSurface(s.id, on)}
              />
            ))}
          </Stack>
        </Group>
      </Stack>
    </Screen>
  );
}
