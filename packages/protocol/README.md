# @kova/protocol

The zod wire schemas shared between `apps/api` and `apps/app`: plan bodies, log
payloads, the session context, the AI feature metadata.

**Deliberately NOT extracted**, and the reason is worth stating: wire schemas are
per-app by definition. Every 4DL app gets its own `@<app>/protocol`. Only the
envelope conventions are shared, and those are two types — not a package.

The value is the same in each app: a plan body or a check-in payload is a JSON
column, so nothing in D1 validates its shape. These schemas are validated at the
ROUTE boundary, which is the one place where a malformed body can still be
refused rather than stored and discovered later by a reader that crashes on it.
