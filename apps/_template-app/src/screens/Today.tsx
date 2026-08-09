/**
 * THE FIRST SCREEN — the one worth opening cold.
 *
 * Deliberately almost empty: what belongs here is entirely the product's, and a
 * template that guessed would be guessing at the most product-specific screen in
 * the app. What it does carry is the ONE structural decision worth inheriting.
 *
 * ⚠️ **A first screen is a summary, not a dashboard.** The temptation is a wall
 * of cards. UI-LANGUAGE §1 caps a group at seven rows for a reason, and the
 * expensive proof is in this repo: an operator console's first tab measured
 * 61,541px on a seeded install — every tenant ever created, in one scroll, with
 * the other six tabs invisible below it.
 *
 * Answer one question here: *what needs me now?* Everything else is a tab.
 */

import { Card, Page, Section } from "@4dl/ui";
// Product iconography comes from lucide directly — `@4dl/ui`'s icon set is
// curated to what the PLATFORM needs, and re-exporting every icon through it
// would make the package a lucide fork. Same source, same component type.
import { Sparkles } from "lucide-react";
import { useSession } from "../session.js";

export function Today() {
  const { ctx } = useSession();
  const first = (ctx?.user?.name || ctx?.user?.email || "").split(/[@ ]/)[0];

  return (
    <Page>
      <Section title={first ? `Hello, ${first}` : "Today"}>
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-body-lg font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Nothing needs you yet
          </div>
          <p className="text-body leading-relaxed text-muted-foreground">
            This is the screen somebody opens first. Put what needs attention now here — and only that.
          </p>
        </Card>
      </Section>
    </Page>
  );
}
