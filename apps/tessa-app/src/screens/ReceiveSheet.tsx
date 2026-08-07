/**
 * RECEIVE — the two-scan flow, and the product's central claim.
 *
 * Scan the bin, scan the box, type a number. The barcode supplies the product,
 * the expiry and the lot code, so the ONLY keystrokes are the count. Everything
 * on this screen exists to keep that true.
 *
 * ── The unknown product is the interesting case ─────────────────────────────
 *
 * A GTIN the catalog does not know answers 409 carrying everything the scan DID
 * read (`stock-routes.ts`). That is not an error state to apologise for — it is
 * the first delivery of a new product, which happens constantly, and the right
 * response is a pre-filled "add this" rather than an empty catalog form. The
 * expiry and lot carry through, so the person types a NAME and nothing else.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@4dl/app-kit";
import { Archive, Button, Callout, Card, Check, Field, Label, Select, Sheet, Spinner, useAction } from "@4dl/ui";
import { api } from "@4dl/app-kit";
import { ai, fmt, stock, type LabelReading, type Location, type UnknownProduct } from "../data.js";
import { useT } from "../i18n.js";

export function ReceiveSheet({ barcode, onClose, onDone }: { barcode: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unknown, setUnknown] = useState<UnknownProduct["scan"] | null>(null);
  const [newName, setNewName] = useState("");
  const [done, setDone] = useState<{ quantity: number; expiry: string | null } | null>(null);
  const act = useAction(fmt);

  useEffect(() => {
    void stock.locations().then((r) => {
      setLocations(r.locations);
      // One location is the common case in a small clinic; making them pick it
      // every time would be a keystroke the flow exists to remove.
      if (r.locations.length === 1) setLocationId(r.locations[0]!.id);
    });
  }, []);

  const receive = useCallback(
    (catalogItemId?: string) =>
      act.run("receive", async () => {
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(t("stock.howMany"));
        try {
          const r = await stock.receive({
            barcode,
            catalogItemId,
            locationId,
            quantity: qty,
            // The scan's own reading carries through when the catalog entry was
            // just created — otherwise the new item would land with no expiry.
            ...(unknown ? { lotCode: unknown.lot ?? undefined, expiry: unknown.expiry ?? undefined } : {}),
          });
          setDone({ quantity: r.quantity, expiry: r.expiry });
        } catch (e) {
          // Not a failure: a product we have not stocked before.
          if (e instanceof ApiError && e.status === 409) {
            const body = e.body as UnknownProduct | undefined;
            if (body?.error === "unknown_product") {
              setUnknown(body.scan);
              return;
            }
          }
          throw e;
        }
      }),
    [act, barcode, locationId, quantity, unknown],
  );

  if (!locations) {
    return <Sheet open onClose={onClose} title={t("receive.title")}><div className="grid place-items-center py-10"><Spinner /></div></Sheet>;
  }

  if (done) {
    return (
      <Sheet open onClose={onDone} title={t("receive.done")} footer={<Button className="w-full" onClick={onDone}>{t("common.done")}</Button>}>
        <Callout tone="success" icon={Check}>
          <div>{t("receive.onShelf", { count: done.quantity })}</div>
          {done.expiry && <div className="text-caption text-muted-foreground">{t("receive.expires", { date: done.expiry })}</div>}
        </Callout>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={unknown ? t("receive.newProduct") : t("receive.title")}
      footer={
        unknown ? (
          <Button
            className="w-full"
            disabled={!newName.trim() || !locationId || act.busy !== null}
            onClick={() =>
              void act.run("add", async () => {
                /**
                 * Create the catalog entry, then receive against it. Two calls
                 * rather than one, because "add a product" is a real act with
                 * its own permission (`catalog:create`) and folding it into the
                 * receive would let anyone who can receive invent catalog items.
                 */
                const item = await api.post<{ id: string }>("/api/catalog", {
                  name: newName.trim(),
                  gtin: unknown?.gtin ?? undefined,
                  tracking: "lot",
                  consumption: "discrete",
                });
                await receive(item.id);
              })
            }
          >
{t("receive.addAndReceive")}
          </Button>
        ) : (
          <Button className="w-full" disabled={!locationId || act.busy !== null} onClick={() => void receive()}>
            {act.busy ? t("receive.receiving") : t("receive.title")}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {unknown && <LabelReader onRead={(l) => { if (l.name) setNewName(l.name); }} />}

        {unknown && (
          <Callout tone="warning" icon={Archive}>
            <div className="space-y-1">
              <div>{t("receive.notInCatalog")}</div>
              <div className="text-caption text-muted-foreground">
                {unknown.gtin && `GTIN ${unknown.gtin}`}
                {unknown.lot && ` · lot ${unknown.lot}`}
                {unknown.expiry && ` · expires ${unknown.expiry}`}
              </div>
              {/* A failed check digit is exactly what the person needs to know
                  here, before they name a product against a misread number. */}
              {unknown.warnings?.length > 0 && (
                <div className="text-caption text-warning">{unknown.warnings.join(" · ")}</div>
              )}
            </div>
          </Callout>
        )}

        {unknown && (
          <Field label={t("receive.whatIsIt")} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("receive.namePlaceholder")} autoFocus />
        )}

        <div>
          <Label htmlFor="receive-location" className="mb-1.5 block">{t("receive.where")}</Label>
          <Select
            value={locationId}
            onChange={setLocationId}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
            placeholder={t("receive.wherePlaceholder")}
            aria-label={t("receive.where")}
          />
        </div>

        <Field
          label={t("stock.howMany")}
          type="number"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          /* The one field that is genuinely typed. Everything above it came off
             the barcode, which is the whole point of the flow. */
        />

        {act.err && <Callout tone="danger" live="alert">{act.err}</Callout>}
      </div>
    </Sheet>
  );
}

/**
 * THE PHOTO FALLBACK, and only a fallback.
 *
 * It appears in the branch where the barcode did NOT identify the product,
 * which is exactly when a photo is worth taking — a creased code, a handwritten
 * lot, an expiry printed as "Verw. bis 03/2027". The scanner stays the fast
 * path.
 *
 * ⚠️ It fills the form. It does not submit it, and the fields stay editable with
 * the model's own confidence next to them. A wrong expiry on a sterile item is a
 * patient-safety failure, so the last check is a person's — which is also what
 * MPBetreibV requires of the record.
 */
function LabelReader({ onRead }: { onRead: (l: LabelReading) => void }) {
  const t = useT();
  const act = useAction(fmt);
  const [read, setRead] = useState<{ label: LabelReading; confidence: number | null } | null>(null);

  const onFile = (file: File) =>
    void act.run("read", async () => {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        // `readAsDataURL` gives `data:image/jpeg;base64,…`; the API wants the
        // payload alone.
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("Couldn't read that file."));
        r.readAsDataURL(file);
      });
      const r = await ai.readLabel(data, file.type);
      setRead({ label: r.label, confidence: r.confidence });
      onRead(r.label);
    }, t("ai.label.failed"));

  return (
    <Card className="space-y-2 p-3">
      <label className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-body font-medium">{t("ai.label")}</span>
          <span className="block text-caption text-muted-foreground">{t("ai.label.sub")}</span>
        </span>
        {/* `capture="environment"` opens the rear camera directly on a phone,
            which is the only way this is faster than typing. */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="w-32 text-caption"
          disabled={act.busy !== null}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </label>
      {act.busy && <p className="text-caption text-muted-foreground">{t("ai.working")}</p>}
      {act.err && <p className="text-caption text-danger">{act.err}</p>}
      {read && (
        <div className="space-y-1 text-caption">
          <div className="text-muted-foreground">
            {[read.label.name, read.label.lot && `Ch.-B. ${read.label.lot}`, read.label.expiry].filter(Boolean).join(" · ") || t("ai.label.nothing")}
          </div>
          {/* Named, not hidden: low confidence is the model's own signal that a
              human should look, and it is the useful half of the answer. */}
          <div className="text-warning">
            {t("ai.label.check", { pct: read.confidence == null ? "—" : Math.round(read.confidence * 100) })}
          </div>
        </div>
      )}
    </Card>
  );
}
