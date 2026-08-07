import * as React from "react";
import { X } from "lucide-react";
import { Badge, cn } from "@4dl/ui";

/** Freeform tag input: removable chips + type-to-add (Enter or comma). */
export function TagEditor({
  tags,
  onChange,
  placeholder = "Add a tag…",
  className,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [input, setInput] = React.useState("");
  const safe = Array.isArray(tags) ? tags : []; // defensive: never .map a non-array

  function add(raw: string) {
    const tag = raw.trim();
    setInput("");
    if (!tag || safe.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...safe, tag]);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-body focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {safe.map((t) => (
        <Badge key={t} className="gap-1 pl-2 pr-1 font-normal">
          {t}
          <button
            type="button"
            onClick={() => onChange(safe.filter((x) => x !== t))}
            className="grid size-4 place-items-center rounded-sm text-muted-foreground hover:bg-background/70 hover:text-foreground"
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          }
          if (e.key === "Backspace" && !input && safe.length) onChange(safe.slice(0, -1));
        }}
        onBlur={() => input && add(input)}
        placeholder={safe.length ? "" : placeholder}
        className="min-w-[90px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
