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

/**
 * ⚠️ THE OBJECT EACH COMPONENT BORROWS, AND NOTHING SPECULATIVE. One entry, one
 * component that uses it — a name declared "for later" is a name nobody has
 * checked against a render, and it reads as coverage the package does not have.
 * The test holds this to zero slack, so the map grows with a component and never
 * before one.
 */
export const BORROWED = {
  button: "btn",
  card: "card",
  badge: "badge",
  alert: "alert",
  skeleton: "skeleton",
  field: "input",
} as const;

/**
 * ⚠️ WHAT IS NOT BORROWED, AND WHY — because "we wrote our own" is a decision
 * that decays into "somebody did not know the library had one". Each of these is
 * an object daisyUI ships and we deliberately do not use, and the reason is
 * always the same shape: the language makes a rule about it that the library's
 * version does not implement, so borrowing would mean fighting it.
 */
export const OURS: Readonly<Record<string, string>> = {
  "row": "`list-row` distributes its columns only inside a `.list`, and needs a `list-col-grow` modifier on a CHILD to know which one stretches — while the hit-area floor, the two lead treatments and the value slot are ours already",
  "amount": "the cents are smaller and the figures are tabular — a balance is read as a magnitude",
  "segmented": "one indicator that TRAVELS. `tab-active` cross-fades two pills, which reads as two things happening",
  "overlay": "five placements, one component. `modal` is one placement with its own open/close mechanics",
  "face": "the §5.2 icon roles — a medallion is a lead for a thing WITH A VALUE, which is a rule about rows",
  "tile": "a destination in a fixed set of four, sized against the hit-area floor rather than its content",
  "quick-action": "the label is not optional, and there are at most four. Both are refusals in code",
  "nav": "one navigation surface at a time — `dock` plus a rail is two answers to 'where am I'",
  "sky": "the tenant's light. There is nothing to borrow: no library has an ambience slot",
  "section": "where the header sits depends on the ARCHETYPE, which no component can see",
};

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
