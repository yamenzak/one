/**
 * THE BRAND EDITOR — the theme half, for every app.
 *
 * ── Why this is in the package ──────────────────────────────────────────────
 *
 * `lib/theme.ts` has always been shared: the 20-field `Branding`, the presets,
 * `deriveTokens`, `parseThemeCss`, the token groups, the shadow and border
 * scales, `applyBranding`. All of it. What was NOT shared was the screen that
 * drives them, so exactly one app could actually use any of it. Kova had a
 * 600-line editor; Scena wrote a parallel one over its own token engine; Tessa
 * shipped four text fields and a colour input, and nothing applied them.
 *
 * Three products, three ideas of what "brand" means, over one token system that
 * already knew the answer.
 *
 * ── What it owns, and what it deliberately does not ─────────────────────────
 *
 * IT OWNS the theme: colour (presets, a custom seed, the surface tint), shape
 * and depth (radius, elevation, hairline weight and colour), the two
 * section-colour switches, and the per-token grid with a paste-a-theme box.
 * Every one of those is a `Branding` field and none of them names a product.
 *
 * IT DOES NOT own MARKS — logos, app icons, a generated monogram. Those need a
 * media store, and the three apps do not have the same one: Kova and Tessa
 * upload to a per-tenant ledger, Scena keys objects by CONTENT HASH because a
 * television caches them for months. Forcing one upload contract on that would
 * be a worse abstraction than none. So marks arrive as `extras` — product
 * sub-pages rendered inside this frame, sharing its index and, crucially, its
 * one Save.
 *
 * ── ONE SAVE, from every sub-page ───────────────────────────────────────────
 *
 * The editor is an index of sub-pages and there is exactly one Save button,
 * reachable from all of them. Splitting it per sub-page would let a
 * half-applied theme exist — a saved radius with unsaved colours — which is a
 * worse thing than a long page. That is why `extras` blocks live inside this
 * component rather than beside it: their state is the app's, but their submit is
 * ours, so the app's `onSave` receives this editor's fields and spreads its own
 * on top.
 *
 * ── Router-free, like everything else here ──────────────────────────────────
 *
 * `openSub`/`onOpenSub` are props. This package has no router and must not gain
 * one — a design system that imports one cannot be consumed by an app using a
 * different one. Kova binds them to `?b=` so Back steps out of a sub-page
 * before it leaves settings; another app may use state.
 */

import { Fragment, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { Button, Card, Chip, IconBadge, Input, Switch, Textarea, type Tone } from "./primitives.js";
import { SettingsIndex } from "./settings.js";
import { ActionResult, SaveBar, useAction, type ErrorFormatter } from "./patterns.js";
import { ColorSwatch, PreviewPicker, Slider } from "./controls.js";
import { ArrowLeft, Check, ChevronDown, Palette, Sliders, Waves, Wand2, type LucideIcon } from "./lib/icons.js";
import {
  BORDER_WIDTHS,
  BRAND_PRESETS,
  DEFAULT_TOKENS,
  SHADOW_PRESETS,
  THEME_TOKEN_GROUPS,
  deriveTokens,
  hexToOklchString,
  oklchStringToHex,
  parseThemeCss,
  type AccentSpec,
  type Branding,
  type BrandTokens,
  type NeutralTint,
  type ShadowPreset,
} from "./lib/theme.js";
import { cn } from "./lib/utils.js";

/**
 * The theme fields this editor owns. An app spreads its own on top.
 *
 * `preset` is widened to accept `null` where `Branding` has it optional. The
 * difference matters over the wire: the server MERGES the branding blob, so
 * `undefined` is dropped and leaves a stale preset in place, while `null`
 * clears it. Tokens carry everything now, and a leftover preset would win over
 * the map that replaced it.
 */
export type BrandTheme = Pick<
  Branding,
  "tokens" | "radius" | "shadow" | "borderColor" | "borderWidth" | "neutral" | "tintedNav" | "ambient" | "primary" | "primaryForeground"
> & { preset?: string | null };

/** A product-only sub-page — marks, fonts, an AI persona. */
export interface BrandingSubPage {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: Tone;
  /** The row's CURRENT VALUE, as everywhere else in the settings grammar. */
  value: string;
  block: ReactNode;
}

const NEUTRALS: { id: NeutralTint; label: string }[] = [
  { id: "brand", label: "Brand-tinted" },
  { id: "gray", label: "Neutral gray" },
  { id: "cool", label: "Cool" },
  { id: "warm", label: "Warm" },
];

const hasTokens = (t: BrandTokens): boolean => !!(Object.keys(t.light ?? {}).length || Object.keys(t.dark ?? {}).length);

const seedFrom = (b: Branding | null): string =>
  b?.primary || b?.tokens?.dark?.["--primary"] || b?.tokens?.light?.["--primary"] || BRAND_PRESETS[0]!.primary;

export interface BrandingEditorProps {
  initial: Branding | null;
  /**
   * Extra accent tokens this product derives alongside the palette.
   *
   * Kova passes its eleven domain accents so regenerating from a new brand
   * colour re-derives them too. An app with none passes nothing.
   */
  accents?: readonly AccentSpec[];
  /** Token groups the grid lists. The shared ones plus whatever the app adds. */
  tokenGroups?: { label: string; tokens: string[] }[];
  /** Placeholders in the grid — the shipped defaults, plus the app's accents. */
  defaultTokens?: BrandTokens;
  /**
   * Copy for the two section-colour switches.
   *
   * Injected because the only honest description of them names the product's own
   * sections — Kova's says "Train green, Eat amber". A shared component cannot
   * write that sentence and must not write a vaguer one in its place.
   */
  sectionCopy?: { navDesc: string; ambientDesc: string; onHint: string; offHint: string };
  /**
   * Product sub-pages, listed before this editor's own.
   *
   * A FUNCTION of the live theme, not a static array, because the ones that
   * exist genuinely need it — in BOTH directions:
   *
   *   READ   Kova's mark generator draws a wordmark in the brand colour and on
   *          the brand surface, so it needs the tokens the reader is currently
   *          dragging, not the ones that were saved.
   *   WRITE  "Generate my palette from my logo" reads an uploaded image and
   *          proposes a brand colour, so an extra has to be able to hand one
   *          back — `setSeed` regenerates the whole palette from it, exactly as
   *          pressing a preset does.
   *
   * `note` writes this editor's own line ("Palette generated from your logo"),
   * which is not the outcome of a save and must not land where a save
   * confirmation goes.
   *
   * That two-way access is what keeps "draw my logo" and "pick my colour" one
   * form with one Save, instead of two screens that can disagree.
   */
  extras?: (ctx: {
    tokens: BrandTokens;
    seedHex: string;
    setSeed: (hex: string) => void;
    note: (text: string | null) => void;
  }) => BrandingSubPage[];
  /** Live-preview as the reader drags. Called with the theme fields only. */
  onPreview: (b: Branding | null) => void;
  /** Persist. Receives this editor's fields; the app spreads its own on top. */
  onSave: (theme: BrandTheme) => Promise<void>;
  /** Controlled sub-page. See the header on why this is not a route. */
  openSub: string | null;
  onOpenSub: (key: string | null) => void;
  format: ErrorFormatter;
}

export function BrandingEditor(props: BrandingEditorProps) {
  // Keyed so a late-arriving `initial` re-seeds every field rather than leaving
  // the form on the values it guessed before the read landed.
  return <BrandingEditorForm key={props.initial ? "loaded" : "empty"} {...props} />;
}

function BrandingEditorForm({
  initial,
  accents,
  tokenGroups = THEME_TOKEN_GROUPS,
  defaultTokens = DEFAULT_TOKENS,
  sectionCopy,
  extras,
  onPreview,
  onSave,
  openSub,
  onOpenSub,
  format,
}: BrandingEditorProps) {
  const [tokens, setTokens] = useState<BrandTokens>(() =>
    initial?.tokens && hasTokens(initial.tokens) ? initial.tokens : deriveTokens({ primary: seedFrom(initial), accents }),
  );
  const [seed, setSeed] = useState<string>(seedFrom(initial));
  /*
    Seeded from what was SAVED, not hardcoded. Two things broke when it was not:
    the chip always read "Brand-tinted" on a reload however the app actually
    looked, and — worse — `generate(colour)` passes this value through, so
    nudging the brand colour silently regenerated the palette with the stale
    default and threw the tenant's tint away with no indication.
  */
  const [neutral, setNeutral] = useState<NeutralTint>(initial?.neutral ?? "brand");
  const [radius, setRadius] = useState(initial?.radius ?? 0.95);
  const [shadow, setShadow] = useState<ShadowPreset>(initial?.shadow ?? "soft");
  /*
    Hairline colour. Empty = the shipped per-mode default, which is the right
    answer for most tenants (dark needs a light translucent edge, light a dark
    one); a single custom colour applies to BOTH modes, so it is opt-in.
  */
  const [borderColor, setBorderColor] = useState<string>(initial?.borderColor ?? "");
  const [borderWidth, setBorderWidth] = useState<number>(initial?.borderWidth ?? 1);
  const [tintedNav, setTintedNav] = useState<boolean>(initial?.tintedNav ?? true);
  const [ambient, setAmbient] = useState<boolean>(initial?.ambient ?? true);
  const [advanced, setAdvanced] = useState(false);
  const [themeCss, setThemeCss] = useState("");
  const act = useAction(format);
  /*
    `msg` is this editor's NOTES — "Theme applied, save to keep it". Not the
    outcome of a write, and folding it into the action's result would let a stale
    note sit where a save confirmation goes.
  */
  const [msg, setMsg] = useState<string | null>(null);

  // Live-preview whenever a token-bearing field changes. A logo is not a token,
  // which is why the marks sub-page does not appear in these deps.
  useEffect(() => {
    onPreview({ tokens, radius, shadow, borderColor: borderColor || null, borderWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- JSON compare on tokens; onPreview is stable per render by contract
  }, [JSON.stringify(tokens), radius, shadow, borderColor, borderWidth]);

  /** The whole palette from one colour — the path almost every tenant uses. */
  const generate = (color: string, tint: NeutralTint = neutral) => {
    setSeed(color);
    setNeutral(tint);
    setTokens(deriveTokens({ primary: color, neutral: tint, accents }));
  };

  const applyThemeCss = () => {
    const { tokens: t, radius: r } = parseThemeCss(themeCss);
    if (!hasTokens(t)) { setMsg("No theme tokens found in that CSS."); return; }
    setTokens((prev) => ({ light: { ...prev.light, ...t.light }, dark: { ...prev.dark, ...t.dark } }));
    if (r != null) setRadius(r);
    setThemeCss("");
    setMsg("Theme applied — save to keep it.");
  };

  const setToken = (m: "light" | "dark", key: string, value: string) =>
    setTokens((t) => {
      const side = { ...(t[m] ?? {}) };
      if (value.trim()) side[key] = value.trim();
      else delete side[key];
      return { ...t, [m]: side };
    });

  const save = () =>
    act.run(
      "save",
      async () => {
        // Tokens carry everything now — null out the legacy preset/primary
        // fields so a stale one cannot win over the map that replaced it.
        await onSave({
          tokens, radius, shadow,
          borderColor: borderColor.trim() || null,
          borderWidth, neutral, tintedNav, ambient,
          preset: null, primary: null, primaryForeground: null,
        });
        setMsg(null);
        return "Branding saved.";
      },
      "Couldn't save your branding — nothing was changed.",
    );

  const seedHex = oklchStringToHex(seed.startsWith("#") ? hexToOklchString(seed) : seed);

  const colourBlock = (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-body font-medium">Brand colour</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-caption text-muted-foreground">
            Custom
            <ColorSwatch size="sm" value={seedHex} onChange={(hex) => generate(hex)} label="Custom brand colour" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BRAND_PRESETS.map((p) => {
            const on = parseInt(oklchStringToHex(p.primary).slice(1), 16) === parseInt(seedHex.slice(1), 16);
            return (
              <button
                key={p.id}
                onClick={() => generate(p.primary)}
                className={cn("relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all active:scale-95", on ? "border-primary" : "border-border/60")}
              >
                <span className="size-7 rounded-full" style={{ background: p.primary }} />
                <span className="text-caption">{p.label}</span>
                {on && <Check className="absolute right-1.5 top-1.5 size-3.5 text-primary" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-body text-muted-foreground">Surface tint</span>
        <div className="flex gap-2">
          {NEUTRALS.map((n) => <Chip key={n.id} selected={neutral === n.id} onClick={() => generate(seed, n.id)}>{n.label}</Chip>)}
        </div>
      </div>
    </>
  );

  const shapeBlock = (
    <>
      {/* A live preview beside the slider, so the number is not the only feedback. */}
      <div className="flex items-end gap-3">
        <Slider className="min-w-0 flex-1" label="Corner radius" display={`${radius.toFixed(2)}rem`} min={0.4} max={1.4} step={0.05} value={radius} onChange={setRadius} />
        <span aria-hidden className="size-10 shrink-0 rounded-xl border border-border bg-primary/15" />
      </div>

      {/* One preset drives --shadow-sm/md/lg, so every raised surface moves
          together — enforced by the design-token lint, which refuses a
          hard-coded box-shadow anywhere. */}
      <div className="space-y-1.5">
        <span className="text-body text-muted-foreground">Elevation</span>
        <div className="flex flex-wrap gap-2">
          {SHADOW_PRESETS.map((p) => <Chip key={p.id} selected={shadow === p.id} onClick={() => setShadow(p.id)}>{p.label}</Chip>)}
        </div>
        <p className="text-caption text-muted-foreground">{SHADOW_PRESETS.find((p) => p.id === shadow)?.hint}</p>
      </div>

      {/* Border WEIGHT. 0 genuinely removes every hairline in the app — the
          width utilities resolve to --border-width (tokens.css). */}
      <PreviewPicker
        label="Borders"
        value={borderWidth}
        onChange={setBorderWidth}
        options={BORDER_WIDTHS.map((w) => ({
          value: w.value,
          label: w.label,
          preview: (
            <span
              aria-hidden
              className="block w-9 rounded-md bg-surface-2"
              /* design-tokens-exempt: this IS the border-width picker — each swatch has to draw its own candidate weight, so it cannot resolve to the live token it is choosing. */
              style={{ height: "1.25rem", border: `${w.value}px solid var(--border)` }}
            />
          ),
        }))}
        hint={borderWidth === 0
          ? "Every divider and card edge is off — surfaces separate by colour and elevation alone."
          : "The weight of every divider and card edge in the app."}
      />

      {/* Pointless while borders are off, so it hides. */}
      {borderWidth > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-body">
            <span className="text-muted-foreground">Border colour</span>
            {borderColor && <button onClick={() => setBorderColor("")} className="text-caption font-medium text-primary">Reset to default</button>}
          </div>
          <div className="flex items-center gap-2">
            <ColorSwatch value={borderColor} onChange={setBorderColor} label="Border colour" />
            <Input value={borderColor} onChange={(e) => setBorderColor(e.target.value)} placeholder="Default (tuned per light / dark)" className="min-w-0 flex-1 font-mono text-caption" />
          </div>
          <p className="text-caption text-muted-foreground">
            Leave blank unless you need a specific hairline — the default is tuned separately for light and dark, and one
            colour has to serve both. Fine-tune per mode in the token grid.
          </p>
        </div>
      )}
    </>
  );

  /*
    Section colour. These two were per-device toggles in a personal "Appearance"
    tab once, which meant two members of one tenant saw differently-coloured
    chrome — and a tenant that had deliberately dialled its palette down to two
    greys got a rainbow tab bar back on whatever phone happened to have it
    stored. They describe how the TENANT looks, so they belong to branding.
  */
  const sectionBlock = sectionCopy ? (
    <div className="space-y-1.5">
      <span className="text-body text-muted-foreground">Section colour</span>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <ToggleRow icon={Palette} title="Colourful tab bar" desc={sectionCopy.navDesc} checked={tintedNav} onChange={setTintedNav} />
        <div className="border-t border-border/50" />
        <ToggleRow icon={Waves} title="Ambient page colour" desc={sectionCopy.ambientDesc} checked={ambient} onChange={setAmbient} />
      </div>
      <p className="text-caption text-muted-foreground">{tintedNav || ambient ? sectionCopy.onHint : sectionCopy.offHint}</p>
    </div>
  ) : null;

  const advancedBlock = (
    <>
      <button onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center justify-between text-body font-medium text-muted-foreground">
        <span>Fine-tune tokens</span>
        <ChevronDown className={cn("size-4 transition-transform", advanced && "rotate-180")} />
      </button>
      {advanced && (
        <div className="space-y-4">
          <p className="text-caption text-muted-foreground">
            Every token, light and dark, side by side. A blank field falls back to the shipped default (shown as the
            placeholder). Type any CSS colour — hex, <code className="rounded bg-surface-2 px-1">oklch()</code>, or{" "}
            <code className="rounded bg-surface-2 px-1">hsl()</code> — or use the swatch.
          </p>
          <TokenGrid tokens={tokens} groups={tokenGroups} defaults={defaultTokens} onSet={setToken} />
          <div className="space-y-2">
            <div className="text-body font-medium">Paste a theme</div>
            <p className="text-caption text-muted-foreground">
              Drop in any CSS token set (<code className="rounded bg-surface-2 px-1">:root</code> for light,{" "}
              <code className="rounded bg-surface-2 px-1">.dark</code> for dark). Every token maps straight through — the
              whole app re-skins.
            </p>
            <Textarea rows={4} value={themeCss} onChange={(e) => setThemeCss(e.target.value)} placeholder={":root { --primary: oklch(0.6 0.2 250); ... }\n.dark { --primary: ...; ... }"} className="font-mono text-caption" />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={!themeCss.trim()} onClick={applyThemeCss}>Apply theme</Button>
              <Button size="sm" variant="ghost" onClick={() => generate(seed)}>Regenerate</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const presetName = BRAND_PRESETS.find((x) => x.primary === seed)?.label ?? "Custom";
  const SUBS: BrandingSubPage[] = [
    ...(extras?.({ tokens, seedHex, setSeed: (hex) => generate(hex), note: setMsg }) ?? []),
    { key: "colour", label: "Colour", icon: Palette, tone: "primary", block: colourBlock,
      value: `${presetName} · ${NEUTRALS.find((n) => n.id === neutral)?.label ?? neutral} surfaces` },
    { key: "shape", label: "Shape & depth", icon: Sliders, tone: "warning", block: shapeBlock,
      value: `${radius.toFixed(2)}rem corners · ${SHADOW_PRESETS.find((x) => x.id === shadow)?.label ?? shadow} · ${BORDER_WIDTHS.find((x) => x.value === borderWidth)?.label ?? "hairline"}` },
    ...(sectionBlock
      ? [{ key: "sections", label: "Section colour", icon: Waves, tone: "success" as Tone, block: sectionBlock,
          value: tintedNav && ambient ? "Tab bar and page wash" : tintedNav ? "Tab bar only" : ambient ? "Page wash only" : "Off — brand colour everywhere" }]
      : []),
    { key: "advanced", label: "Fine-tune tokens", icon: Wand2, tone: "neutral", block: advancedBlock,
      value: "Every token, light and dark" },
  ];

  const open = SUBS.find((x) => x.key === openSub) ?? null;

  const saveBar = (
    <div className="space-y-3">
      {/* The editor's own notes sit above the bar; the bar carries the outcome of
          the save itself. Two lines, because they answer two questions. */}
      <ActionResult msg={msg} err={null} />
      <SaveBar label="Save branding" saving={act.busy === "save"} msg={act.msg} err={act.err} onSave={() => void save()} />
    </div>
  );

  if (open) {
    return (
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={() => onOpenSub(null)} aria-label="Back to brand"><ArrowLeft /></Button>
          <h2 className="min-w-0 flex-1 truncate text-title-3">{open.label}</h2>
        </div>
        <Card className="space-y-5">{open.block}</Card>
        {saveBar}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <SettingsIndex groups={[{ rows: SUBS.map((x) => ({ key: x.key, icon: x.icon, tone: x.tone, label: x.label, sub: x.value, onClick: () => onOpenSub(x.key) })) }]} />
      {saveBar}
    </section>
  );
}

function ToggleRow({ icon: Icon, title, desc, checked, onChange }: { icon: LucideIcon; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 p-3.5">
      <IconBadge icon={Icon} tone="neutral" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{title}</span>
        <span className="block text-caption text-muted-foreground">{desc}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function TokenGrid({ tokens, groups, defaults, onSet }: {
  tokens: BrandTokens;
  groups: { label: string; tokens: string[] }[];
  defaults: BrandTokens;
  onSet: (mode: "light" | "dark", key: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 text-micro uppercase text-muted-foreground">{g.label}</div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
            <span />
            <span className="w-[5.5rem] text-center text-micro uppercase text-muted-foreground">Light</span>
            <span className="w-[5.5rem] text-center text-micro uppercase text-muted-foreground">Dark</span>
            {g.tokens.map((name) => {
              const key = `--${name}`;
              return (
                <Fragment key={name}>
                  <code className="truncate text-caption text-muted-foreground">{name}</code>
                  <TokenCell mode="light" tokenKey={key} value={tokens.light?.[key] ?? ""} def={defaults.light?.[key] ?? ""} onSet={onSet} />
                  <TokenCell mode="dark" tokenKey={key} value={tokens.dark?.[key] ?? ""} def={defaults.dark?.[key] ?? ""} onSet={onSet} />
                </Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One token cell — a swatch plus a free-text CSS-colour field. */
function TokenCell({ mode, tokenKey, value, def, onSet }: {
  mode: "light" | "dark";
  tokenKey: string;
  value: string;
  def: string;
  onSet: (mode: "light" | "dark", key: string, value: string) => void;
}) {
  return (
    <div className="flex w-[5.5rem] items-center gap-1 rounded-md border border-border/60 px-1.5 py-1">
      <ColorSwatch size="sm" value={value || def} onChange={(hex) => onSet(mode, tokenKey, hex)} label={`${tokenKey} ${mode}`} />
      <input
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onSet(mode, tokenKey, e.target.value)}
        placeholder={def ? "default" : ""}
        className="min-w-0 flex-1 bg-transparent font-mono text-micro outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
