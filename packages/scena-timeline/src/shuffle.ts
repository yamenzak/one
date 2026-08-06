/**
 * Deterministic, seedable shuffle.
 *
 * Shuffle must produce a byte-identical order on every screen so a "random"
 * playlist stays frame-synced (BLUEPRINT §1). We therefore never call
 * `Math.random()` — the order is a pure function of (item count, cycle index,
 * playlist seed). Same inputs anywhere → same permutation.
 */

/** xmur3 string hash → 32-bit seed generator. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG — tiny, fast, good enough for shuffling. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a PRNG from a string seed. Combine a stable playlist seed with the
 * cycle index so each cycle reshuffles but every screen agrees.
 */
export function rngFor(seed: string, cycleIndex: number): () => number {
  const gen = xmur3(`${seed}:${cycleIndex}`);
  return mulberry32(gen());
}

/**
 * Return the item order for a given cycle as an array of original indices.
 * `count` items → a permutation of [0, count). Fisher–Yates driven by `rngFor`.
 *
 * `cycleIndex` advances every cycle; the same (seed, cycleIndex, count) always
 * yields the same permutation, so shuffled playout stays in sync across screens.
 *
 * The player resolves the timeline every animation frame (~60×/sec) but the
 * order only changes at a cycle boundary, so a single-entry memo returns the
 * same permutation for the whole cycle instead of re-hashing + re-permuting each
 * frame. The result is treated as read-only by callers (never mutated), so
 * handing back the cached array is safe.
 */
let memoKey = "";
let memoOrder: number[] = [];
export function shuffledOrder(count: number, seed: string, cycleIndex: number): number[] {
  const key = `${seed}:${cycleIndex}:${count}`;
  if (key === memoKey) return memoOrder;
  const order = Array.from({ length: count }, (_, i) => i);
  if (count >= 2) {
    const rng = rngFor(seed, cycleIndex);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
  }
  memoKey = key;
  memoOrder = order;
  return order;
}
