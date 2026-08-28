/**
 * AN ORDER IS A PROMISE, AND A SHELF IS A FACT — pure, with no database.
 *
 * ⚠️ THE ORDER NEVER MOVES STOCK. Receiving against a line goes through the same
 * chokepoint `stock.receive` does, writes the same ledger row and counts against
 * the same quota; what this rail adds is which promise the movement answers. A
 * purchasing feature that wrote its own arrival path would be a second way for a
 * number on a shelf to change, and the first thing anyone would notice is two
 * histories disagreeing about the same carton.
 *
 * ⚠️ AND THE REPORT ALREADY KNEW WHAT TO BUY. `/report` has computed the list —
 * the product, how many, why, and who to ring — since OI-C, and there was
 * nothing to press. That is the gap this closes: not a new calculation, a way to
 * act on one the product already makes.
 */

/* ----------------------------------------------------------------- orders --- */

/**
 * WHERE AN ORDER STANDS.
 *
 * ⚠️ `closed` MEANS "NOTHING MORE IS COMING", NOT "EVERYTHING ARRIVED". A
 * supplier who sends eight of ten and will never send the other two leaves an
 * order that is finished and short, and a product whose only end state is
 * "received" makes somebody either lie about the two or leave the order open for
 * ever. Both are worse than a word that says what happened.
 *
 * ⚠️ AND `cancelled` IS REACHED ONLY WHILE NOTHING HAS ARRIVED. Cancelling an
 * order half of which is on the shelf would erase the record of why that stock
 * is there — the way out of a part-received order is to close it short.
 */
export const ORDERS = ["draft", "placed", "part", "closed", "cancelled"] as const;
export type Order = typeof ORDERS[number];

/** What can be done to an order. */
export const ORDER_ACTS = [
  "add", "drop", "place", "receive", "close", "cancel", "carriage",
] as const;
export type OrderAct = typeof ORDER_ACTS[number];

/**
 * ⚠️ THE TWO STANDINGS A DELIVERY CAN ARRIVE AGAINST, in one place because three
 * of the refusals below ask the same question and a fourth will be added by
 * somebody who does not know that.
 */
const AWAITED = (state: Order): boolean => state === "placed" || state === "part";

/**
 * WHY THIS CANNOT HAPPEN TO THIS ORDER, or nothing.
 *
 * ⚠️ EDITING THE LINES OF A PLACED ORDER IS THE ONE TO READ TWICE. The whole
 * value of the record is that it says what was asked for; a line quietly raised
 * from 10 to 12 after 12 turned up is a receipt that reconciles perfectly
 * against a promise nobody made. Once it is placed, the lines are what was
 * ordered — the way to change your mind is a second order, or a short close.
 */
export function refuseOrder(state: Order, act: OrderAct): string | null {
  switch (act) {
    case "add":
    case "drop":
      return state === "draft" ? null
        : state === "cancelled" ? "This order was cancelled"
          : "It has already been placed — what it asked for cannot change now";
    case "place":
      return state === "draft" ? null
        : state === "cancelled" ? "This order was cancelled"
          : "It has already been placed";
    case "receive":
      return AWAITED(state) ? null
        : state === "draft" ? "It has not been placed yet"
          : state === "cancelled" ? "This order was cancelled"
            : "It is closed — nothing more was expected";
    case "close":
      return AWAITED(state) ? null
        : state === "draft" ? "It has not been placed yet"
          : "It is already finished";
    case "cancel":
      /* ⚠️ `part` IS ABSENT ON PURPOSE — see the header on `cancelled`. */
      return state === "draft" || state === "placed" ? null
        : state === "part" ? "Some of it has already arrived — close it short instead"
          : "It is already finished";
    case "carriage":
      /*
        ⚠️ THE CARRIAGE STOPS BEING EDITABLE THE MOMENT ANYTHING ARRIVES, AND
        `part` IS EXACTLY THAT MOMENT. A receipt is priced with the share of the
        carriage that stood when it landed — see `landed` — so moving the total
        afterwards leaves the shares adding up to a figure that was never
        charged, with nothing anywhere saying which of the two is the delivery
        note. Refusing is the whole of the alternative to a reposting subsystem.

        ⚠️ AND IT IS EDITABLE AFTER PLACING, WHICH IS THE POINT OF THE RUNG.
        Freight is quoted on the invoice, not on the order, so a carriage that
        could only be entered on a draft would be a field nobody could ever fill
        in truthfully.
      */
      return state === "draft" || state === "placed" ? null
        : state === "part" ? "Some of it has already arrived — its share of the carriage is fixed"
          : state === "cancelled" ? "This order was cancelled"
            : "It is closed";
  }
}

/* ------------------------------------------------------------------ lines --- */

/**
 * ONE PRODUCT ON ONE ORDER: how many were asked for, and how many have come.
 *
 * ⚠️ `had` IS CUMULATIVE ACROSS DELIVERIES, because one line is very often two
 * vans. A field holding the last delivery would make an order that arrived in
 * halves read as half-received for ever.
 */
export interface Line {
  readonly product: string;
  readonly asked: number;
  readonly had: number;
}

/**
 * ⚠️ CLAMPED AT NOUGHT, BECAUSE OVER-DELIVERY IS ALLOWED — see `refuseArrival`.
 * Without the clamp a line that received twelve against ten reports minus two
 * outstanding, and an order's total then reads as less than the sum of what it
 * is still waiting for.
 */
export const outstanding = (line: Line): number => Math.max(0, line.asked - line.had);

/** ⚠️ Nothing left to wait for on any line — which is what closes an order. */
export const settled = (lines: readonly Line[]): boolean =>
  lines.every((one) => outstanding(one) === 0);

/**
 * WHETHER THIS QUANTITY MAY BE RECEIVED AGAINST THIS LINE.
 *
 * ⚠️ MORE THAN WAS ORDERED IS ALLOWED, AND THAT IS THE DECISION. Suppliers
 * over-ship — a case of 12 against an order for 10 is an ordinary Tuesday — and
 * refusing it would mean the shelf could not be told what is physically on it,
 * which is a product making its own paperwork more important than the stock it
 * exists to count. The shelf is the fact and the order is the promise; where
 * they disagree, the promise is what was wrong.
 *
 * ⚠️ WHAT IS REFUSED IS NOUGHT AND BELOW. A receipt of none is a press that did
 * nothing wearing the clothes of a delivery, and a negative one is a return,
 * which is `stock.take` and a different sentence.
 */
export function refuseArrival(quantity: number): string | null {
  if (!Number.isFinite(quantity) || Math.floor(quantity) !== quantity) {
    return "How many arrived has to be a whole number";
  }
  return quantity > 0 ? null : "Say how many arrived";
}

/**
 * WHERE AN ORDER STANDS AFTER A DELIVERY LANDS ON IT.
 *
 * ⚠️ IT CLOSES ITSELF, and that is worth the branch. Nobody who has just
 * received the last box of an order wants to be asked to press a second button
 * saying so — and an order left open because they did not is one that shows up
 * for ever on the list of what is still coming.
 */
export const afterArrival = (lines: readonly Line[]): Order =>
  (settled(lines) ? "closed" : "part");

/* ----------------------------------------------------------- what to order --- */

/**
 * ⚠️ WHAT THE REPORT ALREADY SAYS, TURNED INTO LINES — see `stock.report`'s
 * `buy`. Grouping is by SUPPLIER because an order goes to one of them, and a
 * screen that offered "order everything" would produce one order nobody can
 * send.
 *
 * ⚠️ A PRODUCT WITH NO SUPPLIER IS NOT DROPPED, IT IS ITS OWN GROUP. Silently
 * omitting it would make the shortest list the one for a workspace that has
 * never filled in a supplier — which is every workspace, on the day they most
 * need to know what to buy. The empty key is what the screen draws as
 * "Nobody named yet".
 */
export const groupBySupplier = <T extends { readonly supplier?: string | null }>(
  rows: readonly T[],
): readonly (readonly [string, readonly T[]])[] => {
  const by = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.supplier ?? "";
    const held = by.get(key);
    if (held) held.push(row);
    else by.set(key, [row]);
  }
  return [...by.entries()];
};

/**
 * ONE LINE AS A SENTENCE — what was asked for, what has come, what is left.
 *
 * ⚠️ TWO NUMBERS IN TWO COLUMNS IS TWO NUMBERS NOBODY CAN TELL APART, and the
 * photograph is what said so. A `Listing` folds to a name, a line under it and
 * one value at the end, so "Ordered 20" and "Arrived 0" arrive as `20` and `0`
 * with nothing saying which is which — the same fault as a boolean folding to a
 * bare "Yes", with digits. What somebody opens an order to read is the GAP
 * between the two, which is a fact neither column holds.
 *
 * ⚠️ AND IT IS ONE STRING RATHER THAN A FORMATTER, because the interesting part
 * is the arithmetic and the arithmetic is here. A screen that assembled this
 * from three columns would be a second place the subtraction happens.
 */
export function saysLine(line: Line): string {
  const left = outstanding(line);
  if (line.had === 0) return `${line.asked} ordered, none yet`;
  if (left === 0) {
    return line.had > line.asked
      ? `${line.asked} ordered, ${line.had} arrived — ${line.had - line.asked} more than asked`
      : `All ${line.asked} arrived`;
  }
  return `${line.had} of ${line.asked} arrived, ${left} to come`;
}
