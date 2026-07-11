/**
 * Overlay primitives — Dialog (radix), Sheet (vaul drawer), DropdownMenu,
 * Tabs + SegmentedControl (animated), Select, Tooltip, Avatar. Polished,
 * animated, theme-driven.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Drawer } from "vaul";
import { motion } from "motion/react";
import { Check, ChevronDown, X } from "./lib/icons.js";
import { cn } from "./lib/utils.js";
import type { ReactNode } from "react";

const overlayCls =
  "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-[overlay-in_0.2s_ease] data-[state=closed]:animate-[overlay-out_0.15s_ease]";

// ── Dialog (centered modal) ─────────────────────────────────────────────────
export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayCls} />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border/60 bg-popover p-6 shadow-lg outline-none",
          "data-[state=open]:animate-[content-in_0.24s_cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:animate-[content-out_0.16s_ease]",
          className,
        )}
      >
        {title && <DialogPrimitive.Title className="mb-4 text-xl font-semibold tracking-tight">{title}</DialogPrimitive.Title>}
        {!title && <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
        <DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X className="size-4" />
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// ── Sheet (bottom drawer, drag-to-dismiss) ──────────────────────────────────
export function Sheet({ open, onClose, title, titleAction, children }: { open: boolean; onClose: () => void; title?: string; titleAction?: ReactNode; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92vh] max-w-xl flex-col rounded-t-3xl border-t border-border/60 bg-popover outline-none">
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-surface-3" />
          <div className="overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
            <div className={cn("flex items-center justify-between gap-3", (title || titleAction) && "mb-4")}>
              <Drawer.Title className={cn("text-xl font-semibold tracking-tight", !title && "sr-only")}>{title ?? "Sheet"}</Drawer.Title>
              {titleAction}
            </div>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ── Dropdown menu ────────────────────────────────────────────────────────────
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn(
          "z-50 min-w-48 rounded-2xl border border-border/60 bg-popover p-1.5 shadow-lg outline-none",
          "data-[state=open]:animate-[menu-in_0.16s_ease]",
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({ children, onSelect, className, destructive }: { children: ReactNode; onSelect?: () => void; className?: string; destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground",
        destructive ? "text-danger hover:bg-danger-soft [&_svg]:text-danger" : "text-foreground hover:bg-secondary",
        className,
      )}
    >
      {children}
    </DropdownPrimitive.Item>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">{children}</div>;
}
export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
export const Tabs = TabsPrimitive.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn("inline-flex items-center gap-1 rounded-full bg-secondary p-1", className)}>{children}</TabsPrimitive.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
export const TabsContent = TabsPrimitive.Content;

/** Segmented control with a sliding motion indicator. */
export function SegmentedControl<T extends string>({ options, value, onChange, className }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full bg-secondary p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors", value === o.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {value === o.value && <motion.span layoutId="segmented-indicator" transition={{ type: "spring", stiffness: 380, damping: 32 }} className="absolute inset-0 rounded-full bg-primary" />}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────
export function Select<T extends string>({ value, onChange, options, placeholder, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-secondary/50 px-3.5 text-sm outline-none transition-colors focus:border-primary/70 data-[placeholder]:text-muted-foreground",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 max-h-72 min-w-[--radix-select-trigger-width] overflow-hidden rounded-2xl border border-border/60 bg-popover p-1.5 shadow-lg data-[state=open]:animate-[menu-in_0.16s_ease]">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-secondary"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md data-[state=delayed-open]:animate-[menu-in_0.14s_ease]">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
/** DiceBear v9 generated avatar URL for a seed (deterministic, no upload). */
export function dicebearUrl(seed: string, style = "thumbs"): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundType=gradientLinear`;
}

export function Avatar({ name, src, seed, className }: { name: string; src?: string | null; seed?: string | null; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const imageSrc = src || (seed ? dicebearUrl(seed) : null);
  return (
    <AvatarPrimitive.Root className={cn("grid size-10 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary", className)}>
      {imageSrc && <AvatarPrimitive.Image src={imageSrc} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
