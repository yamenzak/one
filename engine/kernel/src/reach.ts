/**
 * HOW FAR ONE PERSON'S REACH GOES INSIDE A WORKSPACE.
 *
 * ⚠️ A WORKSPACE IS NOT ALWAYS ONE PLACE, AND A ROSTER THAT ASSUMES IT IS SELLS
 * ONE BRANCH TO A BUSINESS WITH FOUR. The goods-in person at the second site can
 * see, move and count the first site's stock; the locum at one clinic reads
 * every clinic's shelves. Nothing refuses, nothing logs, and the product looks
 * like it is working.
 *
 * ⚠️ ONE DIMENSION PER PRODUCT AND NO SECOND. A business is narrowed by exactly
 * one thing — a site, a branch, a clinic — and two dimensions would make every
 * question about somebody's access a matrix nobody can answer at a roster
 * screen. An app that genuinely needs a second is an app whose second dimension
 * is a role, which it already has.
 *
 * ⚠️ REACH IS NOT A PERMISSION AND THE TWO MUST NOT BE MERGED. A permission says
 * WHAT somebody may do and applies wherever they are; reach says WHERE, and
 * applies to everything they may do. Folded into one set, "count stock at Site B"
 * becomes a key per site per verb — which is the shape that makes adding a
 * fifth site a code change.
 *
 * ⚠️ AND `null` IS THE WHOLE WORKSPACE, WHICH IS THE DEFAULT AND MUST STAY IT. A
 * grant nobody has set narrows nothing: a business with one site never sees this
 * concept, and every existing member keeps exactly what they had. An empty ARRAY
 * is a different answer — somebody narrowed to nowhere — and it reaches nothing,
 * deliberately, because the alternative is a typo widening access.
 *
 * Layer 2. Imports primitives.
 */

/**
 * WHAT A PRODUCT IS NARROWED BY, DECLARED ONCE.
 *
 * ⚠️ IT NAMES A COLLECTION RATHER THAN A LIST OF PLACES. The places are records
 * a workspace already keeps — its own locations, its own branches — so a second
 * list would be a second thing to keep in step, and the first time they
 * disagreed somebody would be granted a site that no longer exists.
 */
export interface ReachDef {
  /** The collection whose rows ARE the places. Its own `id` is the value. */
  readonly of: string;
  /**
   * ⚠️ THE FIELD THAT POINTS AT A PARENT, WHERE THE PLACES NEST. A warehouse
   * holds aisles and an aisle holds bins, so a grant to the warehouse has to
   * carry everything under it — otherwise granting a site means listing its
   * four hundred bins, and every bin added afterwards is invisible to the
   * person who works there.
   *
   * ⚠️ ABSENT MEANS FLAT, and flat is the honest default. A product whose
   * places do not nest must not pay for a walk that can only ever return the
   * node it started from.
   */
  readonly nests?: string;
  /** What a person calls one of them. `{ one: "Site", many: "Sites" }`. */
  readonly label: { readonly one: string; readonly many: string };
}

/**
 * WHAT ONE MEMBER REACHES, PER PRODUCT.
 *
 * ⚠️ PER APP, BECAUSE A WORKSPACE RUNS MORE THAN ONE. Somebody who keeps the
 * stock at one site may still be the person who reads every site's invoices, and
 * a single list on the membership would make those the same decision.
 */
export type ReachBook = Readonly<Record<string, readonly string[]>>;

/**
 * WHERE THIS PERSON REACHES IN THIS PRODUCT — `null` for the whole workspace.
 *
 * ⚠️ ONE RESOLVER, AND THE READ, THE WRITE, THE SCREEN AND THE ROSTER ALL ASK
 * IT. Two implementations of "where may they work" is how a list comes to hide
 * a row that a write would happily change.
 */
export const reachOf = (
  book: ReachBook | undefined, appId: string | null,
): readonly string[] | null => {
  if (!book || appId === null) return null;
  const held = book[appId];
  /* ⚠️ ABSENT IS THE WHOLE WORKSPACE; EMPTY IS NOWHERE. See the header — they
     are different answers and collapsing them is the direction that widens. */
  return held === undefined ? null : held;
};

/**
 * EVERY PLACE A GRANT ACTUALLY COVERS, GIVEN WHAT NESTS INSIDE WHAT.
 *
 * ⚠️ PURE, AND THE PARENT MAP IS THE CALLER'S TO SUPPLY. The walk is the rule;
 * reading a workspace's own places out of its database is not the kernel's, and
 * a rule that needed a database could not be tested as a table of cases.
 *
 * ⚠️ A CYCLE TERMINATES RATHER THAN HANGING. Nothing should be able to make a
 * location its own ancestor, and something eventually will — a bad import, a
 * hand-edited row — and the failure of a walk with no visited set is a request
 * that never answers, which reads as an outage rather than as bad data.
 */
export function spread(
  granted: readonly string[], parentOf: Readonly<Record<string, string | null>>,
): readonly string[] {
  const held = new Set(granted);
  const out = new Set(granted);
  for (const id of Object.keys(parentOf)) {
    if (out.has(id)) continue;
    const seen = new Set<string>([id]);
    let at: string | null | undefined = parentOf[id];
    while (at && !seen.has(at)) {
      if (held.has(at)) { out.add(id); break; }
      seen.add(at);
      at = parentOf[at];
    }
  }
  return [...out];
}

/**
 * WHETHER A ROW IS INSIDE SOMEBODY'S REACH.
 *
 * ⚠️ A ROW WITH NO PLACE ON IT IS INSIDE EVERY REACH, and that is a decision
 * rather than an oversight. A product's own catalogue — what a thing IS, as
 * against where any of it is — belongs to the whole workspace, so a collection
 * that declares no place column is never narrowed. What must not happen is a
 * collection that HAS one and forgets to say so, which is what the guard is for.
 */
export const inReach = (
  reach: readonly string[] | null, at: unknown,
): boolean => reach === null || (typeof at === "string" && reach.includes(at));

/* --------------------------------------------------------------- refusals --- */

/**
 * WHAT A REACH DECLARATION CAN GET WRONG, ALL OF IT SILENT.
 *
 * ⚠️ EVERY ONE OF THESE COMPOSES, SERVES, AND NARROWS NOTHING. A `reachBy`
 * naming a field the collection does not declare produces a filter on a column
 * that is not there — which either throws on the first list or, where the name
 * happens to exist as something else, narrows by the wrong thing. A `reach.of`
 * naming a collection that does not exist gives the roster a picker with no
 * places in it. And `nests` on a field that does not point back at the places
 * makes a grant to a warehouse cover the warehouse and nothing under it, which
 * is a person who can see the site and none of its shelves.
 */
export interface ReachFault {
  readonly of: string;
  readonly why: string;
}

export function refuseReach(
  reach: ReachDef | undefined,
  collections: readonly {
    readonly id: string;
    readonly reachBy?: string;
    readonly fields: Readonly<Record<string, { readonly to?: string }>>;
  }[],
): readonly ReachFault[] {
  const out: ReachFault[] = [];
  const narrowed = collections.filter((c) => c.reachBy !== undefined);

  if (!reach) {
    /* ⚠️ THE OTHER DIRECTION, AND IT IS THE ONE THAT WOULD SHIP. A collection
       saying where its records are, in a product that never says what a place
       IS, is a column nothing can ever be granted against — so the declaration
       reads as narrowed and every read is wide open. */
    for (const c of narrowed) {
      out.push({ of: c.id, why: "says where its records are in a product that declares no reach" });
    }
    return out;
  }

  const places = collections.find((c) => c.id === reach.of);
  if (!places) {
    out.push({ of: reach.of, why: "is not a collection, so a grant names nothing a workspace keeps" });
  } else if (reach.nests !== undefined) {
    const parent = places.fields[reach.nests];
    if (!parent) {
      out.push({ of: `${reach.of}.${reach.nests}`, why: "is not a field, so nothing under a place is inside a grant to it" });
    } else if (parent.to !== reach.of) {
      out.push({ of: `${reach.of}.${reach.nests}`, why: `points at ${parent.to ?? "nothing"} rather than back at ${reach.of}` });
    }
  }

  for (const c of narrowed) {
    /* ⚠️ `id` IS THE PLACES COLLECTION ITSELF — a place is the thing reached,
       so its own identifier is what a grant names. */
    if (c.reachBy === "id") continue;
    const field = c.fields[c.reachBy!];
    if (!field) {
      out.push({ of: `${c.id}.${c.reachBy}`, why: "is not a field, so every read of it would narrow by a column that is not there" });
    } else if (field.to !== reach.of) {
      out.push({ of: `${c.id}.${c.reachBy}`, why: `points at ${field.to ?? "nothing"} rather than at ${reach.of}` });
    }
  }
  return out;
}
