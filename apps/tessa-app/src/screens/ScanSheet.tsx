/**
 * THE SCAN SHEET — one camera, then a decision.
 *
 * Every flow in Tessa begins by pointing a phone at something, and the thing
 * being pointed at could be four different kinds of object. Making the person
 * choose FIRST ("what are you about to scan?") is the design most inventory apps
 * land on and it is wrong: they are holding a box, they know what it is, and the
 * app can work it out.
 *
 * So: scan, then identify, then offer only the actions that apply.
 *
 *   a GS1 element string   → a product. Receive it, or use from it.
 *   a tray label           → a pack. Open it, or put it in a load.
 *   an instrument label    → a unit. Reprocess it, retire it.
 *   anything else          → say so, and offer to add it to the catalog.
 *
 * ── The manual field is not a fallback ──────────────────────────────────────
 *
 * A hand-held USB scanner — which most stock rooms already own — presents as a
 * KEYBOARD. Typing into that box IS how the cheapest hardware in the building
 * works, so the field is always present and focused, not hidden behind "having
 * trouble?". The camera is the convenience.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseGs1 } from "@tessa/domain";
import { Archive, Button, Callout, CircleAlert, Field, Group, ListChecks, RotateCcw, Row, ScanLine, Sheet, Spinner } from "@4dl/ui";
import { makeDebouncer, startScan, type ScanError } from "../scan.js";
import { cssd, stock, type Instrument, type Pack } from "../data.js";
import { useT } from "../i18n.js";
import { ReceiveSheet } from "./ReceiveSheet.js";

type Found =
  | { kind: "product"; barcode: string; gtin: string | null; lot: string | null; expiry: string | null }
  | { kind: "pack"; pack: Pack }
  | { kind: "instrument"; instrument: Instrument }
  | { kind: "unknown"; raw: string };

export function ScanSheet({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const t = useT();
  /**
   * A callback ref held in STATE, not a `useRef`.
   *
   * The video lives inside the sheet's portal, which is not in the DOM on the
   * first render — so a `useRef` reads null, the effect below bails, and nothing
   * ever re-runs it because no dependency changed. The camera is then never
   * requested at all, and the sheet sits on "Starting the camera…" forever. It
   * typechecks, throws nothing, and logs nothing; only opening the sheet in a
   * real browser shows it.
   */
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [camera, setCamera] = useState<ScanError | null>(null);
  /** A frame has actually arrived — not merely "we asked for a camera". */
  const [ready, setReady] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [receiving, setReceiving] = useState<{ barcode: string } | null>(null);

  /**
   * Work out what was scanned.
   *
   * The GS1 parse is tried FIRST and its verdict is trusted: an element string
   * carrying a valid GTIN is not ambiguous with a label code, and `parseGs1`
   * withholds the GTIN rather than guessing when the check digit fails
   * (TESSA.md §2.1). Only when it yields nothing do we ask the server whether
   * this is one of our own printed labels.
   */
  const identify = useCallback(async (raw: string) => {
    setBusy(true);
    try {
      const scan = parseGs1(raw, new Date());
      if (scan?.gtin) {
        setFound({ kind: "product", barcode: raw, gtin: scan.gtin, lot: scan.lot ?? null, expiry: scan.expiry?.iso ?? null });
        return;
      }
      // Our own labels. Two reads rather than a lookup endpoint, because the
      // label spaces are separate and small; a `/api/resolve?code=` route would
      // be the right move once there is a third kind.
      const [packs, instruments] = await Promise.all([cssd.packs(), cssd.instruments()]);
      const pack = packs.packs.find((p) => p.label_code === raw);
      if (pack) return setFound({ kind: "pack", pack });
      const unit = instruments.instruments.find((u) => u.label_code === raw);
      if (unit) return setFound({ kind: "instrument", instrument: unit });
      setFound({ kind: "unknown", raw });
    } catch {
      setFound({ kind: "unknown", raw });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!video || found) return;
    let handle: { stop: () => void } | null = null;
    // A camera returns the same symbol thirty times a second; without this the
    // first frame would fire `identify` on a loop.
    const fresh = makeDebouncer();
    let sawFrame = false;
    const onPlaying = () => {
      sawFrame = true;
      setReady(true);
    };
    video.addEventListener("playing", onPlaying);
    void startScan(
      video,
      (raw) => {
        if (fresh(raw)) void identify(raw);
      },
      setCamera,
    ).then((h) => {
      handle = h;
    });
    /**
     * No frame after five seconds is a dead camera, whatever the API reported.
     * `getUserMedia` resolving is not the same as a picture arriving, and the
     * gap between the two is where a person is left staring at a grey box with
     * no way to tell loading from broken.
     */
    const timer = setTimeout(() => {
      if (!sawFrame) setCamera((c) => c ?? "timeout");
    }, 5000);
    return () => {
      clearTimeout(timer);
      video.removeEventListener("playing", onPlaying);
      handle?.stop();
    };
  }, [identify, found, video]);

  if (receiving) {
    return <ReceiveSheet barcode={receiving.barcode} onClose={onClose} onDone={onClose} />;
  }

  return (
    <Sheet open onClose={onClose} title={found ? t("scan.found") : t("scan.title")} size="tall">
      {!found && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-surface-2">
            {/* `aspect-[4/3]` rather than a fixed height: the preview must not
                jump when the stream's real dimensions arrive. */}
            <video ref={setVideo} muted playsInline className="aspect-[4/3] w-full object-cover" />
            {/* Until the camera reports one way or the other, SAY so. A silent
                grey rectangle is indistinguishable from a broken one. */}
            {!camera && !ready && (
              <div className="absolute inset-0 grid place-items-center bg-surface-2 p-6 text-center">
                <div className="space-y-2">
                  <Spinner />
                  <p className="text-caption text-muted-foreground">{t("scan.starting")}</p>
                </div>
              </div>
            )}
            {camera && (
              <div className="absolute inset-0 grid place-items-center bg-surface-2 p-6 text-center">
                <div className="space-y-2">
                  <CircleAlert aria-hidden className="mx-auto size-6 text-muted-foreground" />
                  <p className="text-caption text-muted-foreground">{t(`scan.camera.${camera}`)}</p>
                </div>
              </div>
            )}
            {busy && <div className="absolute inset-0 grid place-items-center bg-background/60"><Spinner /></div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) void identify(typed.trim());
            }}
            className="space-y-3"
          >
            <Field
              label={t("scan.typeCode")}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("scan.typePlaceholder")}
              autoFocus
              /* A hand-held scanner "types" then presses Enter — the form submit
                 is what makes that hardware work with no configuration at all. */
            />
            <Button type="submit" className="w-full" disabled={!typed.trim()}>{t("scan.find")}</Button>
          </form>
        </div>
      )}

      {found?.kind === "product" && (
        <div className="space-y-4">
          <Callout tone="primary" icon={Archive}>
            <div className="space-y-1">
              <div>{t("scan.product")}</div>
              {/* Everything the scan gave us, shown before any action — the
                  person can see the app read the same thing they did. */}
              <div className="text-caption text-muted-foreground">
                GTIN {found.gtin}
                {found.lot && ` · lot ${found.lot}`}
                {found.expiry && ` · expires ${found.expiry}`}
              </div>
            </div>
          </Callout>
          <Group>
            <Row icon={Archive} sub={t("scan.receive.sub")} onClick={() => setReceiving({ barcode: found.barcode })}>
              {t("scan.receive")}
            </Row>
            <Row icon={ScanLine} sub={t("scan.lookUp.sub")} divider={false} onClick={() => { onClose(); nav("/stock"); }}>
              {t("scan.lookUp")}
            </Row>
          </Group>
        </div>
      )}

      {found?.kind === "pack" && (
        <div className="space-y-4">
          <Callout tone="primary" icon={ListChecks}>
            <div>{found.pack.recipe_name ?? t("cssd.tray")} — {found.pack.label_code}</div>
            <div className="text-caption text-muted-foreground">{found.pack.status.replace(/_/g, " ")}</div>
          </Callout>
          <Group>
            <Row icon={ListChecks} sub={t("scan.goToTray")} divider={false} onClick={() => { onClose(); nav(`/cssd/tray/${found.pack.id}`); }}>
              {t("scan.openTray")}
            </Row>
          </Group>
        </div>
      )}

      {found?.kind === "instrument" && (
        <div className="space-y-4">
          <Callout tone="primary" icon={RotateCcw}>
            <div>{found.instrument.item_name ?? t("labels.instruments")} — {found.instrument.label_code}</div>
            <div className="text-caption text-muted-foreground">
              {found.instrument.status} · {t("common.cycles", { count: found.instrument.cycle_count })}
            </div>
          </Callout>
          <Group>
            <Row icon={RotateCcw} sub={t("scan.goToInstrument")} divider={false} onClick={() => { onClose(); nav("/cssd"); }}>
              {t("scan.openInstrument")}
            </Row>
          </Group>
        </div>
      )}

      {found?.kind === "unknown" && (
        <Callout tone="warning">
          <div className="space-y-2">
            <div>{t("scan.unknown")}</div>
            <div className="break-all text-caption text-muted-foreground">{found.raw}</div>
          </div>
        </Callout>
      )}

      {found && (
        <Button variant="ghost" className="mt-4 w-full" onClick={() => setFound(null)}>
          {t("scan.again")}
        </Button>
      )}
    </Sheet>
  );
}
