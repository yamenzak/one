/**
 * WHAT A MODEL WROTE, SPLIT INTO BLOCKS — the half that has no pixels in it.
 *
 * ⚠️ EVERY BUG THIS KIND OF CODE HAS IS IN THE SPLITTING, and none of them needs
 * a renderer to find: a paragraph that swallows the list under it, a fence that
 * never closes and eats the rest of the document, a heading that only works when
 * it is the first line. The rendering is a `map` over the result.
 *
 * ⚠️ AND THE INPUT IS UNTRUSTED IN THE MOST ORDINARY WAY. This text is a model's
 * reading of a photograph of a label somebody else printed — so the assertion
 * that nothing is ever interpreted as markup matters as much as the ones about
 * bullets.
 */

import { describe, expect, it } from "vitest";
import { readInline, readProse } from "../src/parts/prose.js";

const kinds = (source: string) => readProse(source).map((b) => b.kind);

describe("blocks", () => {
  /*
    ⚠️ THE ONE THAT BROKE EVERY NAIVE PARSER I HAVE WRITTEN. A warning followed
    immediately by its cases is how anybody actually writes this, and a paragraph
    defined as "runs to the next blank line" eats the whole list as more
    sentences — so the storage notes render as one long run-on and the four
    things that must not touch each other disappear into it.
  */
  it("does not let a paragraph swallow the list under it", () => {
    const said = readProse("Keep it dry.\n- Away from acids\n- Away from heat");
    expect(said.map((b) => b.kind)).toEqual(["para", "bullets"]);
    expect(said[1]?.lines).toEqual(["Away from acids", "Away from heat"]);
  });

  it("reads headings, and flattens anything deeper than three", () => {
    const said = readProse("# One\n\n## Two\n\n###### Six");
    expect(said.map((b) => b.rank)).toEqual([1, 2, 3]);
  });

  it("tells a numbered list from a bulleted one", () => {
    expect(kinds("1. First\n2. Second")).toEqual(["steps"]);
    expect(kinds("* First\n* Second")).toEqual(["bullets"]);
  });

  /*
    ⚠️ AN UNCLOSED FENCE MUST NOT DISCARD THE DOCUMENT. Three backticks and a
    forgotten closing pair is a common thing for a model to write, and a parser
    that waits for a close it never gets renders everything after the mistake as
    nothing at all — silently, with the field looking merely short.
  */
  it("ends an unclosed code fence at the end rather than eating the rest", () => {
    const said = readProse("Before\n\n```\nsome code\nmore code");
    expect(said.map((b) => b.kind)).toEqual(["para", "code"]);
    expect(said[1]?.lines).toEqual(["some code", "more code"]);
  });

  /* ⚠️ CARRIAGE RETURNS, because this text is transcribed off labels and pasted
     out of suppliers' documents. Every rule anchors on `$`, so a surviving `\r`
     makes each one silently fail and the whole document one paragraph. */
  it("reads a document written with carriage returns", () => {
    expect(kinds("# Title\r\n\r\n- one\r\n- two")).toEqual(["heading", "bullets"]);
  });

  it("joins the lines of a wrapped paragraph into one", () => {
    const said = readProse("A sentence that was\nwrapped by an editor.");
    expect(said).toHaveLength(1);
    expect(said[0]?.lines[0]).toBe("A sentence that was wrapped by an editor.");
  });

  it("renders nothing for nothing", () => {
    expect(readProse("")).toEqual([]);
    expect(readProse("   \n\n  ")).toEqual([]);
  });
});

describe("inline", () => {
  it("peels bold, italic and code out of a line", () => {
    expect(readInline("a **b** c `d` e *f*")).toEqual([
      { as: "text", text: "a " },
      { as: "strong", text: "b" },
      { as: "text", text: " c " },
      { as: "code", text: "d" },
      { as: "text", text: " e " },
      { as: "em", text: "f" },
    ]);
  });

  /*
    ⚠️ AND MARKUP IS TEXT, WHICH IS THE ASSERTION THAT MATTERS MOST HERE. The
    shorter implementation of this whole file is a chain of `String.replace`
    calls feeding `dangerouslySetInnerHTML`, and it turns every product
    description in the catalogue into a script injection point. Nothing in the
    inline set produces markup, so a tag stays the characters it is.
  */
  it("treats a tag as the characters it is", () => {
    const said = readInline("<script>alert(1)</script>");
    expect(said).toEqual([{ as: "text", text: "<script>alert(1)</script>" }]);
  });

  it("leaves an unpaired marker alone", () => {
    expect(readInline("2 * 3 = 6")).toEqual([{ as: "text", text: "2 * 3 = 6" }]);
  });
});
