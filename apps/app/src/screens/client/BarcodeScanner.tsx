/**
 * Barcode scanner — live camera scan via ZXing (works across browsers), with a
 * manual-entry fallback if the camera is unavailable. ZXing is lazy-loaded so it
 * only ships when the scanner is actually opened.
 */

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Button, Field, Sheet, Barcode } from "@mossa/ui";

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied">("starting");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let stopped = false;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (!result || stopped) return;
            stopped = true;
            const code = result.getText().replace(/\D/g, "");
            controls?.stop();
            onDetected(code);
          },
        );
        if (!stopped) setStatus("scanning");
      } catch {
        setStatus("denied");
      }
    })();
    return () => { stopped = true; try { controls?.stop(); } catch { /* ignore */ } };
  }, [onDetected]);

  const submitManual = () => { const digits = manual.replace(/\D/g, ""); if (digits.length >= 6) onDetected(digits); };

  return (
    <Sheet open onClose={onClose} title="Scan barcode">
      <div className="space-y-4">
        {status !== "denied" && (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 shadow-[0_0_12px_2px_var(--color-primary)]" />
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/30" />
          </div>
        )}
        {status === "scanning" && <p className="text-center text-sm text-muted-foreground">Point the camera at a product barcode.</p>}
        {status === "starting" && <p className="text-center text-sm text-muted-foreground">Starting camera…</p>}
        {status === "denied" && <p className="text-center text-sm text-warning">Camera unavailable — enter the digits below instead.</p>}

        <div className="space-y-2">
          <Field label="Or enter the digits" icon={Barcode} inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0123456789012" />
          <Button className="w-full" disabled={manual.replace(/\D/g, "").length < 6} onClick={submitManual}>Look up product</Button>
        </div>
      </div>
    </Sheet>
  );
}
