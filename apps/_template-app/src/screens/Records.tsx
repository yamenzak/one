/**
 * ONE EXAMPLE SCREEN — a list, an empty state, and a write.
 *
 * It exists to demonstrate the three patterns that are easy to get subtly wrong
 * and that no type checker catches. Delete the noun and keep the shape.
 *
 * ── 1. `[]` IS NOT "NOT YET" ────────────────────────────────────────────────
 *
 * Three surfaces in this repo seeded an empty array and rendered it as fact: a
 * passkey card showed a confident "0" for the length of a round trip, a
 * notification bell said "you're all caught up" while still fetching, and a
 * media library's `catch(() => setItems([]))` turned a FAILED load into "No
 * media yet". All three are the same bug — a wrong answer wearing a loading
 * state's excuse — and all three are fixed by keeping the state `null` until it
 * is known. `useLoad` does that: `loading` is `data === null && error === null`.
 *
 * ── 2. A FAILED LOAD SAYS SO, AND OFFERS A WAY OUT ──────────────────────────
 *
 * `LoadError` is what breaks the "empty state over a failure" habit. It names
 * what broke, shows the server's own sentence, and retries. A screen that
 * catches into an empty list is a screen that tells somebody their data is gone.
 *
 * ── 3. A WRITE THAT FAILS SAYS SO, WHERE IT FAILED ──────────────────────────
 *
 * `useAction` owns the busy state, the error, and the fact that the control
 * stays put. The two shapes it replaces are both SHORTER than it and both fail
 * silently — a try/finally with no catch rejects into the app-wide "something
 * didn't load" toast, and an optimistic set followed by a swallowed rejection
 * leaves the control showing a value the server refused. `@4dl/ui`'s
 * `save-lifecycle` lint makes either one a test failure.
 *
 * ⚠️ Which this file learned the hard way: an earlier draft of this paragraph
 * QUOTED both anti-patterns literally, and the lint — correctly — flagged the
 * comment. A rule that scans source cannot tell a warning about a shape from a
 * use of it, and the fix is to describe rather than to exempt. Exempting the
 * file would have turned off the check for the screen that demonstrates it.
 */

import { useCallback, useState } from "react";
import { api, errorText } from "@4dl/app-kit";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Group,
  LoadError,
  Page,
  Row,
  Section,
  Skeleton,
  useAction,
  useLoad,
} from "@4dl/ui";
import { FileText } from "lucide-react";

interface Record_ {
  id: string;
  title: string;
  created_at: string;
}

export function Records() {
  const [title, setTitle] = useState("");
  const load = useCallback(() => api.get<{ records: Record_[] }>("/api/records"), []);
  const { data, error, loading, reload } = useLoad(load, "records", errorText);

  /* `useAction` takes the error FORMATTER and keys each run, so one hook can
     own several controls on a screen without them sharing a busy state. */
  const act = useAction(errorText);

  return (
    <Page>
      <Section title="Records">
        <Card className="space-y-3">
          <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Something to remember" />
          <Button
            disabled={!title.trim() || act.busy === "add"}
            onClick={() => void act.run("add", async () => {
              await api.post("/api/records", { title: title.trim() });
              setTitle("");
              reload();
            })}
          >
            {act.busy === "add" ? "Adding…" : "Add"}
          </Button>
          {act.err && <p className="text-caption text-danger">{act.err}</p>}
        </Card>

        {/* The three states, in the order that matters: failure first (so it is
            never mistaken for empty), then loading, then the real answer. */}
        {error ? (
          <LoadError what="records" error={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
          </div>
        ) : data!.records.length === 0 ? (
          <EmptyState icon={FileText} title="No records yet" description="Whatever you add above will appear here." />
        ) : (
          <Group>
            {data!.records.map((r, i) => (
              <Row key={r.id} divider={i < data!.records.length - 1} icon={FileText} sub={new Date(r.created_at).toLocaleDateString()}>
                {r.title}
              </Row>
            ))}
          </Group>
        )}
      </Section>
    </Page>
  );
}
