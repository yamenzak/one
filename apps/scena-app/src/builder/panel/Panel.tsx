/**
 * The widget builder's property panel, rebuilt on shadcn (§17). Three tabs —
 * Content · Style · Layout — with live variant pickers instead of dropdowns and
 * a shared CSS block (fill, border, radius, shadow, blur, opacity) available to
 * every widget, standard shape or complex. Values map straight onto the node's
 * style/config, which the shared @scena/widgets core turns into the exact look
 * the player draws.
 */
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Trash2, Code2, Image as ImageIcon } from "lucide-react";
import { MediaPicker } from "../../components/media-picker.js";
import {
  FONT_OPTIONS, DATE_VARIANTS, TEXT_VARIANTS, TICKER_VARIANTS, TICKER_SEPARATORS, SHADOW_PRESETS, NOWPLAYING_VARIANTS, QUEUE_VARIANTS, SCORE_VARIANTS, CLOCK_VARIANTS,
  LINE_STYLES, STACK_TRANSITIONS, STACK_ITEM_TYPES, COUNTDOWN_VARIANTS, METRIC_VARIANTS, MENU_VARIANTS,
  stackItems, stackTransition, stackShuffle, menuItems, defaultsFor, widgetDef, displaySummary, DISPLAY_ANIMS, CTA_PRESETS, ctaDefaults,
  str, num, bool, type StackItem, type MenuItem, type ScaleMode, type DisplaySchedule, type DisplayAnim,
} from "@scena/widgets";
import type { RoomState } from "@scena/protocol";
import { FONT_FAMILIES } from "@scena/manifest";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs.js";
import { Button } from "../../components/ui/button.js";
import { getSourceData, type Board, type Feed, type WeatherLocation, type BrandLogo } from "../../api.js";
import type { WNode } from "../types.js";
import { Field, Group, TextField, AreaField, NumberField, SliderField, SelectField, SegField, SwitchField, ColorField, QuadField } from "./fields.js";
import { VariantPicker } from "./VariantPicker.js";
import { BindControl } from "./BindControl.js";
import { HtmlEditorDialog } from "../../components/html-editor.js";

interface Handlers {
  onGeom: (p: Partial<WNode>) => void;
  onStyle: (p: Record<string, unknown>) => void;
  onConfig: (p: Record<string, unknown>) => void;
}
type Props = { node: WNode; boards: Board[]; feeds: Feed[]; weather: WeatherLocation[]; logos?: BrandLogo[] } & Handlers;

// Font picker = the widget defaults (Hanken / Mono / Serif / System) followed by
// every bundled, self-hosted slide font (Inter, Poppins, Playfair Display, Cairo,
// …). The dashboard already @font-faces these, so builder typography matches slides.
const FONT_CHOICES = [
  ...FONT_OPTIONS.map((f) => ({ id: f.id, label: f.label })),
  ...FONT_FAMILIES.map((f) => ({ id: f, label: f })),
];

const opt = (ids: [string, string][]) => ids.map(([id, label]) => ({ id, label }));

// A curated world-clock zone list (IANA names). "" = the screen's local time.
const TZ_OPTIONS = [
  { id: "", label: "Local (this screen)" },
  { id: "America/Los_Angeles", label: "Los Angeles" },
  { id: "America/Denver", label: "Denver" },
  { id: "America/Chicago", label: "Chicago" },
  { id: "America/New_York", label: "New York" },
  { id: "America/Sao_Paulo", label: "São Paulo" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Paris", label: "Paris / Berlin" },
  { id: "Europe/Athens", label: "Athens" },
  { id: "Africa/Cairo", label: "Cairo" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Karachi", label: "Karachi" },
  { id: "Asia/Kolkata", label: "Mumbai / Delhi" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Shanghai", label: "Beijing / Shanghai" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
  { id: "Pacific/Auckland", label: "Auckland" },
];
const shadowId = (v: unknown) => { const id = str(v, "none"); return SHADOW_PRESETS.some((p) => p.id === id) ? id : "none"; };
const TEXTY = new Set(["text", "clock", "date"]);
const SHAPES = new Set(["box", "circle", "triangle"]);
const SCALEABLE = new Set(["text", "clock", "date", "box", "circle", "triangle", "countdown", "metric", "menu", "qr", "cta"]);
/** Widgets with no per-content options (pure visuals). */
const NO_CONTENT = new Set(["box", "circle", "triangle", "line"]);

export function Panel(props: Props) {
  const { node } = props;
  const [tab, setTab] = useState("content");
  const noContent = NO_CONTENT.has(node.type);

  return (
    <Tabs value={noContent && tab === "content" ? "style" : tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="content" disabled={noContent} className="text-xs">Content</TabsTrigger>
        <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
        <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
      </TabsList>

      <TabsContent value="content" className="mt-1">{!noContent && <ContentTab {...props} />}</TabsContent>
      <TabsContent value="style" className="mt-1"><StyleTab {...props} /></TabsContent>
      <TabsContent value="layout" className="mt-1"><LayoutTab {...props} /></TabsContent>
    </Tabs>
  );
}

/* -------------------------------- Content -------------------------------- */

/** HTML-widget content: hand-write or AI-generate the markup for its box. */
function HtmlContent({ node, onConfig }: { node: WNode; onConfig: (p: Record<string, unknown>) => void }) {
  const html = str(node.config.html);
  const [open, setOpen] = useState(false);
  return (
    <Group title="HTML">
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Self-contained HTML rendered in a sandboxed iframe scoped to this widget. Write it yourself or let the AI design it — on-brand, animated, no external resources.
      </p>
      <div className="px-1">
        <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
          <Code2 className="size-4" /> {html ? "Edit HTML / AI" : "Write HTML with AI"}
        </Button>
      </div>
      <HtmlEditorDialog
        open={open}
        initialHtml={html}
        title="HTML widget"
        mode={html ? "edit" : "new"}
        surface="widget"
        width={Math.round(node.w)}
        height={Math.round(node.h)}
        onOpenChange={setOpen}
        onSave={async (h) => { onConfig({ html: h }); }}
      />
    </Group>
  );
}

/** A URL field with a "pick from the media library" button (keeps assets in the
 *  library rather than encouraging raw external URLs). */
function LibraryUrlField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [pick, setPick] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1"><TextField value={value} onChange={onChange} placeholder={placeholder ?? "https://…"} mono /></div>
      <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" title="Choose from library" onClick={() => setPick(true)}>
        <ImageIcon className="size-3.5" />
      </Button>
      <MediaPicker open={pick} kind="image" onOpenChange={setPick} onPick={(url) => onChange(url)} />
    </div>
  );
}

/** Logo widget: pick which uploaded brand-logo variant to show (or paste a URL). */
function LogoContent({ node, logos, onConfig }: { node: WNode; logos: BrandLogo[]; onConfig: (p: Record<string, unknown>) => void }) {
  const c = node.config;
  const url = str(c.url);
  return (
    <>
      <Group title="Logo">
        {logos.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {logos.map((l) => {
              const active = str(c.logoId) === l.id || (!c.logoId && url === l.url);
              return (
                <button key={l.id} type="button"
                  onClick={() => onConfig({ logoId: l.id, url: l.url, variant: l.label })}
                  className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"}`}>
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#0000_0deg_90deg,#8884_90deg_180deg)] bg-[length:12px_12px]">
                    <img src={l.url} alt={l.label} className="max-h-9 max-w-9 object-contain" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.label}</span>
                  {active && <span className="text-[11px] font-semibold text-primary">Selected</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            No brand logos yet. Upload your logo (and any variants) under <b>Settings → Brand kit → Brand assets</b>, then pick one here.
          </p>
        )}
      </Group>
      <Group title="Options" defaultOpen={false}>
        <Field label="Source" hint="A library asset or any image URL"><LibraryUrlField value={url} onChange={(v) => onConfig({ url: v, logoId: "", variant: "" })} /></Field>
        <Field label="Fit"><SelectField value={str(c.fit, "contain")} onChange={(v) => onConfig({ fit: v })} options={opt([["contain", "Contain"], ["cover", "Cover"], ["100% 100%", "Stretch"]])} /></Field>
      </Group>
    </>
  );
}

function ContentTab({ node, boards, feeds, weather, logos, onConfig }: Props) {
  const c = node.config;
  const t = node.type;

  if (t === "text") {
    return (
      <>
        <Group title="Text">
          <AreaField value={str(c.text)} onChange={(v) => onConfig({ text: v })} rows={4} placeholder="Your text" />
          <BindControl node={node} field="text" kind="value" label="text" sources={feeds} onConfig={onConfig} />
        </Group>
        <Group title="Style">
          <VariantPicker node={node} value={str(c.variant, "plain")} options={TEXT_VARIANTS} onPick={(v) => onConfig({ variant: v })} />
        </Group>
      </>
    );
  }
  if (t === "clock") {
    const showDate = bool(c.showDate);
    return (
      <>
        <Group title="Style"><VariantPicker node={node} value={str(c.variant, "digital")} options={CLOCK_VARIANTS} onPick={(v) => onConfig({ variant: v })} /></Group>
        <Group title="Options">
          <SwitchField label="12-hour (AM/PM)" value={bool(c.hour12)} onChange={(v) => onConfig({ hour12: v })} />
          <SwitchField label="Show seconds" value={bool(c.seconds, true)} onChange={(v) => onConfig({ seconds: v })} />
          <SwitchField label="Show date" value={showDate} onChange={(v) => onConfig({ showDate: v })} />
          {showDate && <Field label="Date format"><SelectField value={str(c.dateVariant, "medium")} onChange={(v) => onConfig({ dateVariant: v })} options={DATE_VARIANTS} /></Field>}
        </Group>
        <Group title="Time zone" defaultOpen={false}>
          <Field label="Zone" hint="Show any city's time — great for world clocks"><SelectField value={str(c.tz)} onChange={(v) => onConfig({ tz: v })} options={TZ_OPTIONS} /></Field>
          <Field label="Label"><TextField value={str(c.tzLabel)} onChange={(v) => onConfig({ tzLabel: v })} placeholder="e.g. New York" /></Field>
        </Group>
      </>
    );
  }
  if (t === "date") {
    return (
      <Group title="Format">
        <VariantPicker node={node} value={str(c.variant, "full")} options={DATE_VARIANTS} onPick={(v) => onConfig({ variant: v })} />
      </Group>
    );
  }
  if (t === "html") return <HtmlContent node={node} onConfig={onConfig} />;
  if (t === "image") {
    return (
      <Group title="Image">
        <Field label="Source"><LibraryUrlField value={str(c.url)} onChange={(v) => onConfig({ url: v })} /></Field>
        <Field label="Fit"><SelectField value={str(c.fit, "cover")} onChange={(v) => onConfig({ fit: v })} options={opt([["cover", "Cover"], ["contain", "Contain"], ["100% 100%", "Stretch"]])} /></Field>
      </Group>
    );
  }
  if (t === "logo") return <LogoContent node={node} logos={logos ?? []} onConfig={onConfig} />;
  if (t === "ticker") {
    const sepKind = str(c.separatorKind, "custom");
    const badge = str(c.badge).trim();
    return (
      <>
        <Group title="Source">
          <Field label="Source"><SelectField value={str(c.feedId)} onChange={(v) => onConfig({ feedId: v })} options={[{ id: "", label: "— pick a source —" }, ...feeds.map((f) => ({ id: f.id, label: f.name }))]} /></Field>
          {str(c.feedId) ? <SourceColumnField feedId={str(c.feedId)} value={str(c.column, "title")} onChange={(v) => onConfig({ column: v })} hint="Which column scrolls across" />
            : <p className="text-[10.5px] text-muted-foreground">Any source works — an RSS/Manual headline list, or a column from an API or Google Sheet. Create one on the Sources page.</p>}
        </Group>
        <Group title="Layout"><VariantPicker node={node} value={str(c.variant, "scroll")} options={TICKER_VARIANTS} onPick={(v) => onConfig({ variant: v })} /></Group>
        <Group title="Separator">
          <Field label="Style"><SelectField value={sepKind} onChange={(v) => onConfig({ separatorKind: v })} options={TICKER_SEPARATORS.map((s) => ({ id: s.id, label: s.label }))} /></Field>
          {sepKind === "custom" && <Field label="Text"><TextField value={str(c.separator, "  •  ")} onChange={(v) => onConfig({ separator: v })} /></Field>}
          {sepKind === "image" && <Field label="Image"><LibraryUrlField value={str(c.separatorImage)} onChange={(v) => onConfig({ separatorImage: v })} /></Field>}
        </Group>
        <Group title="Badge" defaultOpen={false}>
          <Field label="Label"><TextField value={str(c.badge)} onChange={(v) => onConfig({ badge: v })} placeholder="e.g. BREAKING" /></Field>
          {badge && <Field label="Fill"><ColorField value={str(c.badgeColor, "oklch(0.55 0.22 25)")} onChange={(v) => onConfig({ badgeColor: v })} fallback="#d63b2f" /></Field>}
          {badge && <Field label="Text"><ColorField value={str(c.badgeTextColor, "#ffffff")} onChange={(v) => onConfig({ badgeTextColor: v })} /></Field>}
        </Group>
      </>
    );
  }
  if (t === "weather") {
    return (
      <>
        <Group title="Location">
          <Field label="Place"><SelectField value={str(c.sourceId)} onChange={(v) => onConfig({ sourceId: v })} options={[{ id: "", label: "— pick a location —" }, ...weather.map((w) => ({ id: w.id, label: w.label }))]} /></Field>
          {weather.length === 0 && <p className="text-[10.5px] text-muted-foreground">Add a location in Settings first.</p>}
        </Group>
        <Group title="Layout"><VariantPicker node={node} value={str(c.variant, "current")} options={opt([["small", "Small"], ["current", "Current"], ["day", "Today"], ["week", "Week"]])} onPick={(v) => onConfig({ variant: v })} /></Group>
        <Group title="Units" defaultOpen={false}>
          <Field label="Units" hint="Override the location's default"><SegField value={str(c.units) || "default"} onChange={(v) => onConfig({ units: v === "default" ? "" : v })} options={opt([["default", "Default"], ["metric", "°C"], ["imperial", "°F"]])} /></Field>
        </Group>
      </>
    );
  }
  if (t === "nowplaying") {
    return (
      <Group title="Style">
        <VariantPicker node={node} value={str(c.variant, "card")} options={NOWPLAYING_VARIANTS} onPick={(v) => onConfig({ variant: v })} />
        <p className="text-[10.5px] text-muted-foreground">Shows the channel's current track — art + artist come from the Music page.</p>
      </Group>
    );
  }
  if (t === "queue_caller" || t === "room_board" || t === "room_status" || t === "scoreboard") {
    const kind = t === "queue_caller" ? "queue" : t === "scoreboard" ? "score" : "room";
    const boundBoard = boards.find((b) => b.id === str(c.boardId));
    // A room-status door widget binds one specific room of the board.
    const rooms = boundBoard && boundBoard.kind === "room" ? (boundBoard.state as RoomState | null)?.rooms ?? [] : [];
    return (
      <>
        <Group title="Board"><Field label="Board"><SelectField value={str(c.boardId)} onChange={(v) => onConfig({ boardId: v, ...(t === "room_status" ? { roomId: "" } : {}) })} options={[{ id: "", label: `— pick a ${kind} board —` }, ...boards.filter((b) => b.kind === kind).map((b) => ({ id: b.id, label: b.name }))]} /></Field>
          {t === "room_status" && (
            <Field label="Room"><SelectField value={str(c.roomId)} onChange={(v) => onConfig({ roomId: v })} options={[{ id: "", label: rooms.length ? "— pick a room —" : "bind a room board first" }, ...rooms.map((r) => ({ id: r.id, label: r.name }))]} /></Field>
          )}
        </Group>
        {t === "queue_caller" && <Group title="Style"><VariantPicker node={node} value={str(c.variant, "solo")} options={QUEUE_VARIANTS} onPick={(v) => onConfig({ variant: v })} /></Group>}
        {t === "scoreboard" && <Group title="Style"><VariantPicker node={node} value={str(c.variant, "classic")} options={SCORE_VARIANTS} onPick={(v) => onConfig({ variant: v })} /></Group>}
      </>
    );
  }
  if (t === "countdown") {
    const countUp = bool(c.countUp);
    return (
      <>
        <Group title="Layout">
          <VariantPicker node={node} value={str(c.variant, "blocks")} options={COUNTDOWN_VARIANTS} onPick={(v) => onConfig({ variant: v })} />
          {str(c.variant, "blocks") === "inline" && <Field label="Separator" hint="Between the units on the inline variant"><TextField value={str(c.separator, " : ")} onChange={(v) => onConfig({ separator: v })} placeholder=" : " /></Field>}
        </Group>
        <Group title="Target">
          <Field label={countUp ? "Since" : "Target"}><DateTimeField value={str(c.target)} onChange={(v) => onConfig({ target: v })} /></Field>
          <SwitchField label="Count up (elapsed)" value={countUp} onChange={(v) => onConfig({ countUp: v })} />
          <SwitchField label="Show days" value={bool(c.showDays, true)} onChange={(v) => onConfig({ showDays: v })} />
          {!countUp && <Field label="When done" hint="Shown once the target passes"><TextField value={str(c.doneText)} onChange={(v) => onConfig({ doneText: v })} placeholder="e.g. We're live!" /></Field>}
        </Group>
      </>
    );
  }
  if (t === "metric") {
    const variant = str(c.variant, "card");
    return (
      <>
        <Group title="Layout"><VariantPicker node={node} value={variant} options={METRIC_VARIANTS} onPick={(v) => onConfig({ variant: v })} /></Group>
        <Group title="Value">
          <Field label="Value"><TextField value={str(c.value)} onChange={(v) => onConfig({ value: v })} placeholder="1,284" /></Field>
          <Field label="Unit"><TextField value={str(c.unit)} onChange={(v) => onConfig({ unit: v })} placeholder="%, °, kg…" /></Field>
          <Field label="Label"><TextField value={str(c.label)} onChange={(v) => onConfig({ label: v })} placeholder="Visitors today" /></Field>
          {variant === "ring" && <Field label="Ring %"><SliderField value={num(c.percent, 66)} onChange={(v) => onConfig({ percent: v })} min={0} max={100} /></Field>}
        </Group>
        {variant !== "ring" && (
          <Group title="Trend" defaultOpen={false}>
            <Field label="Direction"><SegField value={str(c.trend, "none")} onChange={(v) => onConfig({ trend: v })} options={opt([["up", "▲ Up"], ["flat", "▬ Flat"], ["down", "▼ Down"], ["none", "—"]])} /></Field>
            <Field label="Delta"><TextField value={str(c.delta)} onChange={(v) => onConfig({ delta: v })} placeholder="+7.9%" /></Field>
            <Field label="Caption"><TextField value={str(c.caption)} onChange={(v) => onConfig({ caption: v })} placeholder="vs. yesterday" /></Field>
          </Group>
        )}
        <Group title="Dynamic data" defaultOpen={false}>
          <p className="text-[10.5px] text-muted-foreground">Pull any field live from an API or Google Sheet source.</p>
          <BindControl node={node} field="value" kind="value" label="value" sources={feeds} onConfig={onConfig} />
          <BindControl node={node} field="label" kind="value" label="label" sources={feeds} onConfig={onConfig} />
          <BindControl node={node} field="unit" kind="value" label="unit" sources={feeds} onConfig={onConfig} />
          <BindControl node={node} field="delta" kind="value" label="delta" sources={feeds} onConfig={onConfig} />
          <BindControl node={node} field="caption" kind="value" label="caption" sources={feeds} onConfig={onConfig} />
          {variant === "ring" && <BindControl node={node} field="percent" kind="value" label="percent" sources={feeds} onConfig={onConfig} />}
        </Group>
      </>
    );
  }
  if (t === "menu") {
    const boundItems = !!(c.bindings as Record<string, { sourceId?: string }> | undefined)?.items?.sourceId;
    return (
      <>
        <Group title="Layout"><VariantPicker node={node} value={str(c.variant, "rows")} options={MENU_VARIANTS} onPick={(v) => onConfig({ variant: v })} /></Group>
        <Group title="Heading"><Field label="Title"><TextField value={str(c.title)} onChange={(v) => onConfig({ title: v })} placeholder="Today's menu" /></Field></Group>
        <Group title="Dynamic data" defaultOpen={boundItems}>
          <p className="text-[10.5px] text-muted-foreground">Fill the rows live from a Google Sheet or API source.</p>
          <BindControl node={node} field="items" kind="list" label="items" sources={feeds} onConfig={onConfig} />
        </Group>
        {!boundItems && <MenuItemsEditor node={node} onConfig={onConfig} />}
      </>
    );
  }
  if (t === "qr") {
    return (
      <Group title="QR code">
        <Field label="Link / text" hint="A URL, wifi string, or any text to encode"><AreaField value={str(c.text ?? c.url)} onChange={(v) => onConfig({ text: v })} rows={2} placeholder="https://…" /></Field>
        <Field label="Caption"><TextField value={str(c.caption)} onChange={(v) => onConfig({ caption: v })} placeholder="Scan to visit" /></Field>
      </Group>
    );
  }
  if (t === "cta") {
    const preset = str(c.preset, "google");
    const def = ctaDefaults(preset);
    return (
      <>
        <Group title="Call to action">
          <Field label="Type"><SelectField value={preset} onChange={(v) => onConfig({ preset: v })} options={CTA_PRESETS.map((p) => ({ id: p.id, label: p.label }))} /></Field>
          {preset === "wifi" ? (
            <>
              <Field label="Network name" hint="The Wi-Fi SSID"><TextField value={str(c.wifiSsid)} onChange={(v) => onConfig({ wifiSsid: v })} placeholder="Guest WiFi" /></Field>
              <Field label="Password" hint="Leave blank for an open network"><TextField value={str(c.wifiPassword)} onChange={(v) => onConfig({ wifiPassword: v })} placeholder="••••••" /></Field>
            </>
          ) : (
            <Field label="Link" hint="Where the scan takes people"><AreaField value={str(c.url)} onChange={(v) => onConfig({ url: v })} rows={2} placeholder="https://…" /></Field>
          )}
        </Group>
        <Group title="Wording" defaultOpen={false}>
          <Field label="Eyebrow" hint="Small label above the headline"><TextField value={str(c.eyebrow)} onChange={(v) => onConfig({ eyebrow: v })} placeholder={def.eyebrow} /></Field>
          <Field label="Headline"><TextField value={str(c.headline)} onChange={(v) => onConfig({ headline: v })} placeholder={def.headline} /></Field>
          <Field label="Subtext"><TextField value={str(c.sub)} onChange={(v) => onConfig({ sub: v })} placeholder={def.sub} /></Field>
          <Field label="Scan hint"><TextField value={str(c.hint)} onChange={(v) => onConfig({ hint: v })} placeholder={def.hint} /></Field>
        </Group>
      </>
    );
  }
  if (t === "stack") return <StackContent node={node} boards={boards} feeds={feeds} weather={weather} logos={logos} onConfig={onConfig} />;
  return null;
}

/** A column picker fed by a source's live columns (for the ticker's headline
 *  column). Falls back to a free-text field before the columns have loaded. */
function SourceColumnField({ feedId, value, onChange, hint }: { feedId: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [cols, setCols] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    getSourceData(feedId).then((ds) => { if (live) setCols(ds.columns); }).catch(() => {});
    return () => { live = false; };
  }, [feedId]);
  return (
    <Field label="Column" hint={hint}>
      {cols.length > 0
        ? <SelectField value={cols.includes(value) ? value : (cols[0] ?? "")} onChange={onChange} options={cols.map((c) => ({ id: c, label: c }))} />
        : <TextField value={value} onChange={onChange} placeholder="title" />}
    </Field>
  );
}

/** A datetime-local input styled to match the panel. */
function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />;
}

/** Repeatable label · note · value rows for the menu widget. */
function MenuItemsEditor({ node, onConfig }: { node: WNode; onConfig: (p: Record<string, unknown>) => void }) {
  const items: MenuItem[] = menuItems(node.config);
  const set = (next: MenuItem[]) => onConfig({ items: next });
  const patch = (i: number, p: Partial<MenuItem>) => set(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= items.length) return; const next = [...items]; const t = next[i]!; next[i] = next[j]!; next[j] = t; set(next); };
  return (
    <Group title={`Items (${items.length})`}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-lg border p-1.5">
          <div className="flex items-center gap-1">
            <TextField value={it.label ?? ""} onChange={(v) => patch(i, { label: v })} placeholder="Label" />
            <span className="w-[92px] shrink-0"><TextField value={it.value ?? ""} onChange={(v) => patch(i, { value: v })} placeholder="Value" /></span>
          </div>
          <div className="flex items-center gap-1">
            <TextField value={it.note ?? ""} onChange={(v) => patch(i, { note: v })} placeholder="Note (optional)" />
            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ChevronDown className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => set(items.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => set([...items, { label: "New item", value: "" }])}>+ Add item</Button>
    </Group>
  );
}

function StackContent({ node, boards, feeds, weather, logos, onConfig }: { node: WNode; boards: Board[]; feeds: Feed[]; weather: WeatherLocation[]; logos?: BrandLogo[]; onConfig: (p: Record<string, unknown>) => void }) {
  const items: StackItem[] = stackItems(node.config);
  const setItems = (next: StackItem[]) => onConfig({ items: next });
  const patchWidget = (i: number, w: Partial<StackItem["widget"]>) => setItems(items.map((it, j) => (j === i ? { ...it, widget: { ...it.widget, ...w } } : it)));
  const setType = (i: number, type: string) => { const d = defaultsFor(type); patchWidget(i, { type, style: d.style, config: d.config }); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items]; const t = next[i]!; next[i] = next[j]!; next[j] = t; setItems(next);
  };
  const add = () => setItems([...items, { id: `s${Date.now().toString(36)}`, widget: { type: "text", style: { color: "#ffffff", fontSize: 72, fontWeight: "700", align: "center" }, config: { text: "New slide" } } }]);
  return (
    <>
      <Group title={`Slides (${items.length})`}>
        {items.map((it, i) => (
          <StackItemEditor
            key={it.id}
            index={i} total={items.length} item={it} parent={node}
            boards={boards} feeds={feeds} weather={weather} logos={logos}
            onType={(t) => setType(i, t)}
            onStyle={(p) => patchWidget(i, { style: { ...it.widget.style, ...p } })}
            onConfig={(p) => patchWidget(i, { config: { ...it.widget.config, ...p } })}
            onMove={(d) => move(i, d)}
            onRemove={() => setItems(items.filter((_, j) => j !== i))}
          />
        ))}
        <Button variant="outline" size="sm" onClick={add}>+ Add slide</Button>
      </Group>
      <Group title="Playback">
        <Field label="Dwell" hint="Seconds each slide is shown"><NumberField value={num(node.config.dwellMs, 5000) / 1000} onChange={(v) => onConfig({ dwellMs: Math.max(1, v) * 1000 })} min={1} step={0.5} suffix="s" /></Field>
        <Field label="Transition"><SegField value={stackTransition(node.config)} onChange={(v) => onConfig({ transition: v })} options={STACK_TRANSITIONS.map((t) => ({ id: t.id, label: t.label }))} /></Field>
        <SwitchField label="Shuffle order" value={stackShuffle(node.config)} onChange={(v) => onConfig({ shuffle: v })} />
      </Group>
    </>
  );
}

/** Editor for one stack item — a fully-configurable child widget. Reuses the
 *  Content + Style tabs against a pseudo-node backed by the item's widget. */
function StackItemEditor({ index, total, item, parent, boards, feeds, weather, logos, onType, onStyle, onConfig, onMove, onRemove }: {
  index: number; total: number; item: StackItem; parent: WNode;
  boards: Board[]; feeds: Feed[]; weather: WeatherLocation[]; logos?: BrandLogo[];
  onType: (t: string) => void; onStyle: (p: Record<string, unknown>) => void; onConfig: (p: Record<string, unknown>) => void;
  onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const itemNode: WNode = { id: item.id, type: item.widget.type as WNode["type"], x: 0, y: 0, w: parent.w, h: parent.h, rot: 0, z: 0, style: item.widget.style, config: item.widget.config };
  const noop = () => {};
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-0.5 bg-muted/40 px-1.5 py-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-1.5 text-xs font-medium">
          <ChevronDown className={cnRotate(!open)} />
          Slide {index + 1}
          <span className="text-[10px] font-normal text-muted-foreground">· {widgetDef(item.widget.type)?.label ?? item.widget.type}</span>
        </button>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" disabled={index === total - 1} onClick={() => onMove(1)}><ChevronDown className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive" onClick={onRemove}><Trash2 className="size-3.5" /></Button>
      </div>
      {open && (
        <div className="px-2 pb-1">
          <Field label="Widget"><SelectField value={item.widget.type} onChange={onType} options={STACK_ITEM_TYPES.map((t) => ({ id: t, label: widgetDef(t)?.label ?? t }))} /></Field>
          <ContentTab node={itemNode} boards={boards} feeds={feeds} weather={weather} logos={logos} onGeom={noop} onStyle={onStyle} onConfig={onConfig} />
          <StyleTab node={itemNode} boards={boards} feeds={feeds} weather={weather} logos={logos} onGeom={noop} onStyle={onStyle} onConfig={onConfig} />
        </div>
      )}
    </div>
  );
}

function cnRotate(collapsed: boolean): string {
  return `size-3.5 transition-transform${collapsed ? " -rotate-90" : ""}`;
}

/* --------------------------------- Style --------------------------------- */

const RKEY = ["radiusTL", "radiusTR", "radiusBR", "radiusBL"] as const;
const BKEY = ["borderWT", "borderWR", "borderWB", "borderWL"] as const;

function StyleTab({ node, onStyle }: Props) {
  const s = node.style;
  const t = node.type;
  const rAll = num(s.radius, 0);
  const bAll = num(s.borderW ?? s.strokeWidth, 0);
  const showRadius = t !== "line" && t !== "circle" && t !== "triangle";
  const showBorder = t !== "line" && t !== "triangle";
  return (
    <div>
      {TEXTY.has(t) && (
        <Group title="Typography">
          <Field label="Color"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
          <Field label="Font"><SelectField value={str(s.font, t === "clock" ? "mono" : "sans")} onChange={(v) => onStyle({ font: v })} options={FONT_CHOICES} /></Field>
          <Field label="Size"><SliderField value={num(s.fontSize, 48)} onChange={(v) => onStyle({ fontSize: v })} min={12} max={320} /></Field>
          <Field label="Weight"><SelectField value={str(s.fontWeight, "600")} onChange={(v) => onStyle({ fontWeight: v })} options={opt([["300", "Light"], ["400", "Regular"], ["600", "Semibold"], ["800", "Bold"], ["900", "Black"]])} /></Field>
          <Field label="Align"><SegField value={str(node.config.align ?? s.align, t === "text" ? "left" : "center")} onChange={(v) => onStyle({ align: v })} options={opt([["left", "L"], ["center", "C"], ["right", "R"]])} /></Field>
          <Field label="Letter sp."><SliderField value={num(s.letterSpacing, 0)} onChange={(v) => onStyle({ letterSpacing: v })} min={-5} max={30} /></Field>
          <Field label="Line height"><SliderField value={num(s.lineHeight, 1.1) * 100} onChange={(v) => onStyle({ lineHeight: v / 100 })} min={80} max={250} /></Field>
          <Field label="Case"><SelectField value={str(s.textTransform, "none")} onChange={(v) => onStyle({ textTransform: v })} options={opt([["none", "As typed"], ["uppercase", "UPPER"], ["lowercase", "lower"], ["capitalize", "Capitalize"]])} /></Field>
          {t === "text" && (
            <>
              <SwitchField label="Gradient text" value={bool(s.gradientText)} onChange={(v) => onStyle({ gradientText: v, gradient: v && !s.gradient ? { from: "oklch(0.8 0.16 85)", to: "oklch(0.7 0.2 25)", angle: 90 } : s.gradient })} />
              {bool(s.gradientText) && <FillControl node={node} onStyle={onStyle} gradientOnly />}
              <Field label="Outline"><SliderField value={num(s.textStrokeW, 0)} onChange={(v) => onStyle({ textStrokeW: v })} min={0} max={12} /></Field>
              {num(s.textStrokeW, 0) > 0 && <Field label="Outline col"><ColorField value={str(s.textStrokeColor, "#000000")} onChange={(v) => onStyle({ textStrokeColor: v })} fallback="#000000" /></Field>}
            </>
          )}
        </Group>
      )}

      {(t === "clock" || t === "date") && (
        <Group title="Card" defaultOpen={false}>
          <SurfaceControl node={node} onStyle={onStyle} />
        </Group>
      )}

      {SHAPES.has(t) && (
        <Group title="Fill"><FillControl node={node} onStyle={onStyle} /></Group>
      )}

      {t === "line" && (
        <Group title="Line">
          <Field label="Color"><ColorField value={str(s.fill ?? s.color, "#ffffff")} onChange={(v) => onStyle({ fill: v, color: v })} /></Field>
          <Field label="Style"><SelectField value={str(s.lineStyle, "solid")} onChange={(v) => onStyle({ lineStyle: v })} options={LINE_STYLES.map((l) => ({ id: l.id, label: l.label }))} /></Field>
          {str(s.lineStyle, "solid") === "gradient" && (
            <>
              <Field label="From"><ColorField value={str((s.gradient as { from?: string } | undefined)?.from, "#7c3aed")} onChange={(v) => onStyle({ gradient: { ...(s.gradient as object), from: v } })} /></Field>
              <Field label="To"><ColorField value={str((s.gradient as { to?: string } | undefined)?.to, "#2563eb")} onChange={(v) => onStyle({ gradient: { ...(s.gradient as object), to: v } })} /></Field>
            </>
          )}
          <Field label="Thickness"><SliderField value={num(s.thickness, 6)} onChange={(v) => onStyle({ thickness: v })} min={1} max={80} /></Field>
          {str(s.lineStyle, "solid") !== "dashed" && str(s.lineStyle, "solid") !== "dotted" && <Field label="Caps"><SegField value={str(s.lineCap, "round")} onChange={(v) => onStyle({ lineCap: v })} options={opt([["round", "Round"], ["square", "Square"]])} /></Field>}
        </Group>
      )}

      {t === "image" && (
        <Group title="Photo" defaultOpen={false}>
          <Field label="Tint" hint="A colour wash over the image (e.g. oklch(0.2 0.05 280 / 0.35))"><ColorField value={str(s.tint)} onChange={(v) => onStyle({ tint: v })} fallback="#00000000" /></Field>
          <Field label="Grayscale"><SliderField value={num(s.grayscale, 0)} onChange={(v) => onStyle({ grayscale: v })} min={0} max={100} /></Field>
          <Field label="Brightness"><SliderField value={num(s.brightness, 100)} onChange={(v) => onStyle({ brightness: v })} min={0} max={200} /></Field>
          <Field label="Contrast"><SliderField value={num(s.contrast, 100)} onChange={(v) => onStyle({ contrast: v })} min={0} max={200} /></Field>
          <Field label="Saturation"><SliderField value={num(s.saturate, 100)} onChange={(v) => onStyle({ saturate: v })} min={0} max={200} /></Field>
          <Field label="Blur"><SliderField value={num(s.imgBlur, 0)} onChange={(v) => onStyle({ imgBlur: v })} min={0} max={40} /></Field>
        </Group>
      )}

      {t === "ticker" && <TickerStyle node={node} onStyle={onStyle} />}

      {t === "countdown" && (
        <Group title="Countdown">
          <Field label="Content size" hint="Scale the inner content within the box (100% = fit)"><SliderField value={Math.round(num(s.contentScale, 1) * 100)} onChange={(v) => onStyle({ contentScale: v / 100 })} min={40} max={200} /></Field>
          <Field label="Digits"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
          <Field label="Block fill" hint="Behind each unit (Blocks variant)"><ColorField value={str(s.accent, "oklch(0.22 0.03 300 / 0.6)")} onChange={(v) => onStyle({ accent: v })} fallback="#241f33" /></Field>
          <Field label="Font"><SelectField value={str(s.font, "sans")} onChange={(v) => onStyle({ font: v })} options={FONT_CHOICES} /></Field>
          <Field label="Weight"><SelectField value={str(s.fontWeight, "800")} onChange={(v) => onStyle({ fontWeight: v })} options={opt([["600", "Semibold"], ["800", "Bold"], ["900", "Black"]])} /></Field>
          <Field label="Panel fill" hint="Optional backdrop for the whole widget"><ColorField value={str(s.panelBg)} onChange={(v) => onStyle({ panelBg: v })} fallback="#00000000" /></Field>
        </Group>
      )}

      {t === "metric" && (
        <Group title="Metric">
          <Field label="Content size" hint="Scale the inner content within the box (100% = fit)"><SliderField value={Math.round(num(s.contentScale, 1) * 100)} onChange={(v) => onStyle({ contentScale: v / 100 })} min={40} max={200} /></Field>
          <SurfaceControl node={node} onStyle={onStyle} />
          <Field label="Text"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
          <Field label="Accent" hint="Ring + up-trend colour"><ColorField value={str(s.accent, "oklch(0.72 0.19 300)")} onChange={(v) => onStyle({ accent: v })} fallback="#a855f7" /></Field>
        </Group>
      )}

      {t === "menu" && (
        <Group title="Menu">
          <Field label="Content size" hint="Scale the inner text within the box (100% = fit)"><SliderField value={Math.round(num(s.contentScale, 1) * 100)} onChange={(v) => onStyle({ contentScale: v / 100 })} min={40} max={200} /></Field>
          <SurfaceControl node={node} onStyle={onStyle} />
          <Field label="Text"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
          <Field label="Accent" hint="Values + title underline"><ColorField value={str(s.accent, "oklch(0.78 0.14 85)")} onChange={(v) => onStyle({ accent: v })} fallback="#e6c15a" /></Field>
          <Field label="Weight"><SelectField value={str(s.fontWeight, "700")} onChange={(v) => onStyle({ fontWeight: v })} options={opt([["500", "Regular"], ["600", "Semibold"], ["700", "Bold"]])} /></Field>
        </Group>
      )}

      {t === "qr" && (
        <Group title="QR code">
          <Field label="Modules" hint="The dark squares"><ColorField value={str(s.color, "#0b0b0f")} onChange={(v) => onStyle({ color: v })} fallback="#0b0b0f" /></Field>
          <Field label="Paper" hint="The code's own background — keep it light so it scans"><ColorField value={str(s.paper, "#ffffff")} onChange={(v) => onStyle({ paper: v })} fallback="#ffffff" /></Field>
          <div className="pt-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Card (optional)</div>
          <SurfaceControl node={node} onStyle={onStyle} />
          <Field label="Padding" hint="Inset the code inside the card"><SliderField value={num(s.pad, 0)} onChange={(v) => onStyle({ pad: v })} min={0} max={24} /></Field>
          <Field label="Corners"><SliderField value={num(s.radius, 0)} onChange={(v) => onStyle({ radius: v })} min={0} max={64} /></Field>
        </Group>
      )}

      {t === "cta" && (
        <Group title="Scan card">
          <Field label="Accent" hint="Icon + pulse ring colour"><ColorField value={str(s.accent, "oklch(0.72 0.19 300)")} onChange={(v) => onStyle({ accent: v })} fallback="#a855f7" /></Field>
          <Field label="Text"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
          <SwitchField label="Animate" value={bool(s.animate, true)} onChange={(v) => onStyle({ animate: v })} />
          <div className="pt-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Card</div>
          <SurfaceControl node={node} onStyle={onStyle} />
          <Field label="QR modules"><ColorField value={str(s.qrDark, "#0b0b0f")} onChange={(v) => onStyle({ qrDark: v })} fallback="#0b0b0f" /></Field>
          <Field label="QR paper" hint="Keep light so it scans"><ColorField value={str(s.qrLight, "#ffffff")} onChange={(v) => onStyle({ qrLight: v })} fallback="#ffffff" /></Field>
        </Group>
      )}

      {t === "nowplaying" && (
        <Group title="Now Playing">
          <ContentSizeField s={s} onStyle={onStyle} />
          <SurfaceControl node={node} onStyle={onStyle} />
          <Field label="Text"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
          <Field label="Accent"><ColorField value={str(s.accent, "oklch(0.72 0.19 300)")} onChange={(v) => onStyle({ accent: v })} fallback="#a855f7" /></Field>
        </Group>
      )}

      {t === "room_status" && (
        <Group title="Room status">
          <ContentSizeField s={s} onStyle={onStyle} />
          <SurfaceControl node={node} onStyle={onStyle} />
        </Group>
      )}

      {(t === "stack" || t === "weather" || t === "queue_caller" || t === "room_board" || t === "scoreboard") && (
        <Group title="Panel">
          {t !== "stack" && <ContentSizeField s={s} onStyle={onStyle} />}
          <SurfaceControl node={node} onStyle={onStyle} />
          {(t === "stack" || t === "weather") && <Field label="Text"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>}
          {t === "stack" && <Field label="Font size"><SliderField value={num(s.fontSize, 64)} onChange={(v) => onStyle({ fontSize: v })} min={16} max={200} /></Field>}
        </Group>
      )}

      {showBorder && (
        <Group title="Border" defaultOpen={false}>
          <Field label="Style"><SelectField value={str(s.borderStyle, bAll > 0 ? "solid" : "none")} onChange={(v) => onStyle({ borderStyle: v })} options={opt([["none", "None"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["double", "Double"]])} /></Field>
          {str(s.borderStyle, bAll > 0 ? "solid" : "none") !== "none" && (
            <>
              <Field label="Color"><ColorField value={str(s.borderColor ?? s.stroke, "#ffffff")} onChange={(v) => onStyle({ borderColor: v })} /></Field>
              <Field label="Width">
                <QuadField key={`bw-${node.id}`} all={bAll} sides={[num(s.borderWT, bAll), num(s.borderWR, bAll), num(s.borderWB, bAll), num(s.borderWL, bAll)]} labels={["T", "R", "B", "L"]}
                  onAll={(v) => onStyle({ borderW: v, borderWT: undefined, borderWR: undefined, borderWB: undefined, borderWL: undefined })}
                  onSide={(i, v) => onStyle({ [BKEY[i]!]: v })} min={0} max={60} />
              </Field>
            </>
          )}
        </Group>
      )}

      {/* Shared appearance — available to every widget */}
      <Group title="Appearance" defaultOpen={SHAPES.has(t) || t === "line"}>
        {showRadius && (
          <Field label="Radius">
            <QuadField key={`rad-${node.id}`} all={rAll} sides={[num(s.radiusTL, rAll), num(s.radiusTR, rAll), num(s.radiusBR, rAll), num(s.radiusBL, rAll)]} labels={["TL", "TR", "BR", "BL"]}
              onAll={(v) => onStyle({ radius: v, radiusTL: undefined, radiusTR: undefined, radiusBR: undefined, radiusBL: undefined })}
              onSide={(i, v) => onStyle({ [RKEY[i]!]: v })} min={0} max={400} />
          </Field>
        )}
        <Field label="Shadow"><SelectField value={shadowId(s.shadow)} onChange={(v) => onStyle({ shadow: v })} options={SHADOW_PRESETS.map((p) => ({ id: p.id, label: p.label }))} /></Field>
        <Field label="Backdrop blur" hint="Frosts whatever is behind the widget"><SliderField value={num(s.blur, 0)} onChange={(v) => onStyle({ blur: v })} min={0} max={40} /></Field>
        <Field label="Opacity"><SliderField value={num(s.opacity, 1) * 100} onChange={(v) => onStyle({ opacity: v / 100 })} min={0} max={100} /></Field>
      </Group>
    </div>
  );
}

/** Fill control: solid, or a two-stop gradient when toggled on. In `gradientOnly`
 *  mode (used for gradient *text*) it drops the toggle + solid path and always
 *  edits the gradient stops. */
/** The container "surface": brand Glass (default), a Solid colour, or None
 *  (transparent — for a widget placed over its own coloured rectangle/photo). */
/** The shared "Content size" knob — scales a widget's inner content within its
 *  box (style.contentScale, 100% = fit). Used by every content-sizeable widget. */
function ContentSizeField({ s, onStyle }: { s: Record<string, unknown>; onStyle: (p: Record<string, unknown>) => void }) {
  return (
    <Field label="Content size" hint="Scale the inner content within the box (100% = fit)">
      <SliderField value={Math.round(num(s.contentScale, 1) * 100)} onChange={(v) => onStyle({ contentScale: v / 100 })} min={40} max={200} />
    </Field>
  );
}

function SurfaceControl({ node, onStyle }: { node: WNode; onStyle: (p: Record<string, unknown>) => void }) {
  const bg = str(node.style.bg);
  const isNone = bg === "transparent" || bg === "none";
  const isGlass = !isNone && (bg === "" || bg.startsWith("var(--w-surface"));
  const mode = isNone ? "none" : isGlass ? "glass" : "solid";
  return (
    <>
      <Field label="Surface" hint="Glass is brand-tinted; None lets the content behind show through">
        <SegField
          value={mode}
          onChange={(v) => {
            if (v === "glass") onStyle({ bg: "var(--w-surface)", fill: undefined, gradient: null });
            else if (v === "none") onStyle({ bg: "transparent", fill: undefined, gradient: null });
            else onStyle({ bg: isGlass || isNone ? "#14121c" : bg, fill: undefined, gradient: null });
          }}
          options={opt([["glass", "Glass"], ["solid", "Solid"], ["none", "None"]])}
        />
      </Field>
      {mode === "solid" && <Field label="Colour"><ColorField value={bg || "#14121c"} onChange={(v) => onStyle({ bg: v, fill: undefined, gradient: null })} /></Field>}
    </>
  );
}

function FillControl({ node, onStyle, gradientOnly = false }: { node: WNode; onStyle: (p: Record<string, unknown>) => void; gradientOnly?: boolean }) {
  const s = node.style;
  const g = (s.gradient as { from?: string; to?: string; angle?: number } | undefined) ?? undefined;
  const on = gradientOnly || (!!g && (!!g.from || !!g.to));
  return (
    <>
      {!gradientOnly && (
        <SwitchField label="Gradient fill" value={on} onChange={(v) => onStyle({ gradient: v ? { from: str(s.fill, "oklch(0.62 0.19 300)"), to: "oklch(0.5 0.2 220)", angle: 135 } : null })} />
      )}
      {on ? (
        <>
          <Field label="From"><ColorField value={str(g?.from, "#7c3aed")} onChange={(v) => onStyle({ gradient: { ...g, from: v } })} /></Field>
          <Field label="To"><ColorField value={str(g?.to, "#2563eb")} onChange={(v) => onStyle({ gradient: { ...g, to: v } })} /></Field>
          <Field label="Angle"><SliderField value={num(g?.angle, 135)} onChange={(v) => onStyle({ gradient: { ...g, angle: v } })} min={0} max={360} /></Field>
        </>
      ) : (
        <Field label="Fill"><ColorField value={str(s.fill ?? s.bg, "#7c3aed")} onChange={(v) => onStyle({ fill: v })} /></Field>
      )}
    </>
  );
}

/** Ticker-specific styling: strip colours, typography, crawl speed/direction, and
 *  item spacing. Radius/border/shadow come from the shared groups below. */
function TickerStyle({ node, onStyle }: { node: WNode; onStyle: (p: Record<string, unknown>) => void }) {
  const s = node.style;
  return (
    <Group title="Ticker">
      <Field label="Backdrop"><SegField value={str(s.bg) === "transparent" || str(s.bg) === "none" ? "none" : "solid"} onChange={(v) => onStyle({ bg: v === "none" ? "transparent" : "oklch(0.15 0.01 300 / 0.72)" })} options={opt([["solid", "Solid"], ["none", "None"]])} /></Field>
      {str(s.bg) !== "transparent" && str(s.bg) !== "none" && <Field label="Backdrop col"><ColorField value={str(s.bg, "oklch(0.15 0.01 300 / 0.72)")} onChange={(v) => onStyle({ bg: v })} fallback="#141018" /></Field>}
      <Field label="Text"><ColorField value={str(s.color, "#ffffff")} onChange={(v) => onStyle({ color: v })} /></Field>
      <Field label="Font"><SelectField value={str(s.font, "sans")} onChange={(v) => onStyle({ font: v })} options={FONT_CHOICES} /></Field>
      <Field label="Size"><SliderField value={num(s.fontSize, 40)} onChange={(v) => onStyle({ fontSize: v })} min={16} max={140} /></Field>
      <Field label="Weight"><SelectField value={str(s.fontWeight, "600")} onChange={(v) => onStyle({ fontWeight: v })} options={opt([["400", "Regular"], ["600", "Semibold"], ["700", "Bold"], ["800", "Heavy"]])} /></Field>
      <Field label="Speed" hint="Crawl speed in pixels per second"><SliderField value={num(s.speed, 90)} onChange={(v) => onStyle({ speed: v })} min={20} max={320} /></Field>
      <Field label="Direction"><SegField value={str(s.direction, "left")} onChange={(v) => onStyle({ direction: v })} options={opt([["left", "← Left"], ["right", "Right →"]])} /></Field>
      <Field label="Item gap" hint="Extra space between items"><SliderField value={num(s.gap, 0)} onChange={(v) => onStyle({ gap: v })} min={0} max={8} step={0.25} /></Field>
    </Group>
  );
}

/* --------------------------------- Layout -------------------------------- */

function LayoutTab({ node, onGeom }: Props) {
  const t = node.type;
  return (
    <div>
      <Group title="Position & size">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X"><NumberField value={node.x} onChange={(v) => onGeom({ x: v })} /></Field>
          <Field label="Y"><NumberField value={node.y} onChange={(v) => onGeom({ y: v })} /></Field>
          <Field label="W"><NumberField value={node.w} onChange={(v) => onGeom({ w: v })} /></Field>
          <Field label="H"><NumberField value={node.h} onChange={(v) => onGeom({ h: v })} /></Field>
        </div>
        <Field label="Rotation"><SliderField value={node.rot} onChange={(v) => onGeom({ rot: v })} min={-180} max={180} /></Field>
        <Field label="Layer z"><NumberField value={node.z} onChange={(v) => onGeom({ z: v })} /></Field>
      </Group>
      {SCALEABLE.has(t) && (
        <Group title="Resize behaviour">
          <SegField value={(node.scaleMode ?? "reflow") as ScaleMode} onChange={(v) => onGeom({ scaleMode: v })} options={opt([["uniform", "Scale content"], ["reflow", "Reflow / fill"]]) as { id: ScaleMode; label: string }[]} />
          <p className="text-[10.5px] text-muted-foreground">{(node.scaleMode ?? "reflow") === "uniform" ? "Content scales as a unit when resized — never crops." : "Content fills the box and reflows to fit."}</p>
        </Group>
      )}
      <DisplayTimeControl display={node.display} onGeom={onGeom} />
    </div>
  );
}

/** Timed display (§17) — any widget can be always on, or shown for a stretch on a
 *  repeating cycle so a promo/CTA shares the canvas instead of owning it. Edits the
 *  node's top-level `display` field (behavioural, not style/content). */
function DisplayTimeControl({ display, onGeom }: { display?: DisplaySchedule; onGeom: (p: Partial<WNode>) => void }) {
  const timed = display?.mode === "interval";
  const showSec = Math.max(1, num(display?.showSec, 10));
  const everySec = Math.max(showSec, num(display?.everySec, 60));
  const anim = (display?.anim ?? "rise") as DisplayAnim;
  const setTimed = (on: boolean) => onGeom({ display: on ? { mode: "interval", showSec, everySec, anim } : undefined });
  const patch = (p: Partial<DisplaySchedule>) => {
    const next = { mode: "interval" as const, showSec, everySec, anim, ...p };
    if (next.everySec < next.showSec) next.everySec = next.showSec;
    onGeom({ display: next });
  };
  return (
    <Group title="Display time">
      <SegField value={timed ? "timed" : "always"} onChange={(v) => setTimed(v === "timed")} options={opt([["always", "Always on"], ["timed", "Show on a cycle"]])} />
      {timed && (
        <>
          <Field label="Show for (s)" hint="How long it stays on screen each cycle"><SliderField value={showSec} onChange={(v) => patch({ showSec: v })} min={2} max={120} /></Field>
          <Field label="Every (s)" hint="Length of the full on + off cycle"><SliderField value={everySec} onChange={(v) => patch({ everySec: v })} min={5} max={600} /></Field>
          <Field label="Entrance" hint="How it animates on and off — never a hard pop"><SelectField value={anim} onChange={(v) => patch({ anim: v as DisplayAnim })} options={DISPLAY_ANIMS.map((a) => ({ id: a.id, label: a.label }))} /></Field>
          <p className="text-[10.5px] text-muted-foreground">{displaySummary({ mode: "interval", showSec, everySec })}. Screens stay in sync.</p>
        </>
      )}
    </Group>
  );
}
