/**
 * A DURABLE ACTOR THAT CAN MOVE.
 *
 * ⚠️ `Relocatable` IS A CONTRACT FROM THE FIRST ACTOR, NOT A RETROFIT. Durable
 * storage cannot be relocated across jurisdictions, and a jurisdiction-scoped
 * namespace mints different ids for the same name — so a region change is seal,
 * export, recreate, import, verify, repoint. Every class written before the rule
 * exists is one that has to be rewritten to obey it, on live state.
 *
 * ⚠️ AND `seal` IS THE PART THAT MATTERS. This holds a balance. A move that gets
 * it wrong either mints value or destroys it, silently, on the money path — so
 * the source refuses further writes and is never reopened. That is a state
 * machine on the object rather than a discipline in whoever runs the migration.
 */

import type { Relocatable } from "@one/runtime";

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T>(): Promise<Map<string, T>>;
}

export class TenantLedgerActor implements Relocatable {
  constructor(private readonly state: { storage: Storage }) {}

  private async sealed(): Promise<boolean> {
    return (await this.state.storage.get<boolean>("sealed")) === true;
  }

  async credit(unit: string, amount: number): Promise<number> {
    /*
      ⚠️ A SEALED ACTOR REFUSES, LOUDLY. Accepting a write after the export has
      been taken means the value exists in the source and not in the target, and
      nothing anywhere compares the two again.
    */
    if (await this.sealed()) throw new Error("sealed: this actor has been relocated");
    const held = (await this.state.storage.get<number>(`balance:${unit}`)) ?? 0;
    const next = held + amount;
    await this.state.storage.put(`balance:${unit}`, next);
    return next;
  }

  async balance(unit: string): Promise<number> {
    return (await this.state.storage.get<number>(`balance:${unit}`)) ?? 0;
  }

  /**
   * ⚠️ THE HASH IS OF THE STATE, TAKEN AT THE MOMENT WRITES STOP. It is what the
   * target is compared against — a copy that reported success without one is a
   * copy nobody checked.
   */
  async seal(): Promise<{ hash: string }> {
    await this.state.storage.put("sealed", true);
    const bytes = await this.exportState();
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return { hash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("") };
  }

  async exportState(): Promise<Uint8Array> {
    const all = await this.state.storage.list<unknown>();
    // Sorted, so the same state hashes the same however it was written.
    const entries = [...all].filter(([k]) => k !== "sealed").sort(([a], [b]) => a.localeCompare(b));
    return new TextEncoder().encode(JSON.stringify(entries));
  }

  async importState(bytes: Uint8Array): Promise<void> {
    if (await this.sealed()) throw new Error("sealed: this actor has been relocated");
    const entries = JSON.parse(new TextDecoder().decode(bytes)) as [string, unknown][];
    for (const [key, value] of entries) await this.state.storage.put(key, value);
  }
}
