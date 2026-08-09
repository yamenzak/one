/**
 * A SQL store that records what it was asked, and can be told to refuse.
 *
 * Enough of SQLite to answer the questions the schema runner asks — which is
 * `schema_markers` and nothing else — and no more, because a fake that
 * implements a database is a database with different bugs.
 */

import type { SqlHandle } from "@one/kernel";
import { bindingsFor, type RawSql } from "../src/env.js";
import { sql } from "@one/kernel";

export interface Recorder {
  sql: RawSql;
  readonly batches: string[][];
  readonly runs: { sql: string; params: unknown[] }[];
  /** Statements matching this are rejected, as SQLite would reject a re-run. */
  refuse?: RegExp;
  markers: Map<string, { ddl: string; alters: string; backfills: string }>;
}

export function recorder(): Recorder {
  const r: Recorder = { batches: [], runs: [], markers: new Map(), sql: null as never };
  const statement = (sql: string, params: unknown[] = []): never => ({
    bind: (...p: unknown[]) => statement(sql, p),
    all: async () => {
      if (/FROM schema_markers/i.test(sql)) {
        return { results: [...r.markers].map(([module, f]) => ({ module, ...f })) };
      }
      return { results: [] };
    },
    first: async () => null,
    run: async () => {
      r.runs.push({ sql, params });
      const m = /INSERT INTO schema_markers/i.test(sql);
      if (m) r.markers.set(params[0] as string, { ddl: params[1] as string, alters: params[2] as string, backfills: params[3] as string });
      return {};
    },
    _sql: sql,
  }) as never;

  r.sql = {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: readonly unknown[]) => {
      const sqls = stmts.map((s) => (s as { _sql: string })._sql);
      if (r.refuse && sqls.some((s) => r.refuse!.test(s))) throw new Error("duplicate column name");
      r.batches.push(sqls);
      return {};
    },
    exec: async () => ({}),
  };
  return r;
}

/** Through the real wrapper, so the fake is held to the same narrow handle. */
export const handleOf = (r: Recorder): SqlHandle =>
  bindingsFor({ db: sql() }, { DB: r.sql }, { defaultRegion: "auto" })("auto" as never).db;
