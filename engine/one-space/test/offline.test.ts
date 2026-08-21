/**
 * THE OFFLINE LANE — a write that survives no signal, and a read that answers
 * without one.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A DEVICE THAT CANNOT REACH THE SERVER, which
 * is the one state no other suite in this tree can produce. The worker suites
 * have a database; the screen suites have props. What decides whether somebody
 * counting a shelf in the back of a warehouse loses their morning is what this
 * file does with a `fetch` that throws.
 *
 * ⚠️ AND THE STORE IS REAL, NOT MOCKED AWAY. `localStorage` is the whole
 * mechanism — its size limit, its throwing accessors and its per-origin scope
 * are the design — so the fake below implements the interface rather than the
 * outcome, including throwing when it is full.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ world --- */

/** ⚠️ IT THROWS WHEN IT IS FULL, because a browser does and the queue's whole
    ceiling behaviour is a response to that. A fake that silently accepted
    everything would pass a queue that loses writes on a real phone. */
class Store {
  private held = new Map<string, string>();
  limit = 5_000_000;
  get length() { return this.held.size; }
  key(i: number) { return [...this.held.keys()][i] ?? null; }
  getItem(k: string) { return this.held.get(k) ?? null; }
  setItem(k: string, v: string) {
    const size = [...this.held.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0);
    if (size + k.length + v.length > this.limit) throw new Error("QuotaExceededError");
    this.held.set(k, v);
  }
  removeItem(k: string) { this.held.delete(k); }
  clear() { this.held.clear(); }
}

let store: Store;
let sent: { url: string; init: RequestInit }[];
/** ⚠️ `null` is a request that never arrived — no status, no body. */
let answer: (url: string) => { status: number; body?: unknown } | null;

const answering = (status: number, body: unknown = {}) => () => ({ status, body });
const unreachable = () => null;

beforeEach(async () => {
  store = new Store();
  sent = [];
  answer = answering(200, { ok: true });
  (globalThis as unknown as { localStorage?: Store }).localStorage = store;
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    sent.push({ url, init });
    const out = answer(url);
    if (!out) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { "content-type": "application/json" },
    }));
  });
  vi.resetModules();
});

/* ⚠️ IMPORTED PER TEST, because the door holds the policy in module state — a
   shared import would carry one test's declaration into the next. */
const door = async () => {
  const mod = await import("../src/api.js");
  const off = await import("../src/offline.js");
  mod.offlinePolicy({
    "note.create": "queue", "note.update": "queue",
    "note.list": "cache", "check-in.list": "cache",
  });
  return { ...mod, ...off };
};

/* ------------------------------------------------------------------ queue --- */

describe("a write with no signal", () => {
  it("is held, and says so rather than reporting success", async () => {
    const { api, heldHere } = await door();
    answer = unreachable;

    const out = await api.post("note.create", { title: "Counted shelf B3" });

    /* ⚠️ NOT `ok`. The write was kept and will be sent; what did not happen is
       the server agreeing to it, and a door that answered `ok` would be deciding
       an answer it never received. */
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.problem.code).toBe("space.held");
    expect(heldHere()).toBe(1);
  });

  it("is NOT held when the collection did not say so", async () => {
    const { api, heldHere } = await door();
    answer = unreachable;

    const out = await api.post("member.invite", { email: "sam@example.com" });

    expect(out.ok === false && out.problem.code).toBe("space.unreachable");
    /* ⚠️ Holding a write nobody declared holdable is the same failure as
       answering a read from a copy nobody declared cacheable, one direction
       over: this device deciding a promise the manifest never made. */
    expect(heldHere()).toBe(0);
  });

  it("carries one idempotency key, made once and sent on the replay", async () => {
    const { api, send, heldHere } = await door();
    answer = unreachable;
    await api.post("note.create", { title: "Counted shelf B3" });
    expect(heldHere()).toBe(1);

    answer = answering(200, { id: "n1" });
    sent = [];
    await send();

    expect(sent).toHaveLength(1);
    const key = (sent[0]!.init.headers as Record<string, string>)["idempotency-key"];
    /* ⚠️ THE WHOLE REASON THE REPLAY IS SAFE. A phone that held a write cannot
       know whether the first attempt landed, so it asks again — and without a
       key the platform can recognise, a shelf counted once is counted twice. */
    expect(key).toMatch(/^held_/);
    expect(heldHere()).toBe(0);
  });

  it("stops at the first entry it cannot send, and keeps the order", async () => {
    const { api, send, heldHere } = await door();
    answer = unreachable;
    await api.post("note.create", { title: "first" });
    await api.post("note.update", { id: "n1", title: "second" });
    expect(heldHere()).toBe(2);

    /* The first goes; the second cannot. */
    let n = 0;
    answer = () => (n++ === 0 ? { status: 200, body: {} } : null);
    await send();

    /* ⚠️ ONE LEFT, NOT NONE AND NOT TWO. A create and the update that follows it
       are two entries about one record; replayed out of order the update lands
       against nothing, so a pass that cannot send one stops rather than skipping
       to the next. */
    expect(heldHere()).toBe(1);
  });

  it("drops an entry the server refused, because that is an opinion", async () => {
    const { api, send, heldHere } = await door();
    answer = unreachable;
    await api.post("note.create", { title: "no longer allowed" });

    answer = answering(403, { problem: { code: "platform.forbidden" } });
    await send();

    /* ⚠️ A REFUSAL IS THE SERVER HAVING DECIDED. Retrying against a settled
       opinion is a device asking a closed door for ever, and what a person can
       do about it is the same either way. */
    expect(heldHere()).toBe(0);
  });

  it("refuses rather than dropping the oldest when the device is full", async () => {
    const { api, heldHere } = await door();
    answer = unreachable;
    await api.post("note.create", { title: "somebody's morning" });
    expect(heldHere()).toBe(1);

    store.limit = 40;
    const out = await api.post("note.create", { title: "the newest" });

    expect(out.ok === false && out.problem.code).toBe("space.full");
    /* ⚠️ THE ONE ANSWER A QUEUE MUST NEVER GIVE SILENTLY. Making room by
       discarding what is already held loses work at the moment nobody can see it
       happen. */
    expect(heldHere()).toBe(1);
  });
});

/* ------------------------------------------------------------------ cache --- */

describe("a read with no signal", () => {
  it("answers from the last one, and says how old it is", async () => {
    const { api } = await door();
    answer = answering(200, { items: [{ id: "n1" }] });
    const first = await api.get<{ items: unknown[] }>("note.list");
    expect(first.ok && first.value.items).toHaveLength(1);
    expect(first.ok && first.stale).toBeUndefined();

    answer = unreachable;
    const again = await api.get<{ items: unknown[] }>("note.list");

    expect(again.ok).toBe(true);
    expect(again.ok && again.value.items).toHaveLength(1);
    /* ⚠️ THE AGE IS THE HALF THAT MAKES IT HONEST. An answer from a copy and an
       answer from the server are the same shape and must never be the same
       claim. */
    expect(again.ok && again.stale).toBeTruthy();
  });

  it("keeps nothing for an operation the collection did not declare", async () => {
    const { api } = await door();
    answer = answering(200, { items: [] });
    await api.get("member.list");

    answer = unreachable;
    const again = await api.get("member.list");

    /* ⚠️ A COPY OF A WORKSPACE'S RECORDS ON EVERY DEVICE THAT EVER OPENED IT is
       what "cache everything" means. What is kept is what was declared. */
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.problem.code).toBe("space.unreachable");
  });

  it("keeps a filtered list apart from the unfiltered one", async () => {
    const { api } = await door();
    answer = answering(200, { items: [{ id: "everything" }] });
    await api.get("note.list");
    answer = answering(200, { items: [{ id: "just-this-week" }] });
    await api.get("note.list", { since: "2026-08-01" });

    answer = unreachable;
    const all = await api.get<{ items: { id: string }[] }>("note.list");

    /* ⚠️ ONE ANSWER PER QUESTION. Keyed on the operation alone, a filtered read
       would answer the unfiltered question under a different name — which reads
       as records having disappeared. */
    expect(all.ok && all.value.items[0]!.id).toBe("everything");
  });
});

/* ----------------------------------------------------------------- shared --- */

describe("a shared device", () => {
  it("keeps nothing across a sign-out", async () => {
    const { api, heldHere, forget } = await door();
    answer = answering(200, { items: [{ id: "n1" }] });
    await api.get("note.list");
    answer = unreachable;
    await api.post("note.create", { title: "mine" });
    expect(heldHere()).toBe(1);

    forget();

    /* ⚠️ A counter's phone and a shop's tablet are shared. A cached read is one
       workspace's records; a held write carries one person's authority. */
    expect(heldHere()).toBe(0);
    const again = await api.get("note.list");
    expect(again.ok).toBe(false);
  });
});
