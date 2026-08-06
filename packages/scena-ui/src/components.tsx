/**
 * Shared React primitives for the Scena dashboard, styled from the design
 * tokens. Inline styles mirror the prototype's approach; tokens keep them
 * consistent. Generic on purpose — apps supply their own icons + nav config.
 */

import type { CSSProperties, ReactNode } from "react";
import { color, font, radius, shadow } from "./tokens.js";

export function StatusDot({ tone, size = 8 }: { tone: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, borderRadius: "50%", background: tone, flexShrink: 0, display: "inline-block" }}
    />
  );
}

export function Badge({ children, tone = color.textMuted, bg = color.hover }: { children: ReactNode; tone?: string; bg?: string }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 11,
        fontWeight: 600,
        color: tone,
        background: bg,
        padding: "3px 8px",
        borderRadius: 6,
      }}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger";
export function Button({
  children,
  variant = "ghost",
  onClick,
  disabled,
  type = "button",
  style,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    fontFamily: font.ui,
    fontWeight: 600,
    fontSize: 13,
    padding: "9px 16px",
    borderRadius: radius.md,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    border: "1px solid transparent",
    transition: "background 120ms, border-color 120ms",
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: color.brand, color: "#fff" },
    ghost: { background: color.surface, borderColor: color.border, color: color.text },
    danger: { background: color.surface, borderColor: "oklch(0.86 0.04 25)", color: color.offlineInk },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

export function Card({
  children,
  style,
  onClick,
  interactive,
}: {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  interactive?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        cursor: interactive ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  dotTone,
  valueTone,
  accent,
}: {
  label: string;
  value: ReactNode;
  dotTone?: string;
  valueTone?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? color.brandTint : color.surface,
        border: `1px solid ${accent ? color.brandTintBorder : color.border}`,
        borderRadius: radius.lg,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {dotTone && <StatusDot tone={dotTone} />}
        <span style={{ fontSize: 13, color: accent ? color.brandInk : color.textMuted }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: valueTone ?? color.text }}>
        {value}
      </div>
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${color.border}`,
        borderTopColor: color.brand,
        display: "inline-block",
        animation: "scenaSpin 0.7s linear infinite",
      }}
    />
  );
}

export function Modal({ open, onClose, children, width = 560 }: { open: boolean; onClose?: () => void; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.2 0.02 300 / 0.4)",
        backdropFilter: "blur(3px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width, background: color.surface, borderRadius: 20, overflow: "hidden", boxShadow: shadow.pop }}
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------------- Shell ---------------------------------- */

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function Shell({
  navGroups,
  active,
  onNavigate,
  title,
  subtitle,
  actions,
  footer,
  children,
}: {
  navGroups: NavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden", color: color.text }}>
      <aside
        style={{
          width: 244,
          flexShrink: 0,
          background: color.surface,
          borderRight: `1px solid ${color.border}`,
          display: "flex",
          flexDirection: "column",
          padding: "20px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 22px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: color.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, border: "2.5px solid #fff" }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>scena</span>
        </div>

        {navGroups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: color.textFaint,
                padding: "14px 10px 6px",
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const on = item.key === active;
              return (
                <a
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "9px 10px",
                    borderRadius: radius.md,
                    cursor: "pointer",
                    fontSize: 14,
                    marginBottom: 2,
                    background: on ? color.brandTint : "transparent",
                    color: on ? color.brandInk : color.text,
                    fontWeight: on ? 700 : 500,
                  }}
                >
                  {item.icon}
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}

        <div style={{ marginTop: "auto", paddingTop: 18 }}>{footer}</div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: 68,
            flexShrink: 0,
            borderBottom: `1px solid ${color.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 26px",
            gap: 16,
            background: color.surface,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: color.textMuted, marginTop: 1 }}>{subtitle}</div>}
          </div>
          <div style={{ flex: 1 }} />
          {actions}
        </header>
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>{children}</div>
      </main>
    </div>
  );
}
