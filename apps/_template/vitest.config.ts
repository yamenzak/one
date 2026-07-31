import { defineConfig } from "vitest/config";

/**
 * Plain Node, not the Workers pool.
 *
 * The template's tests are the CONFORMANCE checks — schema invariants and the
 * erasure cascade — and every one of them reads declarations rather than running
 * SQL. They stay fast and dependency-free on purpose: a new app inherits them on
 * day one, before it has a database to point at.
 */
export default defineConfig({ test: { globals: true, include: ["test/**/*.test.ts"] } });
