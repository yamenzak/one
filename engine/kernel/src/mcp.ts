/**
 * EVERY OPERATION IS AN AGENT TOOL, DERIVED — NEVER A SECOND LIST (D13).
 *
 * ⚠️ THE TOOL CATALOGUE IS A PROJECTION OF THE DECLARATIONS, exactly as the
 * routes and the audit entries are (D12). A hand-registered tool list is a list
 * that drifts: an operation renamed keeps its old tool, an operation added ships
 * without one, and an operation that opted out for a stated reason gets re-added
 * by somebody who cannot see the reason. Everything here is derivable from
 * `OperationSpec` and `Fields`, so none of those states can be reached.
 *
 * ⚠️ AND THE OPT-OUT IS THE INTERESTING HALF. `tool: { why }` on an operation is
 * a sentence in review — anything that grants access, spends money or mints a
 * credential says why a model must not reach it, and this module is where that
 * refusal takes effect: `toolFor` answers `null` and the operation is neither
 * listed nor callable through the agent door, whatever the caller's permissions.
 *
 * ⚠️ PURE, LIKE EVERYTHING IN THE KERNEL. The wire protocol — JSON-RPC, headers,
 * sessions — is the runtime's; this file only decides WHAT a tool is, which is a
 * question about declarations and needs no fixture to prove.
 *
 * Layer 2. Imports field, operation.
 */

import type { Fields, FieldSpec } from "./field.js";
import type { AnyOperation } from "./operation.js";
import { isTool } from "./operation.js";

/* ------------------------------------------------------------- the schema --- */

/**
 * The JSON Schema a declared field projects to.
 *
 * ⚠️ A HINT FOR THE MODEL, A CONTRACT FOR NOBODY. The runtime validates input
 * with `checkerFor` — the same validator the HTTP door uses — so this schema
 * only has to DESCRIBE the field well enough for an agent to fill it. The two
 * can never disagree in a way that matters: a value the schema permits and the
 * checker refuses is refused, in the checker's words.
 */
export interface JsonSchema {
  readonly type?: string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly format?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

const FORMAT: Partial<Record<FieldSpec["kind"], string>> = {
  email: "email",
  url: "uri",
  instant: "date-time",
  day: "date",
};

export function schemaForField(spec: FieldSpec): JsonSchema {
  const description = spec.help ? `${spec.label}. ${spec.help}` : spec.label;
  switch (spec.kind) {
    case "number":
      return { type: "number", description };
    /* ⚠️ MONEY IS AN INTEGER OF MINOR UNITS, and the schema says so — a model
       given "number" sends 19.99 and the checker refuses it as a non-integer,
       which is a round trip the description prevents. */
    case "money":
      return { type: "integer", description: `${description} (minor units — cents, never a decimal)` };
    case "bool":
      return { type: "boolean", description };
    case "enum":
      return { type: "string", description, enum: spec.values ?? [] };
    case "json":
      return { description };
    default:
      return {
        type: "string",
        description,
        ...(FORMAT[spec.kind] ? { format: FORMAT[spec.kind] } : {}),
      };
  }
}

export function schemaForFields(fields: Fields): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(fields)) {
    properties[name] = schemaForField(spec);
    if (spec.required) required.push(name);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    /* ⚠️ Closed, because the checker is: a field nobody declared is refused
       rather than ignored, and the schema should not invite what will be
       refused. */
    additionalProperties: false,
  };
}

/* --------------------------------------------------------------- the tool --- */

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

/**
 * ⚠️ `null` IS A DECISION, NOT AN ABSENCE. An operation that opted out with a
 * reason projects to nothing — not a hidden tool, not a listed-but-refused one.
 * The runtime treats `null` as "this does not exist on the agent door", which
 * keeps the refusal indistinguishable from the operation never having existed —
 * an unlisted tool that answered "forbidden" would confirm its own name.
 */
export const toolFor = (op: AnyOperation): McpTool | null =>
  isTool(op)
    ? { name: op.id, description: op.summary, inputSchema: schemaForFields(op.input) }
    : null;
