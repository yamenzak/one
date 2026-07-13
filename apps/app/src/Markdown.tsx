/**
 * Markdown — a compact, dependency-free renderer for AI- and coach-authored
 * article, resource, exercise-instruction and recipe bodies. Covers the
 * CommonMark + GFM subset the content features actually emit (headings,
 * emphasis, lists, quotes, links, rules, fenced code, and pipe TABLES) without
 * pulling in a full markdown pipeline. All text is placed via React children
 * (never dangerouslySetInnerHTML), so user/model content can't inject markup.
 * Styling is theme-token driven so it reads as premium prose in both themes.
 */

import { Fragment, type ReactNode } from "react";

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
    else if (m[6] || m[8]) out.push(<em key={k}>{m[6] ?? m[8]}</em>);
    else if (m[10]) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em] text-foreground">{m[10]}</code>);
    else if (m[12] && m[13]) out.push(<a key={k} href={m[13]} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">{m[12]}</a>);
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
    blocks.push(<p key={key++} className="mb-3 leading-relaxed">{renderInline(para.join(" "), `p${key}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => <li key={idx} className="mb-1 leading-relaxed">{renderInline(it, `li${key}-${idx}`)}</li>);
    blocks.push(list.ordered
      ? <ol key={key++} className="mb-3 ml-5 list-decimal space-y-0.5 marker:text-muted-foreground">{items}</ol>
      : <ul key={key++} className="mb-3 ml-5 list-disc space-y-0.5 marker:text-muted-foreground">{items}</ul>);
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
      blocks.push(<pre key={key++} className="mb-3 overflow-x-auto rounded-xl border border-border/60 bg-surface-2 p-3 font-mono text-[0.8rem] leading-relaxed text-foreground"><code>{buf.join("\n")}</code></pre>);
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
        <div key={tk} className="mb-3 overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2">{header.map((h, i) => <th key={i} className="border-b border-border/60 px-3 py-2 text-left font-semibold">{renderInline(h, `th${tk}-${i}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border/40">{header.map((_, ci) => <td key={ci} className="px-3 py-1.5 align-top">{renderInline(r[ci] ?? "", `td${tk}-${ri}-${ci}`)}</td>)}</tr>
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
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); blocks.push(<hr key={key++} className="my-4 border-border/60" />); continue; }
    if (heading) {
      flushPara(); flushList();
      const level = heading[1]!.length;
      const cls = level <= 1 ? "mb-2 mt-1 text-xl font-bold tracking-tight"
        : level === 2 ? "mb-2 mt-4 text-lg font-semibold tracking-tight"
        : "mb-1.5 mt-3 text-base font-semibold";
      const content = renderInline(heading[2]!, `h${key}`);
      blocks.push(level <= 1 ? <h1 key={key++} className={cls}>{content}</h1>
        : level === 2 ? <h2 key={key++} className={cls}>{content}</h2>
        : <h3 key={key++} className={cls}>{content}</h3>);
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
      blocks.push(<blockquote key={key++} className="mb-3 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">{renderInline(quote[1]!, `q${key}`)}</blockquote>);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  flushList();

  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
