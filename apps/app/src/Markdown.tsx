/**
 * Markdown — a compact, dependency-free renderer for AI-authored article and
 * resource bodies (headings, emphasis, lists, quotes, code, links, rules).
 * The app is deliberately dep-light, so this covers the CommonMark subset the
 * content features actually emit without pulling in a full markdown pipeline.
 * All text is placed via React children (never dangerouslySetInnerHTML), so
 * user/model content can't inject markup.
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
    if (m[2] || m[4]) out.push(<strong key={k}>{m[2] ?? m[4]}</strong>);
    else if (m[6] || m[8]) out.push(<em key={k}>{m[6] ?? m[8]}</em>);
    else if (m[10]) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-0.5 text-[0.85em]">{m[10]}</code>);
    else if (m[12] && m[13]) out.push(<a key={k} href={m[13]} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">{m[12]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

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
      ? <ol key={key++} className="mb-3 ml-5 list-decimal space-y-0.5">{items}</ol>
      : <ul key={key++} className="mb-3 ml-5 list-disc space-y-0.5">{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
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
