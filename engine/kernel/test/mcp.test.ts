/**
 * THE TOOL CATALOGUE IS A PROJECTION, AND THE PROJECTION IS PROVABLE (D13).
 *
 * ⚠️ NO FIXTURE, NO RUNTIME — a declaration in, a descriptor out. What these
 * pin is the part an agent actually reads: the schema's types, the money rule,
 * the closed object, and that an opt-out projects to NOTHING rather than to a
 * hidden tool.
 */

import { describe, expect, it } from "vitest";
import {
  field, operation, schemaForField, schemaForFields, toolFor,
  type AnyOperation,
} from "../src/index.js";

const op = (over: Partial<AnyOperation>): AnyOperation => operation({
  id: "note.publish",
  kind: "write",
  summary: "Make a note visible to everybody here",
  input: { id: field.text({ label: "Note", required: true, holds: "none" }) },
  output: {},
  permission: "note:write",
  idempotency: { mode: "none" },
  async handler() { return {}; },
  ...over,
} as never) as AnyOperation;

describe("what a field tells an agent", () => {
  it("projects each kind to the type the checker will hold it to", () => {
    expect(schemaForField(field.text({ label: "Title", holds: "none" }))).toMatchObject({ type: "string" });
    expect(schemaForField(field.number({ label: "Count", holds: "none" }))).toMatchObject({ type: "number" });
    expect(schemaForField(field.bool({ label: "Pinned", holds: "none" }))).toMatchObject({ type: "boolean" });
    expect(schemaForField(field.email({ label: "Email", holds: "contact" }))).toMatchObject({ format: "email" });
    expect(schemaForField(field.day({ label: "On", holds: "none" }))).toMatchObject({ format: "date" });
  });

  /* ⚠️ Money is an integer of minor units, and the schema SAYS so — a model
     given a bare "number" sends 19.99 and burns a round trip on the refusal. */
  it("tells the model money is minor units before it guesses decimals", () => {
    const money = schemaForField(field.money({ label: "Rate", holds: "financial" }));
    expect(money.type).toBe("integer");
    expect(money.description).toContain("minor units");
  });

  it("carries the closed set of an enum", () => {
    expect(schemaForField(field.enum({ label: "Kind", values: ["a", "b"], holds: "none" })).enum)
      .toEqual(["a", "b"]);
  });

  it("closes the object, because the checker refuses undeclared fields", () => {
    const schema = schemaForFields({
      title: field.text({ label: "Title", required: true, holds: "none" }),
      body: field.long({ label: "Body", holds: "none" }),
    });
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["title"]);
    expect(Object.keys(schema.properties ?? {})).toEqual(["title", "body"]);
  });
});

describe("what an operation projects to", () => {
  it("is a tool by default, named by its id, described by its summary", () => {
    const tool = toolFor(op({}));
    expect(tool).toMatchObject({ name: "note.publish", description: "Make a note visible to everybody here" });
    expect(tool?.inputSchema.required).toEqual(["id"]);
  });

  /* ⚠️ `null`, not a flagged tool: an opt-out that still appeared anywhere
     would confirm its own name to the model that was refused it. */
  it("projects an opt-out to nothing at all", () => {
    expect(toolFor(op({ tool: { why: "It spends credits." } } as never))).toBeNull();
  });

  /*
    ⚠️ THE FILTER THE RUNTIME RUNS, NOT A SECOND ONE. `toolsOf` used to map and
    filter this list here, and the catalogue the agent door actually serves
    cannot use it — that one is filtered per caller by the permission gate, so a
    whole-list helper is an answer to a question nobody asks.
  */
  it("drops the opt-outs from a catalogue without leaving a gap to count", () => {
    const tools = [
      op({}),
      op({ id: "credit.spend", tool: { why: "It spends." } } as never),
    ].map(toolFor).filter((t) => t !== null);
    expect(tools.map((t) => t.name)).toEqual(["note.publish"]);
  });
});
