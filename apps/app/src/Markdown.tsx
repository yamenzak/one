/**
 * Markdown — a compact, dependency-free renderer for AI- and coach-authored
 * article, resource, exercise-instruction and recipe bodies. Covers the
 * CommonMark + GFM subset the content features actually emit (headings,
 * emphasis, lists, quotes, links, rules, fenced code, and pipe TABLES) without
 * pulling in a full markdown pipeline. All text is placed via React children
 * (never dangerouslySetInnerHTML), so user/model content can't inject markup.
 *
 * Styling is premium + brand-token driven: primary-accented section headers,
 * custom bullet dots + numbered badges, rounded tonal tables (zebra rows) and
 * callout blockquotes, so prose reads like the rest of the app in either theme.
 */

import { Fragment, type ReactNode } from "react";
import { cn } from "@4dl/ui";

/** Inline formatting: **bold**, *italic* / _italic_, `code`, [text](url). */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // One regex, alternation ordered so the greedier tokens win first.
  const re = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[2] || m[4]) out.push(<strong key={k} className="font-semibold text-foreground">{m[2] ?? m[4]}</strong>);
    else if (m[6] || m[8]) out.push(<em key={k} className="italic">{m[6] ?? m[8]}</em>);
    else if (m[10]) out.push(<code key={k} className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.82em] text-foreground">{m[10]}</code>);
    else if (m[12] && m[13]) out.push(<a key={k} href={m[13]} target="_blank" rel="noreferrer" className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary">{m[12]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableSep = (s: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(s);
const splitRow = (s: string) => s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Markdown({ children, className }: { children: string; className?: string }) {
  const lines = children.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={key++} className="my-3 leading-7">{renderInline(para.join(" "), `p${key}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const ordered = list.ordered;
    const items = list.items.map((it, idx) => (
      <li key={idx} className="flex gap-2.5">
        {ordered
          ? <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-caption font-semibold text-primary">{idx + 1}</span>
          : <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />}
        <span className="min-w-0 flex-1 leading-7">{renderInline(it, `li${key}-${idx}`)}</span>
      </li>
    ));
    blocks.push(<ul key={key++} className="my-3 space-y-1.5">{items}</ul>);
    list = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!.trimEnd();

    // Fenced code block ``` … ```
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara(); flushList();
      const buf: string[] = [];
      idx++;
      while (idx < lines.length && !/^```\s*$/.test(lines[idx]!.trim())) { buf.push(lines[idx]!); idx++; }
      blocks.push(<pre key={key++} className="my-4 overflow-x-auto rounded-2xl bg-surface-2 p-4 font-mono text-caption leading-relaxed text-foreground/90"><code>{buf.join("\n")}</code></pre>);
      continue;
    }

    // GFM pipe table: a header row followed by a |---|---| separator.
    if (line.includes("|") && idx + 1 < lines.length && isTableSep(lines[idx + 1]!)) {
      flushPara(); flushList();
      const header = splitRow(line);
      let j = idx + 2;
      const rows: string[][] = [];
      while (j < lines.length && lines[j]!.includes("|") && lines[j]!.trim() !== "") { rows.push(splitRow(lines[j]!)); j++; }
      const tk = key++;
      blocks.push(
        <div key={tk} className="my-4 overflow-x-auto rounded-2xl border border-border/50">
          <table className="w-full border-collapse text-[0.9em]">
            <thead>
              <tr className="bg-surface-2 text-left">{header.map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold tracking-tight text-foreground">{renderInline(h, `th${tk}-${i}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border/40 odd:bg-surface-2/30">{header.map((_, ci) => <td key={ci} className="px-4 py-2.5 align-top text-foreground/85">{renderInline(r[ci] ?? "", `td${tk}-${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      idx = j - 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const uli = line.match(/^\s*[-*+]\s+(.*)$/);
    const oli = line.match(/^\s*\d+\.\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);

    if (line.trim() === "") { flushPara(); flushList(); continue; }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); blocks.push(<div key={key++} className="my-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />); continue; }
    if (heading) {
      flushPara(); flushList();
      const level = heading[1]!.length;
      const content = renderInline(heading[2]!, `h${key}`);
      if (level <= 1) {
        blocks.push(<h1 key={key++} className="mb-3 mt-6 text-title-2 text-foreground">{content}</h1>);
      } else if (level === 2) {
        // Brand-accented section header — a primary tick + tight heading.
        blocks.push(
          <h2 key={key++} className="mb-3 mt-7 flex items-center gap-2.5 text-body-lg text-foreground">
            <span className="h-[1.05em] w-1 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="min-w-0">{content}</span>
          </h2>,
        );
      } else {
        blocks.push(<h3 key={key++} className="mb-1.5 mt-5 text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">{content}</h3>);
      }
      continue;
    }
    if (uli || oli) {
      flushPara();
      const ordered = !!oli;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((uli ?? oli)![1]!);
      continue;
    }
    if (quote) {
      flushPara(); flushList();
      blocks.push(<blockquote key={key++} className="my-4 rounded-2xl border-l-[3px] border-primary bg-surface-2 px-4 py-3 leading-7 text-foreground/80">{renderInline(quote[1]!, `q${key}`)}</blockquote>);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  flushList();

  return <div className={cn("leading-7 [&>:first-child]:mt-0 [&>:last-child]:mb-0", className)}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
