/**
 * Promise-based confirm dialog — `await confirmDialog({...})` resolves true/false.
 * Replaces the blocking, unstyled native `confirm()` with a shadcn Dialog so
 * destructive actions get a proper, on-brand "are you sure?" moment. A single
 * <ConfirmHost/> lives near the app root.
 */
import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter } from "@4dl/ui";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}
type Pending = ConfirmOptions & { resolve: (v: boolean) => void };

let setPendingRef: ((p: Pending | null) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setPendingRef) return resolve(window.confirm(opts.description ?? opts.title));
    setPendingRef({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    setPendingRef = setPending;
    return () => {
      setPendingRef = null;
    };
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && close(false)}>
      <DialogContent title={pending?.title} className="sm:max-w-sm">
      {pending?.description ? <DialogDescription>{pending.description}</DialogDescription> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {pending?.cancelText ?? "Cancel"}
          </Button>
          <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {pending?.confirmText ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
