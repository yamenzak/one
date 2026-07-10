/**
 * First-run: a signed-in user with no personas either creates a tenant
 * (becoming its owner) or waits for an invite (client auto-link happens on
 * /api/context as soon as a trainer adds their email).
 */

import { useState } from "react";
import { Button, Card, Field } from "@mossa/ui";
import { api } from "../api.js";
import { useSession } from "../session.js";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function Start() {
  const { ctx, refresh, signOut } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/organization/create", { name, slug: slugify(name) || `studio-${Date.now()}` });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the workspace");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome{ctx?.user.name ? `, ${ctx.user.name}` : ""} 👋</h1>
        <p className="mt-2 text-fg-muted">
          You're signed in as <span className="text-fg">{ctx?.user.email}</span>, but you're not part
          of a training business yet.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="text-xl font-semibold">Start your business</h2>
        <p className="text-sm text-fg-muted">
          Create your studio's workspace — you'll be its owner and can invite trainers and clients.
        </p>
        <Field label="Business name" icon="🏋️" value={name} placeholder="FitLab Studio" onChange={(e) => setName(e.target.value)} />
        <Button size="lg" className="w-full" disabled={name.trim().length < 2 || busy} onClick={() => void create()}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Joining as a client?</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Ask your coach to invite <span className="text-fg">{ctx?.user.email}</span> — the moment they
          do, your training space appears here automatically.
        </p>
        <Button variant="ghost" className="mt-3" onClick={() => void refresh()}>
          Check again
        </Button>
      </Card>

      <button className="text-sm text-fg-muted hover:text-fg" onClick={() => void signOut().then(() => location.reload())}>
        Sign out
      </button>
    </div>
  );
}
