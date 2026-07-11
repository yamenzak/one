/**
 * Barcode scanner — live camera scan via the native BarcodeDetector API, with
 * a manual-entry fallback for browsers (and desktops) without it. Returns the
 * detected digits; nutrition lookup happens in the caller.
 */

import { useEffect, useRef, useState } from "react";
import { Button, Field, Sheet, Barcode } from "@mossa/ui";

// BarcodeDetector isn't in the DOM lib types yet.
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported] = useState(() => typeof window !== "undefined" && "BarcodeDetector" in window);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "manual">(supported ? "starting" : "manual");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: FORMATS });

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video || video.readyState < 2) { raf = requestAnimationFrame(tick); return; }
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0 && codes[0]!.rawValue) { stopped = true; onDetected(codes[0]!.rawValue.replace(/\D/g, "")); return; }
      } catch { /* transient decode error — keep scanning */ }
      raf = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
        setStatus("scanning");
        raf = requestAnimationFrame(tick);
      } catch { setStatus("denied"); }
    })();

    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [supported, onDetected]);

  const submitManual = () => { const digits = manual.replace(/\D/g, ""); if (digits.length >= 6) onDetected(digits); };

  return (
    <Sheet open onClose={onClose} title="Scan barcode">
      <div className="space-y-4">
        {supported && status !== "manual" && status !== "denied" && (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 shadow-[0_0_12px_2px_var(--color-primary)]" />
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/30" />
          </div>
        )}
        {status === "scanning" && <p className="text-center text-sm text-muted-foreground">Point the camera at a product barcode.</p>}
        {status === "starting" && <p className="text-center text-sm text-muted-foreground">Starting camera…</p>}
        {status === "denied" && <p className="text-center text-sm text-warning">Camera access was blocked — enter the digits below instead.</p>}

        <div className="space-y-2">
          <Field label="Or enter the digits" icon={Barcode} inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0123456789012" />
          <Button className="w-full" disabled={manual.replace(/\D/g, "").length < 6} onClick={submitManual}>Look up product</Button>
        </div>
      </div>
    </Sheet>
  );
}
