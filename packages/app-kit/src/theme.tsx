/**
 * ThemeProvider — applies the active tenant's branding + the user's mode to the
 * document root, and re-applies whenever the branding changes. Exposes a hook to
 * toggle mode and to preview a brand (used by a branding editor).
 *
 * `branding` is a PROP rather than something read out of the session, which is
 * what let this move: the resolution — signed-in tenant wins, else the host's
 * tenant so a sign-in screen is already branded — is the app's, because only the
 * app knows the shape of its context payload. Everything below is the same for
 * every product: apply the tokens, track the mode, white-label the browser
 * chrome, and keep the toolbar tint in step with both.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyBranding, applyMode, resolveMode, oklchStringToHex, type Branding, type ThemeMode } from "@4dl/ui";

interface ThemeCtx {
  mode: ThemeMode;
  toggleMode: () => void;
  /** Live-preview a branding (no persistence) — for the editor. */
  preview: (b: Branding | null) => void;
  /** Tint the active nav tab by its section's accent token. From the TENANT's
   *  branding — read-only here; an owner sets it in the branding editor. */
  tintedNav: boolean;
  /** Wash each page's hero area in its section's accent token. Tenant branding. */
  ambient: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ branding, children }: { branding: Branding | null; children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => resolveMode(branding?.defaultMode));
  // Track whether the user has explicitly picked a mode this session — a manual
  // toggle must win over the tenant's default even after branding resolves.
  const userChoseMode = useRef(false);

  // Apply the tenant branding whenever it changes.
  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  // Branding often lands after first paint (it flows through /api/context). Once
  // the tenant's defaultMode is available, sync to it — unless the user has
  // already toggled the mode themselves, in which case their choice stands.
  useEffect(() => {
    if (userChoseMode.current || !branding?.defaultMode) return;
    setMode(resolveMode(branding.defaultMode));
  }, [branding?.defaultMode]);

  // White-label the browser chrome from branding: favicon + apple-touch-icon
  // (the square app icon, falling back to the wordmark). A PWA manifest is
  // themed server-side per host; this covers the live tab on any origin.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const undo: (() => void)[] = [];
    const icon = branding?.iconUrl || branding?.logoUrl;
    if (icon) {
      for (const rel of ["icon", "apple-touch-icon"]) {
        let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
        if (!link) { link = document.createElement("link"); link.rel = rel; document.head.appendChild(link); }
        const prev = link.getAttribute("href");
        const el = link;
        el.href = icon;
        undo.push(() => (prev ? el.setAttribute("href", prev) : el.remove()));
      }
    }
    return () => undo.forEach((f) => f());
  }, [branding]);

  // The theme-color meta (the brand primary) tints the mobile toolbar / installed
  // title bar — it must track the active MODE, since a brand's primary token can
  // differ between light and dark, so re-apply it whenever branding or mode change.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const rawPrimary = branding?.primary || branding?.tokens?.[mode]?.["--primary"] || branding?.tokens?.dark?.["--primary"];
    const hex = rawPrimary ? (rawPrimary.startsWith("#") ? rawPrimary : oklchStringToHex(rawPrimary)) : null;
    if (!hex) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", hex);
    return () => { if (prev) meta.setAttribute("content", prev); };
  }, [branding, mode]);

  // Apply mode.
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  // Tenant-wide, straight off the branding. Both default ON, so a tenant that has
  // never touched them looks exactly as it did when these were device
  // preferences — only now every member sees the same thing.
  const tintedNav = branding?.tintedNav ?? true;
  const ambient = branding?.ambient ?? true;

  const toggleMode = useCallback(() => { userChoseMode.current = true; setMode((m) => (m === "dark" ? "light" : "dark")); }, []);
  const preview = useCallback((b: Branding | null) => applyBranding(b ?? branding), [branding]);

  const value = useMemo(() => ({ mode, toggleMode, preview, tintedNav, ambient }), [mode, toggleMode, preview, tintedNav, ambient]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside provider");
  return c;
}
