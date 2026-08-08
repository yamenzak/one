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
import {
  applyBranding, applyMode, brandMark, displayedModeChoice, Monitor, Moon, oklchStringToHex, PreviewPicker,
  readModeChoice, resolveChoice, Sun, watchSystemMode, writeModeChoice,
  type Branding, type ThemeChoice, type ThemeMode,
} from "@4dl/ui";

interface ThemeCtx {
  /** The mode being PAINTED — always light or dark. */
  mode: ThemeMode;
  /**
   * What the user CHOSE, which may be `"system"`. A settings screen offering
   * three options has to know which one is selected, and `mode` cannot say:
   * "dark" reads identically whether it was picked or inherited from the OS.
   */
  choice: ThemeChoice;
  /** Pick explicitly. `"system"` hands control back to the OS, live. */
  setChoice: (c: ThemeChoice) => void;
  /**
   * The one-press control every app already has in its chrome: flip to the
   * opposite of what is showing.
   *
   * From `"system"` this lands on an EXPLICIT mode, which is the right reading of
   * a person pressing a light/dark button while being tracked — they want the
   * other one, not a different tracking policy. Getting back to "system" is
   * `setChoice`, from settings, where a three-way choice belongs.
   */
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

export interface ThemeProviderProps {
  branding: Branding | null;
  /**
   * How this app puts a brand on the page. Defaults to `@4dl/ui`'s
   * `applyBranding`, which is right for every app whose whole theme is the
   * shared token set.
   *
   * Injected because one app's is not: Scena also emits a `--font-sans` and the
   * `--w-*` widget block a television reads, in a SECOND style element —
   * `applyBranding` rewrites its own element wholesale on every call, so anything
   * appended there is discarded on the next preview keystroke. Before this seam,
   * Scena could not mount this provider at all and carried its own theme module
   * instead, which is how the third mode state came to exist in only one app.
   */
  applyBrand?: (b: Branding | null) => void;
  children: ReactNode;
}

export function ThemeProvider({ branding, applyBrand = applyBranding, children }: ThemeProviderProps) {
  /*
    THE CHOICE IS THE STATE; THE MODE IS DERIVED.

    It used to be the other way round — `mode` was state and the choice was
    unrepresentable — which is exactly why "follow the system" could not be
    added without a second theme module (Scena wrote one). Storing the choice
    and deriving the mode makes the third state fall out: `resolveChoice` reads
    the OS when it needs to, and the effect below re-derives when the OS changes.
  */
  /*
    `displayedModeChoice`, not `readModeChoice` — the picker needs something
    highlighted even when nobody has chosen, and the app's floor is the honest
    answer to "what is in force". The RESOLUTION below still uses the raw
    (nullable) read, because a tenant's `defaultMode` outranks a floor and must
    not outrank a person's actual choice.
  */
  const [choice, setChoiceState] = useState<ThemeChoice>(displayedModeChoice);
  const [mode, setMode] = useState<ThemeMode>(() => resolveChoice(readModeChoice(), branding?.defaultMode));
  // Track whether the user has explicitly picked a mode this session — a manual
  // toggle must win over the tenant's default even after branding resolves.
  const userChoseMode = useRef(false);

  // Apply the tenant branding whenever it changes, through the app's applier.
  useEffect(() => {
    applyBrand(branding);
  }, [branding, applyBrand]);

  // Branding often lands after first paint (it flows through /api/context). Once
  // the tenant's defaultMode is available, sync to it — unless the user has
  // already toggled the mode themselves, in which case their choice stands.
  useEffect(() => {
    if (userChoseMode.current || !branding?.defaultMode) return;
    setMode(resolveChoice(choice, branding.defaultMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tenant default is the trigger; `choice` is read, not watched (its own setter already re-derives)
  }, [branding?.defaultMode]);

  /*
    FOLLOW THE OS, LIVE — and only while the choice is `"system"`.

    A listener left running under an explicit choice would fight the person who
    made it: they pick light, walk into the evening, their laptop flips to dark,
    and so does the app they told to stay light. So the subscription is scoped to
    the state that asked for it, and unsubscribes the moment it changes.
  */
  useEffect(() => {
    if (choice !== "system") return;
    const sync = () => setMode(resolveChoice("system", branding?.defaultMode));
    sync();
    return watchSystemMode(sync);
  }, [choice, branding?.defaultMode]);

  // White-label the browser chrome from branding: favicon + apple-touch-icon
  // (the square app icon, falling back to the wordmark). A PWA manifest is
  // themed server-side per host; this covers the live tab on any origin.
  //
  // Tracks the MODE as well as the branding. Browser chrome is the one surface
  // a studio does not theme: a tab strip is light on a light OS whatever the
  // app is set to, so a mark drawn for the dark app can vanish in the one place
  // its owner looks at all day. `brandMark` picks the light variant when there
  // is one, and the dark mark unchanged when there is not.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const undo: (() => void)[] = [];
    const icon = brandMark(branding, mode, "icon");
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
  }, [branding, mode]);

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

  /**
   * Pick, and remember it.
   *
   * `writeModeChoice` stores the CHOICE, including `"system"` — which is the
   * half `applyMode` used to get wrong. It persisted the resolved mode, so the
   * first paint under `"system"` immediately wrote `dark` or `light` and the
   * choice erased itself on load.
   */
  const setChoice = useCallback((c: ThemeChoice) => {
    userChoseMode.current = true;
    writeModeChoice(c);
    setChoiceState(c);
    // Under `"system"` the effect above owns the mode; setting it here too would
    // race it. An explicit choice IS the mode.
    if (c !== "system") setMode(c);
  }, []);

  // The chrome's one-press control. Resolves against what is SHOWING, so from
  // `"system"` it lands on the opposite of whatever the OS had produced.
  const toggleMode = useCallback(() => { setChoice(mode === "dark" ? "light" : "dark"); }, [mode, setChoice]);
  const preview = useCallback((b: Branding | null) => applyBrand(b ?? branding), [branding, applyBrand]);

  const value = useMemo(
    () => ({ mode, choice, setChoice, toggleMode, preview, tintedNav, ambient }),
    [mode, choice, setChoice, toggleMode, preview, tintedNav, ambient],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside provider");
  return c;
}

/**
 * THE THREE-WAY MODE PICKER — one control, every app.
 *
 * It exists because the one-press toggle in an app bar can only express two of
 * the three states: pressing it always lands on an explicit light or dark, so
 * "follow my system" is a state a person can start in and never get back to.
 *
 * Kova deleted its personal "Appearance" tab on the reasoning that "dark mode is
 * one tap away in the account menu", which was correct when there were two
 * states and is not now. This is the row that reasoning was missing.
 *
 * No product vocabulary and no props: it reads and writes the shared context, so
 * an app spends one row on it. `label` is the only thing worth varying, and only
 * because a settings page may already have a heading above it.
 */
export function AppearancePicker({ label = "Theme" }: { label?: string }) {
  const { mode, choice, setChoice } = useTheme();
  return (
    <PreviewPicker
      label={label}
      value={choice}
      onChange={setChoice}
      options={[
        { value: "system" as ThemeChoice, label: "System", preview: <Monitor className="size-5 text-muted-foreground" /> },
        { value: "light" as ThemeChoice, label: "Light", preview: <Sun className="size-5 text-muted-foreground" /> },
        { value: "dark" as ThemeChoice, label: "Dark", preview: <Moon className="size-5 text-muted-foreground" /> },
      ]}
      hint={
        choice === "system"
          ? `Following your system, which is currently ${mode}. It changes with your OS, live.`
          : `Always ${choice}, whatever your system is set to.`
      }
    />
  );
}

/**
 * The one-line summary for the settings INDEX row that opens the picker.
 *
 * Separate from the picker because the grammar needs it separately: an index row
 * states the CURRENT VALUE, and "Dark" alone cannot distinguish a choice from an
 * inheritance. `mode` is included under `"system"` for that reason.
 */
export function useAppearanceSummary(): string {
  const { mode, choice } = useTheme();
  return choice === "system" ? `Following your system · ${mode}` : `Always ${choice}`;
}

/**
 * FORCE THE DARK PALETTE FOR AS LONG AS THIS SCREEN IS MOUNTED.
 *
 * For a surface that is not somebody's dashboard to have opinions about: a
 * take-a-ticket kiosk, a counter tablet, a wall display. It hangs in a lobby, it
 * is read from across a room, and the person in front of it did not choose its
 * theme. Scena has two; any product with a customer-facing screen will have one.
 *
 * ⚠️ IT REMOVES AN ATTRIBUTE — it does not add a class. `className="dark"` is
 * what both of Scena's said, and it stopped meaning anything the moment the
 * palette moved from a `.dark` class to `data-theme` on `<html>`: the class is
 * inert, the pages render, and they quietly inherit whatever theme that tablet's
 * browser last stored (same origin, same localStorage as the dashboard an
 * operator once opened on it). Nothing broke loudly, which is why it survived.
 *
 * Dark is the ABSENCE of the attribute, because `:root` already holds the dark
 * palette. The previous value is restored on unmount: these pages are usually
 * the whole session on their device, but the console is one route away and must
 * not be left recoloured.
 */
export function useForcedDark(): void {
  useEffect(() => {
    const el = document.documentElement;
    const previous = el.getAttribute("data-theme");
    el.removeAttribute("data-theme");
    return () => { if (previous !== null) el.setAttribute("data-theme", previous); };
  }, []);
}
