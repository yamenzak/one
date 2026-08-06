import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/** Multi-select tag filter — a dropdown of the tags in scope. Matches ANY of
 *  the selected tags (union). Hidden when nothing is tagged. */
export function TagFilter({ allTags, active, onChange }: { allTags: string[]; active: string[]; onChange: (tags: string[]) => void }) {
  if (allTags.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <Tag className="size-4" /> Tags
          {active.length > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 tabular-nums">{active.length}</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {allTags.map((t) => (
          <DropdownMenuCheckboxItem
            key={t}
            checked={active.includes(t)}
            onCheckedChange={(v) => onChange(v ? [...active, t] : active.filter((x) => x !== t))}
            onSelect={(e) => e.preventDefault()}
          >
            {t}
          </DropdownMenuCheckboxItem>
        ))}
        {active.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])}>Clear filters</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
