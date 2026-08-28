/**
 * WHAT THE SHELF IS WORTH — pure, with no database.
 *
 * ⚠️ ONE METHOD, AND THE OTHER THREE ARE REFUSED. ERPNext offers FIFO, LIFO,
 * moving average and standard cost, per item, over a global default. FIFO and
 * LIFO need a QUEUE per key — a list of `[qty, rate]` bins that has to be
 * replayed from the beginning whenever anything lands out of order — and that
 * queue is the whole reason a mature stock ledger grows a reposting subsystem,
 * a job runner, concurrency gates and six reports whose only job is to find
 * ledgers that have gone wrong. A moving average holds one number and needs
 * none of it.
 *
 * ⚠️ AND THE PRICE OF THAT IS SAID OUT LOUD: a moving average cannot tell you
 * which delivery a unit came from, so it cannot value a recall by lot. Where
 * that matters the product already has BATCHES, and the rate is per batch —
 * which is FIFO's answer to the only question FIFO is better at, arrived at
 * from the other direction and without the queue.
 *
 * ⚠️ THE RATE IS PER (PRODUCT × PLACE × BATCH), THE SAME KEY THE BALANCE USES.
 * Per product alone would make "what is this shelf worth" unanswerable, and that
 * is a question somebody standing in a doorway actually asks. Per place means a
 * transfer has to CARRY the rate across — see `moved` — or moving a pallet
 * would change what a warehouse is worth without anything being bought or sold.
 *
 * ⚠️ AND THE RATE IS IN MILLI, WHICH IS NOT FUSSINESS. A rate in whole minor
 * units cannot hold €0.023: a thousand screws would value at €20 against a real
 * €23, wrong by 13% in the direction that flatters. Thousandths of a minor unit
 * carry it exactly. The VALUE is in minor units, because that is what a person
 * reads and what `field.money` holds. The AI lane already settles in milli, so
 * the shape is not new to this codebase.
 *
 * ⚠️ A LINE'S VALUE IS DERIVED, NEVER ACCUMULATED, AND THAT IS THE DECISION THAT
 * KEEPS THIS SMALL. What a shelf is worth is `quantity × rate`, computed fresh
 * every time it is asked. What the LEDGER carries is a different fact — what
 * each movement cost at the moment it happened, which is what a cost-of-goods
 * question needs and what a repricing must never rewrite. The two do not have to
 * reconcile, and not requiring them to is why there is no invariant here to
 * drift. ERPNext keeps an accumulated `stock_value` beside the derivation and
 * ships six reports whose only job is to find the two disagreeing.
 */

/** ⚠️ One minor unit, in the milli the rate is carried in. */
export const MILLI = 1000;

/**
 * WHAT ONE LINE OF STOCK IS WORTH.
 *
 * ⚠️ `rate` IS `null` UNTIL SOMEBODY HAS SAID WHAT SOMETHING COST, AND THAT IS
 * NOT THE SAME AS NOUGHT. A workspace that has never entered a price has an
 * UNKNOWN value, and drawing that as "£0" over a full warehouse is the confident
 * empty with a currency symbol on it. Every function here preserves the
 * distinction rather than defaulting it away.
 */
export interface Held {
  readonly quantity: number;
  /** ⚠️ Milli minor units per unit — see the header. `null` is "nobody has said". */
  readonly rate: number | null;
}

/** What a movement did to a line's worth. */
export interface Costed {
  /** The line's rate after the movement, in milli. */
  readonly rate: number | null;
  /**
   * WHAT THE VALUE MOVED BY, IN MINOR UNITS, SIGNED.
   *
   * ⚠️ THIS IS THE NUMBER A SALES SIDE WILL ASK FOR. On a take it is what the
   * stock that left COST — the cost of goods sold, computed at the moment the
   * goods went, from the rate that was standing then. Computing it afterwards
   * means computing it against a rate that has since moved, which is the one
   * arithmetic error in this whole area that nobody notices.
   */
  readonly moved: number;
}

/**
 * ⚠️ THE ONE PLACE A QUANTITY IS MULTIPLIED BY A RATE, and everything else calls
 * it. A blend written out at a call site is a second answer to what a line is
 * worth, which is the shape `packing.ts` was split out to stop one question
 * over — and the packing guard reads a dotted `held.rate` as the name `held`,
 * so a raw `held.quantity * held.rate` reports as a loose multiplier and is
 * indistinguishable from the fault that guard exists for.
 */
const milliOf = (quantity: number, rate: number): number => quantity * rate;

/** ⚠️ Minor units from a quantity and a milli rate, rounded once, at the end. */
export const worth = (quantity: number, rate: number | null): number | null =>
  (rate === null ? null : Math.round(milliOf(quantity, rate) / MILLI));

/**
 * STOCK ARRIVES AT A PRICE, AND THE RATE BLENDS.
 *
 * ⚠️ THE BLEND IS OVER WHAT IS ALREADY THERE, WHICH IS WHY THE OLD RATE MATTERS
 * AND THE OLD QUANTITY MATTERS MORE. Receiving ten at 500 onto a shelf holding
 * a thousand at 100 moves the rate by four, not to 300 — an average that ignored
 * the quantities would reprice a warehouse on one small delivery.
 *
 * ⚠️ AND A DELIVERY WITH NO PRICE LEAVES THE RATE ALONE. Somebody receiving
 * stock without knowing what it cost is the ordinary case, not an error; the
 * shelf keeps whatever it was worth per unit and the value grows by that. What
 * is never done is treating "no price given" as "it was free", which would
 * quietly drag the whole shelf's rate towards zero one delivery at a time.
 */
export function received(held: Held, quantity: number, paid: number | null): Costed {
  if (paid === null) {
    return { rate: held.rate, moved: worth(quantity, held.rate) ?? 0 };
  }
  /*
    ⚠️ A FIRST PRICE REPRICES WHAT WAS ALREADY THERE, and that is deliberate. A
    shelf holding ten nobody costed and receiving five at a known price is now a
    shelf of fifteen at that price — an estimate, and a better one than "unknown"
    or than nought. What the ledger records is only what was PAID for the five;
    the repricing of the other ten is not a movement and does not belong in a
    history of movements. That separation is what the header means by derived.
  */
  if (held.rate === null || held.quantity <= 0) {
    return { rate: paid, moved: worth(quantity, paid) ?? 0 };
  }
  const before = milliOf(held.quantity, held.rate);
  const coming = milliOf(quantity, paid);
  const rate = Math.round((before + coming) / (held.quantity + quantity));
  return { rate, moved: worth(quantity, paid) ?? 0 };
}

/**
 * STOCK LEAVES AT WHAT IT WAS WORTH, AND THE RATE DOES NOT MOVE.
 *
 * ⚠️ TAKING DOES NOT REPRICE ANYTHING. What is left on the shelf is worth per
 * unit exactly what it was worth a moment ago; only the count changed. A method
 * that moved the rate on the way out would make the value of a warehouse depend
 * on how often somebody visited it.
 */
export const taken = (held: Held, quantity: number): Costed =>
  ({ rate: held.rate, moved: -(worth(quantity, held.rate) ?? 0) });

/**
 * A TRANSFER CARRIES THE RATE ACROSS, AND THAT IS WHAT CONSERVES THE TOTAL.
 *
 * ⚠️ MOVING A PALLET MUST NOT CHANGE WHAT A WAREHOUSE IS WORTH. The source loses
 * quantity × its own rate and the destination gains the same money, blended into
 * whatever was already there — so the two halves cancel and the shelves stay
 * separately answerable. A destination that priced the arrival at its OWN
 * standing rate would create or destroy value on every transfer between two
 * shelves holding the same thing at different prices, which is most of them.
 *
 * ⚠️ AND A SOURCE THAT HAS NO RATE HANDS ONE ACROSS. Unknown stays unknown; the
 * destination does not invent a price because it happens to have one.
 */
export const moved = (from: Held, to: Held, quantity: number):
{ readonly out: Costed; readonly in: Costed } => ({
  out: taken(from, quantity),
  in: received(to, quantity, from.rate),
});

/**
 * A CORRECTION MOVES VALUE AT THE STANDING RATE, BECAUSE IT IS NOT A PURCHASE.
 *
 * ⚠️ FINDING TWO MORE ON A SHELF IS NOT BUYING TWO MORE. Nothing was paid, so
 * nothing repriced; the count was wrong and the value follows it at whatever the
 * shelf is worth per unit. `delta` is signed, so this is the same arithmetic
 * whichever way the correction goes.
 *
 * ⚠️ AND THIS IS WHERE A RECOUNT LANDS TOO. `product.recount` is a deliberate
 * change to a number, and the value difference it produces is a fact somebody
 * should see rather than a rounding the ledger absorbs.
 */
export const adjusted = (held: Held, delta: number): Costed =>
  ({ rate: held.rate, moved: worth(delta, held.rate) ?? 0 });

/**
 * ⚠️ WHAT A DELIVERY COST ONCE THE CARRIAGE IS ON IT — see `buying`. Freight,
 * duty and handling are a real part of what stock cost, and an order that
 * charged them separately would value the shelf below what the business paid.
 *
 * ⚠️ SPREAD BY VALUE, NOT BY COUNT. A pallet of paper and a box of scalpels on
 * one van did not consume the same share of the freight, and splitting it per
 * line would put most of a delivery's carriage on whatever happened to be
 * cheapest. Where a line's own value is unknown it takes no share, because a
 * share of an unknown is a number nobody can defend.
 */
export function spread(
  lines: readonly { readonly id: string; readonly value: number | null }[],
  carriage: number,
): ReadonlyMap<string, number> {
  const known = lines.filter((one) => one.value !== null && one.value > 0);
  const total = known.reduce((sum, one) => sum + (one.value ?? 0), 0);
  const share = new Map<string, number>();
  if (!carriage || total <= 0) return share;
  /* ⚠️ THE LAST LINE TAKES THE REMAINDER, so the shares sum to the carriage
     exactly. Rounding each independently loses or invents a penny, and a penny
     that appears from nowhere on a value report is the whole report's
     credibility. */
  let left = carriage;
  known.forEach((one, i) => {
    const cut = i === known.length - 1
      ? left
      : Math.round((carriage * (one.value ?? 0)) / total);
    share.set(one.id, cut);
    left -= cut;
  });
  return share;
}

/**
 * WHAT A LINE'S WORTH SAYS.
 *
 * ⚠️ UNKNOWN IS A SENTENCE, NOT A BLANK AND NOT A NOUGHT. A shelf nobody has
 * priced has to say so — "£0" over a full warehouse is a confident lie, and an
 * empty cell reads as a number that failed to load.
 *
 * ⚠️ AND THE EACH-RATE IS DROPPED WHERE IT CANNOT BE SAID TRUTHFULLY. It is
 * noise on a single drill, where the two numbers are the same number twice —
 * and it is a LIE wherever the rate is not a whole number of minor units,
 * because `money` takes minor units and 2.3 pence would draw as "£0.02". That
 * is the 13% error the milli rate exists to prevent, arriving on the screen
 * instead of in the database.
 *
 * ⚠️ THE TEST IS THE REMAINDER, NOT THE SIZE, and the first attempt at this got
 * it wrong: a guard reading "at least one minor unit" passes 2.3 pence happily,
 * because 2.3 is more than 1. What matters is whether the number survives the
 * formatter, and a rate with anything after the decimal point does not. The
 * value beside it stays exact either way, and a screen that must show a
 * sub-penny rate needs a formatter that is not a currency.
 */
export const saysWorth = (
  held: Held, money: (minor: number) => string,
): string => {
  if (held.rate === null) return "Not priced yet";
  const value = worth(held.quantity, held.rate) ?? 0;
  return held.quantity > 1 && held.rate % MILLI === 0
    ? `${money(value)} · ${money(held.rate / MILLI)} each`
    : money(value);
};
