/**
 * PRINTING LABELS — the step that closes the scan-first loop.
 *
 * Everything a manufacturer sends arrives with a barcode already on it. Anything
 * the CENTRE creates — a tray assembled this morning, an instrument registered
 * last week — has none until somebody prints one, and until then its code is
 * typed. Typing a code is the thing this whole product exists to remove, so a
 * scan-first app without a print step is only half the loop.
 *
 * ── Why a print SHEET and not a label-printer driver ────────────────────────
 *
 * A browser cannot talk to a Zebra over USB, and the protocols differ per
 * vendor. What every centre already has is a printer and a sheet of adhesive
 * labels, so this renders to that: a grid the browser prints, sized in
 * millimetres so it lands the same on A4 in Berlin as on Letter anywhere else.
 * A vendor-specific driver is a real feature for a customer who asks; it is not
 * the thing standing between a centre and a working loop today.
 *
 * ── What is on a label, and what is deliberately not ────────────────────────
 *
 * The code, as text AND as a barcode; what the thing is; and for a released tray
 * its expiry. Nothing else. It is read at arm's length in a store room, and
 * every extra line shrinks the two that matter. In particular there is no case
 * reference and nothing about a person — TESSA.md Rule 1 does not stop at the
 * database.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Button, Callout, Group, ListChecks, LoadError, Row, RotateCcw, Screen, SegmentedControl, Section, Skeleton, Switch, useLoad } from "@4dl/ui";
import { Barcode } from "../Barcode.js";
import { cssd, fmt, type Instrument, type Pack } from "../data.js";
import { useExpiryText, useT } from "../i18n.js";

interface Label {
  id: string;
  code: string;
  title: string;
  sub: string | null;
}

export function Labels() {
  const nav = useNavigate();
  const t = useT();
  const expiryText = useExpiryText();
  const [kind, setKind] = useState<"trays" | "instruments">("trays");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const load = useCallback(
    async () => (kind === "trays" ? { packs: (await cssd.packs()).packs, units: [] as Instrument[] } : { packs: [] as Pack[], units: (await cssd.instruments()).instruments }),
    [kind],
  );
  const { data, error, loading, reload } = useLoad(load, "labels", fmt);

  if (error) return <Screen><LoadError what="labels" error={error} onRetry={reload} /></Screen>;

  const labels: Label[] = !data
    ? []
    : kind === "trays"
      ? data.packs.map((p) => ({ id: p.id, code: p.label_code, title: p.recipe_name ?? t("cssd.tray"), sub: p.expiry ? expiryText(p) : null }))
      : data.units.map((u) => ({ id: u.id, code: u.label_code, title: u.item_name ?? t("labels.instruments"), sub: u.serial ? t("common.serial", { serial: u.serial }) : null }));

  const selected = labels.filter((l) => chosen.has(l.id));
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {/* `print:hidden` — the chooser is scaffolding, not the deliverable. */}
      <Screen className="print:hidden">
        <Section>
          <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
            <ArrowLeft className="size-4" /> {t("common.back")}
          </Button>
        </Section>

        <Section title={t("labels.title")}>
          <SegmentedControl
            value={kind}
            onChange={(k) => {
              setKind(k);
              // Selections do not survive the switch: they are ids from a
              // different list, and carrying them would print a stack of labels
              // nobody chose.
              setChosen(new Set());
            }}
            options={[
              { value: "trays", label: t("cssd.trays") },
              { value: "instruments", label: t("labels.instruments") },
            ]}
          />
        </Section>

        {loading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : labels.length === 0 ? (
          <Callout tone="neutral" icon={kind === "trays" ? ListChecks : RotateCcw}>
{t("labels.empty")}
          </Callout>
        ) : (
          <Section
            action={
              <Button size="sm" variant="ghost" onClick={() => setChosen(chosen.size === labels.length ? new Set() : new Set(labels.map((l) => l.id)))}>
                {chosen.size === labels.length ? t("labels.none") : t("labels.all")}
              </Button>
            }
          >
            <Group>
              {labels.map((l, i) => (
                <Row
                  key={l.id}
                  sub={l.title}
                  divider={i < labels.length - 1}
                  trailing={<Switch checked={chosen.has(l.id)} onCheckedChange={() => toggle(l.id)} aria-label={t("labels.printOne", { code: l.code })} />}
                >
                  {l.code}
                </Row>
              ))}
            </Group>
          </Section>
        )}

        <Section>
          <Button className="w-full" disabled={selected.length === 0} onClick={() => window.print()}>
{t("labels.print", { count: selected.length })}
          </Button>
          <p className="px-4 pt-3 text-center text-caption text-muted-foreground">
{t("labels.hint")}
          </p>
        </Section>
      </Screen>

      {/**
       * The sheet itself: hidden on screen, and the ONLY thing on paper.
       *
       * Sized in millimetres rather than in the app's spacing scale — a label has
       * to come out of the printer at a size that matches the adhesive stock,
       * which no `rem` can promise.
       *
       * design-tokens-exempt: PAPER IS NOT A THEME. Everything below is printed
       * on white adhesive stock, so black ink and physical units are the only
       * correct choices — the tokens describe a screen that follows a tenant's
       * brand, and a label that followed a pale brand colour would come out of
       * the printer unreadable. The exemption is scoped to this block; every
       * on-screen surface in this file is still checked.
       */}
      <div className="hidden print:block">
        <div className="grid grid-cols-2 gap-0">
          {selected.map((l) => (
            /* design-tokens-exempt: the cut guide, printed. */
            <div key={l.id} className="flex h-[30mm] w-[70mm] flex-col justify-between overflow-hidden border border-dashed border-black/20 p-[3mm]">
              {/* design-tokens-exempt: black ink on white stock. */}
              <div className="text-[9pt] leading-tight text-black">
                <div className="font-semibold">{l.code}</div>
                <div className="truncate">{l.title}</div>
              </div>
              <Barcode value={l.code} height={40} className="h-[10mm] w-full" />
              {/* design-tokens-exempt: black ink on white stock. */}
              {l.sub && <div className="text-[7pt] leading-none text-black">{l.sub}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
