/**
 * WHAT IS BORROWED — the one place a library's class name is written.
 *
 * ⚠️ A COMPONENT NEVER SPELLS A CLASS NAME INLINE. Every borrowed class is a
 * value here, so swapping the library, dropping it, or discovering that one of
 * its names changed is a diff in this file rather than a search across the
 * package — and so the boundary between what is borrowed and what is ours is
 * something a person can READ rather than infer.
 *
 * ⚠️ THE LIBRARY OWNS WHAT A THING IS. WE OWN WHERE IT SITS. daisyUI draws the
 * object — the pill, the card, the track, the badge — from variables our engine
 * supplies. Our own sheet then places it, using `data-one`, because layout is
 * the half a component library cannot have an opinion about: it does not know
 * what screen it is on.
 *
 * ⚠️ AND NOTHING HERE IS A COLOUR OR A SIZE. If a value in this file ever needs
 * a `-primary` or a `-lg` bolted on at a call site, that is the library leaking
 * a decision the language already makes — see `TONE` and `SIZE`, which are
 * mapped from OUR vocabulary rather than exposed as theirs.
 */

/** ⚠️ The object each component borrows. One entry, one component. */
export const BORROWED = {
  button: "btn",
  card: "card",
  list: "list",
  row: "list-row",
  badge: "badge",
  avatar: "avatar",
  alert: "alert",
  toggle: "toggle",
  tabs: "tabs",
  tab: "tab",
  dock: "dock",
  dockLabel: "dock-label",
  modal: "modal",
  skeleton: "skeleton",
  stat: "stat-value",
  field: "input",
  progress: "progress",
} as const;

/**
 * ⚠️ OUR FIVE TONES, IN THEIR NAMES. The mapping is here rather than at a call
 * site because `danger` is our word and `error` is theirs — a component that
 * knew both would be a component where somebody eventually writes `alert-error`
 * directly, and then a sixth tone appears that the language never declared.
 */
export const TONE = {
  accent: "primary",
  success: "success",
  warning: "warning",
  danger: "error",
  info: "info",
} as const;

/**
 * ⚠️ THREE SIZES, AND THE MIDDLE ONE IS UNNAMED. A default that has to be
 * spelled is a default somebody overrides for no reason; leaving it empty means
 * the common case is the shortest thing to write and the odd case is visible.
 */
export const SIZE = { sm: "-sm", md: "", lg: "-lg" } as const;

/** `btn btn-primary btn-sm` — assembled, never typed out. */
export const borrow = (
  of: keyof typeof BORROWED,
  modifiers: readonly (string | false | undefined)[] = [],
): string => [BORROWED[of], ...modifiers.filter(Boolean).map((m) => `${BORROWED[of]}${m}`)].join(" ");
