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
import { Archive, Button, Callout, Check, Field, Label, Select, Sheet, Spinner, useAction } from "@4dl/ui";
import { api } from "@4dl/app-kit";
import { fmt, stock, type Location, type UnknownProduct } from "../data.js";

export function ReceiveSheet({ barcode, onClose, onDone }: { barcode: string; onClose: () => void; onDone: () => void }) {
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
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("How many?");
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
    return <Sheet open onClose={onClose} title="Receive"><div className="grid place-items-center py-10"><Spinner /></div></Sheet>;
  }

  if (done) {
    return (
      <Sheet open onClose={onDone} title="Received" footer={<Button className="w-full" onClick={onDone}>Done</Button>}>
        <Callout tone="success" icon={Check}>
          <div>{done.quantity} on the shelf.</div>
          {done.expiry && <div className="text-caption text-muted-foreground">Expires {done.expiry}</div>}
        </Callout>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={unknown ? "New product" : "Receive"}
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
            Add it and receive
          </Button>
        ) : (
          <Button className="w-full" disabled={!locationId || act.busy !== null} onClick={() => void receive()}>
            {act.busy ? "Receiving…" : "Receive"}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {unknown && (
          <Callout tone="warning" icon={Archive}>
            <div className="space-y-1">
              <div>This barcode isn't in the catalog yet.</div>
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
          <Field label="What is it called?" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Sterile gauze 10×10" autoFocus />
        )}

        <div>
          <Label htmlFor="receive-location" className="mb-1.5 block">Where is it going?</Label>
          <Select
            value={locationId}
            onChange={setLocationId}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Scan or pick a location"
            aria-label="Where is it going?"
          />
        </div>

        <Field
          label="How many?"
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
