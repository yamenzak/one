/**
 * ONE OBJECT FOR ITS WHOLE LIFE — the arithmetic, with no database in it.
 *
 * ⚠️ AN ITEM IS NOT A QUANTITY OF ONE. A number on a shelf answers "how many";
 * an item answers "which one, where has it been, who has it, when was it last
 * serviced, and is it still fit to use". That second question is what a forklift,
 * a fire extinguisher, a laptop and a surgical clamp all have in common, and it
 * is one rung of the ladder rather than a second product.
 *
 * ⚠️ AND ITS LIFE IS A STATE MACHINE RATHER THAN A FLAG. Issuing something that
 * is already out, taking back something nobody took, retiring something that is
 * in somebody's van — each is a different mistake with a different fix, and a
 * boolean `out` can only say that one of them happened.
 *
 * ⚠️ THE REFUSAL IS A VALUE, NEVER A THROW, for the same reason it is in
 * `ledger.ts`: a screen has to know whether to offer a control BEFORE somebody
 * presses it, and a rule discoverable only by attempting it is a rule every
 * surface re-implements.
 */

/* ------------------------------------------------------------------- life --- */

/**
 * WHERE ONE OBJECT STANDS, AND THE LIST IS CLOSED.
 *
 * ⚠️ `held` IS ON OUR SHELF AND IN THE BALANCE; `issued` IS OURS AND NOT ON IT.
 * That distinction is the whole of issue-and-return: a drill in a van is still
 * the workspace's drill, and a count of the shelf it lives on must not find it
 * missing. Folding the two together would make every issued thing read as
 * shrinkage.
 */
export const LIVES = ["held", "issued", "retired"] as const;
export type Life = typeof LIVES[number];

/** What can be done to one object. */
export const ACTS = ["issue", "return", "serve", "retire"] as const;
export type Act = typeof ACTS[number];

/**
 * WHY THIS CANNOT HAPPEN TO THIS OBJECT, or nothing.
 *
 * ⚠️ RETIRED IS THE END, AND IT IS NOT A STATE ANYTHING LEAVES. A retired object
 * that could be issued again is an object somebody condemned and somebody else
 * handed out — which is the exact failure a retirement record exists to prevent.
 *
 * ⚠️ AND RETIRING SOMETHING THAT IS OUT IS REFUSED RATHER THAN ALLOWED. It is
 * not on our shelf, so retiring it would take a number off a shelf that does not
 * hold it — and the person who has it would never be told. Take it back first.
 */
export function refuseAct(life: Life, act: Act): string | null {
  if (life === "retired") return "This one was retired";
  switch (act) {
    case "issue":
      return life === "issued" ? "It is already out with somebody" : null;
    case "return":
      return life === "held" ? "It is already back" : null;
    case "retire":
      return life === "issued" ? "It is out with somebody. Take it back first" : null;
    /* ⚠️ A SERVICE CAN BE RECORDED WHEREVER IT IS. A van is serviced on the road
       and a machine is calibrated in place; demanding it be on our shelf first
       would make the honest record the harder one to write. */
    case "serve":
      return null;
  }
}

/**
 * ⚠️ WHETHER THE BALANCE MOVES, AND BY HOW MUCH. Issuing takes one off the shelf
 * and returning puts it back, because `stock` is what is THERE — and every item
 * movement goes through the same chokepoint as every other, so the history reads
 * the same whether a box of gloves or a named drill left the rack.
 */
export const shelfStep = (act: Act): number =>
  act === "issue" || act === "retire" ? -1 : act === "return" ? 1 : 0;

/* ------------------------------------------------------------------- kits --- */

/**
 * WHERE A KIT STANDS.
 *
 * ⚠️ `open` IS BEING PUT TOGETHER AND `built` IS A CLAIM SOMEBODY MADE. The gap
 * between them is where the recipe is checked, and it is the whole value of the
 * record: "this tray is complete" is a statement with a name and a time on it,
 * not a side effect of the last thing anybody dropped in.
 *
 * ⚠️ AND `broken` IS AN END RATHER THAN AN EMPTY KIT. Its members went back to
 * the shelf; a kit that could be re-opened would be one somebody re-uses the
 * identity of, so a tray recorded as sterile in March is the same record as the
 * one assembled in August.
 */
export const KITS = ["open", "built", "broken"] as const;
export type KitState = typeof KITS[number];

/** What can be done to a kit. */
export const KIT_ACTS = ["put", "take", "build", "break"] as const;
export type KitAct = typeof KIT_ACTS[number];

/**
 * ⚠️ TAKING SOMETHING OUT OF A BUILT KIT IS ALLOWED AND UN-BUILDS IT — see the
 * handler. That is not refused because it is what actually happens: somebody
 * needs the clamp. What must not survive it is the CLAIM, because a tray missing
 * an instrument that still reads "complete" is the one outcome this record
 * exists to prevent.
 */
export function refuseKitAct(state: KitState, act: KitAct): string | null {
  if (state === "broken") return "This kit was broken up";
  if (act === "build" && state === "built") return "It is already built";
  return null;
}

/**
 * WHAT A KIT IS SUPPOSED TO CONTAIN — one line per product.
 *
 * ⚠️ A KIT IS COMPOSED OF DIFFERENT THINGS AND A PACK IS N OF ONE THING, and the
 * line between them is clean: a box of ten gloves is a pack, and a surgery tray
 * is a kit. A pack is a unit of measure with no identity; a kit has identity and
 * a life, which is why it is a record rather than a number.
 */
export interface Wants {
  readonly product: string;
  readonly quantity: number;
}

/** One product a kit is short of. */
export interface Short {
  readonly product: string;
  readonly want: number;
  readonly have: number;
}

/**
 * WHAT IS MISSING FROM A KIT, AND WHAT IS IN IT THAT SHOULD NOT BE.
 *
 * ⚠️ BOTH HALVES, AND THEY ARE NOT THE SAME SEVERITY. Short means the kit cannot
 * do its job and building it would be a claim nobody should make — so a build is
 * REFUSED. A stray is something that does not belong: worth seeing every time,
 * and not a reason to strand somebody who has a good reason for it. Reporting
 * only the first half is how a tray with a foreign instrument in it passes.
 */
export function checkKit(
  wants: readonly Wants[], members: readonly { readonly id: string; readonly product: string }[],
): { readonly short: readonly Short[]; readonly stray: readonly string[] } {
  const have = new Map<string, number>();
  for (const of of members) have.set(of.product, (have.get(of.product) ?? 0) + 1);

  const short: Short[] = [];
  const wanted = new Set<string>();
  for (const line of wants) {
    wanted.add(line.product);
    const held = have.get(line.product) ?? 0;
    if (held < line.quantity) {
      short.push({ product: line.product, want: line.quantity, have: held });
    }
  }

  /* ⚠️ EVERY EXTRA IS NAMED BY ITS OWN LABEL, not counted. "One too many" tells
     somebody a tray is wrong; the label tells them which thing to take out. */
  const stray = members.filter((of) => !wanted.has(of.product)).map((of) => of.id);
  return { short, stray };
}

/**
 * ⚠️ A RECIPE ARRIVES AS JSON AND IS READ DEFENSIVELY, because it was written by
 * somebody editing a product long before this kit existed. A malformed line is
 * dropped rather than throwing: a tray that cannot be checked at all is worse
 * than one checked against the lines that make sense.
 */
export function wantsIn(of: unknown): readonly Wants[] {
  if (!Array.isArray(of)) return [];
  const out: Wants[] = [];
  for (const line of of) {
    if (!line || typeof line !== "object") continue;
    const product = (line as { product?: unknown }).product;
    const quantity = Number((line as { quantity?: unknown }).quantity ?? 1);
    if (typeof product !== "string" || !product) continue;
    if (!Number.isFinite(quantity) || quantity < 1) continue;
    out.push({ product, quantity: Math.trunc(quantity) });
  }
  return out;
}
