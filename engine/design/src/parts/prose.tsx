/**
 * WRITING, RENDERED — the one place this product draws a paragraph somebody
 * else wrote.
 *
 * ⚠️ `Markdown`, NOT `Prose`, AND THE NAME IS TAKEN FOR A GOOD REASON. `Prose`
 * in `heads.tsx` is a paragraph wrapper for React children — it gives a
 * hand-written block a reading width. This takes a STRING somebody else wrote
 * and decides what its structure is. Two components called the same thing, one
 * of which parses, is how a screen comes to render a model's headings as one
 * long paragraph with hashes in it.
 *
 * ⚠️ IT EXISTS BECAUSE LONG-FORM TEXT WAS BEING DRAWN AS A LABEL. A product's
 * description and its storage-and-handling notes are the two fields a model
 * fills in with real prose — how to stack it, what it must not sit next to, what
 * to do if it spills — and both were rendered as one cramped line under a
 * heading, in `note` ink, at 14px. What a model wrote as three headed paragraphs
 * with a list of warnings arrived as an unbroken grey ribbon nobody would read
 * at a shelf, which is the only place it matters.
 *
 * ⚠️ NO DEPENDENCY, AND THAT IS A SIZE DECISION RATHER THAN PRIDE. A markdown
 * library is 40–120kB of parser plus a sanitiser, shipped to every visitor of
 * every door, to render two fields on two screens. What is actually used here is
 * a small closed set — headings, paragraphs, lists, emphasis, code, quotes, a
 * rule — and the subset is CLOSED on purpose: anything not on the list is drawn
 * as the text it is, never as markup.
 *
 * ⚠️ AND NOTHING IS EVER SET AS HTML. Every node below becomes a React element
 * with the text as a CHILD, so a description containing `<script>` or `<img
 * onerror=…>` is a description containing those characters. There is no
 * `dangerouslySetInnerHTML` in this file and there must never be one: this text
 * comes from a model reading a photograph of a label somebody else printed,
 * which is about as untrusted as text gets.
 *
 * ⚠️ IT WEARS THE TYPE SCALE, NOT ITS OWN SIZES. A rendered heading is `group`,
 * a paragraph is `body`, a caption is `note` — the same three every hand-written
 * screen uses — so a model's writing and a designer's sit at the same ranks. The
 * alternative is a second type system that drifts, visible only on the screens
 * nobody re-reads.
 */

import * as React from "react";
import { TYPE } from "../tokens/type.js";
import { CARD_ROWS, PROSE, SPACE } from "../tokens/metrics.js";
import { Switch } from "@heroui/react";
import { Knob, LongText, NamedAlready } from "./forms.js";

/* ------------------------------------------------------------------ parse --- */

/** ⚠️ The closed set. Anything else is a paragraph. */
export type ChunkKind = "heading" | "para" | "bullets" | "steps" | "quote" | "code" | "rule";

export interface Chunk {
  readonly kind: ChunkKind;
  /** ⚠️ 1–3 for a heading, ignored otherwise. Deeper is flattened — see below. */
  readonly rank?: number;
  /** One entry per line for a list, one for everything else. */
  readonly lines: readonly string[];
}

const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const STEP = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s{0,3}(?:```|~~~)/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * ⚠️ A PURE FUNCTION, SO THE PARSER IS TESTABLE WITHOUT A RENDERER. Every bug
 * this kind of code has is in the block splitting — a list that swallows the
 * paragraph after it, a fence that never closes and eats the rest of the
 * document — and none of them needs React to find.
 */
export function readProse(source: string): readonly Chunk[] {
  const out: Chunk[] = [];
  /* ⚠️ `\r\n` FIRST. A label transcribed on Windows, or pasted out of a
     supplier's PDF, arrives with carriage returns and every regex above anchors
     on `$` — so each line would keep a trailing `\r` and no rule would match. */
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  let at = 0;
  while (at < lines.length) {
    const line = lines[at] ?? "";

    if (!line.trim()) { at++; continue; }

    if (RULE.test(line)) { out.push({ kind: "rule", lines: [] }); at++; continue; }

    /*
      ⚠️ AN UNCLOSED FENCE ENDS AT THE END, RATHER THAN DISCARDING THE REST. A
      model writing three backticks and forgetting the closing pair is common,
      and a parser that waits for a close it never gets renders an empty
      document — everything after the mistake silently gone.
    */
    if (FENCE.test(line)) {
      const held: string[] = [];
      at++;
      while (at < lines.length && !FENCE.test(lines[at] ?? "")) { held.push(lines[at] ?? ""); at++; }
      at++;
      out.push({ kind: "code", lines: held });
      continue;
    }

    const head = HEADING.exec(line);
    if (head) {
      /* ⚠️ FLATTENED AT THREE. This is rendered inside a card that already sits
         under a section heading — a sixth-level heading below that is a rank the
         page has no room for, and it comes out smaller than the body it heads. */
      out.push({
        kind: "heading",
        rank: Math.min(3, (head[1] ?? "#").length),
        lines: [(head[2] ?? "").trim()],
      });
      at++;
      continue;
    }

    if (QUOTE.test(line)) {
      const held: string[] = [];
      while (at < lines.length && QUOTE.test(lines[at] ?? "")) {
        held.push((QUOTE.exec(lines[at] ?? "")?.[1] ?? "").trim());
        at++;
      }
      out.push({ kind: "quote", lines: held });
      continue;
    }

    for (const [re, kind] of [[BULLET, "bullets"], [STEP, "steps"]] as const) {
      if (!re.test(line)) continue;
      const held: string[] = [];
      while (at < lines.length && re.test(lines[at] ?? "")) {
        held.push((re.exec(lines[at] ?? "")?.[1] ?? "").trim());
        at++;
      }
      out.push({ kind, lines: held });
      break;
    }
    if (out.length && out[out.length - 1]?.lines.length && (BULLET.test(line) || STEP.test(line))) continue;

    /*
      ⚠️ A PARAGRAPH RUNS TO THE NEXT BLANK LINE OR THE NEXT BLOCK, and the
      second half is what stops a list being swallowed. Written as "until blank"
      alone, a paragraph immediately followed by bullets — which is how anybody
      actually writes a warning and its cases — ate the whole list as more
      sentences.
    */
    const held: string[] = [];
    while (at < lines.length) {
      const next = lines[at] ?? "";
      if (!next.trim()) break;
      if (BULLET.test(next) || STEP.test(next) || HEADING.test(next)
        || QUOTE.test(next) || FENCE.test(next) || RULE.test(next)) break;
      held.push(next.trim());
      at++;
    }
    if (held.length) out.push({ kind: "para", lines: [held.join(" ")] });
  }

  return out;
}

/* ------------------------------------------------------------------ inline --- */

/** ⚠️ The closed inline set, in the order they are peeled off. */
type Piece =
  | { readonly as: "text"; readonly text: string }
  | { readonly as: "strong" | "em" | "code"; readonly text: string };

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/;

/**
 * ⚠️ SPLIT RATHER THAN REPLACED, BECAUSE THE OUTPUT IS ELEMENTS AND NOT A
 * STRING. The tempting version builds HTML with `replace` and hands it to
 * `dangerouslySetInnerHTML`, which is one line shorter and turns every product
 * description in the catalogue into a script injection point.
 */
export function readInline(text: string): readonly Piece[] {
  const out: Piece[] = [];
  let rest = text;
  while (rest) {
    const hit = INLINE.exec(rest);
    if (!hit || hit.index === undefined) { out.push({ as: "text", text: rest }); break; }
    if (hit.index > 0) out.push({ as: "text", text: rest.slice(0, hit.index) });
    const mark = hit[0] ?? "";
    if (mark.startsWith("`")) out.push({ as: "code", text: mark.slice(1, -1) });
    else if (mark.startsWith("**") || mark.startsWith("__")) {
      out.push({ as: "strong", text: mark.slice(2, -2) });
    } else out.push({ as: "em", text: mark.slice(1, -1) });
    rest = rest.slice(hit.index + mark.length);
  }
  return out;
}

const Inline = ({ of }: { readonly of: string }) => (
  <>
    {readInline(of).map((piece, at) => {
      const key = `${at}-${piece.text.slice(0, 12)}`;
      if (piece.as === "strong") return <strong key={key} className={TYPE.strong}>{piece.text}</strong>;
      if (piece.as === "em") return <em key={key}>{piece.text}</em>;
      if (piece.as === "code") {
        return (
          <code key={key} className={`${TYPE.code} ${PROSE.tick} rounded bg-[var(--default)]`}>
            {piece.text}
          </code>
        );
      }
      return <React.Fragment key={key}>{piece.text}</React.Fragment>;
    })}
  </>
);

/* ------------------------------------------------------------------ render --- */

/** ⚠️ Three ranks, and all three are the page's own — see the header. */
const RANK = ["", TYPE.section, TYPE.group, TYPE.label] as const;

export interface MarkdownProps {
  /** ⚠️ Markdown. Empty renders nothing at all rather than an empty block. */
  readonly of: string | undefined;
}

export function Markdown({ of }: MarkdownProps) {
  const blocks = React.useMemo(() => readProse(of ?? ""), [of]);
  if (!blocks.length) return null;

  return (
    /*
      ⚠️ THE GAP IS THE PAGE'S RHYTHM, NOT A MARGIN PER ELEMENT. Every block below
      is margin-free and the column spaces them, so a heading followed by a list
      sits at the same distance as a heading followed by a paragraph — which is
      the thing hand-tuned `mt-` values never manage past the third combination.
    */
    <div className={`flex flex-col ${SPACE.tight}`} data-prose>
      {blocks.map((block, at) => {
        /* ⚠️ THE POSITION ALONE. The kind was in here and it is a closed-set
           value — `keys.test.mjs` is right to refuse those in a template
           literal, and it adds nothing anyway: blocks are positional, the whole
           column re-renders when the text changes, and the index is unique. */
        const key = String(at);
        if (block.kind === "rule") {
          /* ⚠️ A `div`, NOT AN `hr`, BECAUSE AN `hr` IS A BORDER. The design bans an
             edge as a way of saying "separate" (D7) and `border-0 h-px` is that
             ban being worked around in the file that renders untrusted text.
             `.separator` is the veil every other divider in the product uses. */
          return <div key={key} role="separator" className="separator h-px" />;
        }
        if (block.kind === "heading") {
          const Tag = (["h3", "h4", "h5"] as const)[(block.rank ?? 1) - 1] ?? "h4";
          return (
            <Tag key={key} className={RANK[block.rank ?? 1] ?? TYPE.group}>
              <Inline of={block.lines[0] ?? ""} />
            </Tag>
          );
        }
        if (block.kind === "code") {
          /* ⚠️ IT SCROLLS INSIDE ITSELF. A long line in a code block is the one
             thing on a phone that makes the whole PAGE scroll sideways. */
          return (
            <pre
              key={key}
              className={`${TYPE.code} ${PROSE.fence} overflow-x-auto rounded-xl bg-[var(--default)]`}
            >
              {block.lines.join("\n")}
            </pre>
          );
        }
        if (block.kind === "quote") {
          /*
            ⚠️ A QUOTE IS INSET AND QUIETER, NEVER A BORDERED PANEL. The design
            bans an edge as a way of saying "separate thing" (D7) — a left rule
            here would be the one border in the product, on the least important
            block in it.
          */
          return (
            <p key={key} className={`${TYPE.note} ${PROSE.quote}`}>
              <Inline of={block.lines.join(" ")} />
            </p>
          );
        }
        if (block.kind === "bullets" || block.kind === "steps") {
          const Tag = block.kind === "steps" ? "ol" : "ul";
          return (
            <Tag
              key={key}
              className={`${TYPE.body} ${SPACE.tight} ${PROSE.list} flex flex-col`}
              style={{ listStyleType: block.kind === "steps" ? "decimal" : "disc" }}
            >
              {block.lines.map((line, i) => (
                <li key={`${i}-${line.slice(0, 12)}`}><Inline of={line} /></li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={key} className={TYPE.body}><Inline of={block.lines[0] ?? ""} /></p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ written --- */

/**
 * A LONG FIELD SOMEBODY CAN WRITE IN AND READ BACK.
 *
 * ⚠️ THE TWO FIELDS THIS EXISTS FOR ARE THE ONES A MODEL FILLS IN. A product's
 * description and its storage-and-handling notes come back as real prose —
 * headed paragraphs, a list of what it must not sit beside — and both were
 * drawn as a single-line text field, so a model's careful three paragraphs
 * arrived as a grey ribbon somebody would have to scroll a 40px box to read.
 *
 * ⚠️ THE PREVIEW APPEARS ONLY WHEN THERE IS SOMETHING TO PREVIEW. An empty field
 * offering a choice between writing nothing and reading nothing is a control
 * asking a question with no answers, on the screen where somebody is trying to
 * type. It arrives with the first character.
 *
 * ⚠️ AND IT OPENS ON THE READING SIDE WHEN IT ARRIVES FULL. Somebody who pressed
 * "fill this in from the photographs" wants to SEE what came back; somebody who
 * tapped an empty field wants a caret. The state follows which of those happened
 * rather than defaulting to one and being wrong half the time.
 */
export function Written({
  label, value, onChange, help, placeholder, rows = 6,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly placeholder?: string;
  /** ⚠️ How tall it opens. A field for three paragraphs that opens at one line
      is a field somebody writes one line in. */
  readonly rows?: number;
}) {
  const has = value.trim().length > 0;
  const [reading, setReading] = React.useState(has);
  /* ⚠️ ARRIVING FULL FLIPS IT ONCE, AND ONLY FROM EMPTY. Re-deriving on every
     render would yank somebody out of the field the moment they typed a
     character; keyed on the transition, a model's answer shows itself and
     everything after that is the person's choice. */
  const wasEmpty = React.useRef(!has);
  React.useEffect(() => {
    if (wasEmpty.current && has) setReading(true);
    wasEmpty.current = !has;
  }, [has]);

  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {has ? (
        /*
          ⚠️ A SWITCH, NOT A SEGMENTED CONTROL, AND THE SIZE IS THE ARGUMENT. A
          two-option group is a slab the width of the card carrying one bit —
          the loudest thing in a section whose subject is the paragraph under
          it, repeated on every long field. A segmented control earns its width
          when the options are PEERS somebody chooses between; "show me what I
          wrote" is not a peer of writing, it is a mode on top of it.

          ⚠️ AND IT IS LABELLED "Preview" RATHER THAN "Write / Preview", because
          a switch says what turning it ON does. The pair of words was the group
          having to name the state it was leaving.
        */
        <div className={`flex items-center justify-between ${SPACE.snug}`}>
          <span className={TYPE.label}>{label}</span>
          <Switch isSelected={reading} onChange={setReading}>
            <Switch.Content>
              <span className={TYPE.note}>Preview</span>
              <Knob />
            </Switch.Content>
          </Switch>
        </div>
      ) : null}

      {reading && has ? (
        <>
          <div className={`rounded-2xl bg-[var(--field-background)] ${CARD_ROWS}`}>
            <Markdown of={value} />
          </div>
          {help === undefined ? null : <span className={TYPE.note}>{help}</span>}
        </>
      ) : (
        /* ⚠️ THE LABEL IS THE ROW'S ABOVE WHEN THERE IS ONE, SO THE FIELD MUST
           NOT PRINT IT TWICE — `NamedAlready` is the seam that already exists
           for exactly this, and it HIDES rather than drops, so the control is
           still announced to anybody navigating by keyboard. */
        <NamedAlready>
          <LongText
            label={label}
            value={value}
            onChange={onChange}
            rows={rows}
            {...(help === undefined ? {} : { help })}
            {...(placeholder === undefined ? {} : { placeholder })}
          />
        </NamedAlready>
      )}
    </div>
  );
}
