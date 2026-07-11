/**
 * First-run — a signed-in user with no tenancy creates a studio or waits for
 * an invite (client auto-links on their first sign-in).
 */

import { useState } from "react";
import { motion } from "motion/react";
import { Button, Card, Field, Building2, Mail, ArrowRight, Store } from "@mossa/ui";
import { api } from "../api.js";
import { useSession } from "../session.js";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">Welcome{ctx?.user.name ? `, ${ctx.user.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-2 text-muted-foreground">
          Signed in as <span className="text-foreground">{ctx?.user.email}</span> — let's get you set up.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-5">
              <Building2 />
            </div>
            <h2 className="text-lg font-semibold">Start your business</h2>
          </div>
          <p className="text-sm text-muted-foreground">Create your studio's workspace — you'll be its owner and can invite trainers and clients.</p>
          <Field label="Business name" icon={Store} value={name} placeholder="FitLab Studio" onChange={(e) => setName(e.target.value)} />
          <Button size="lg" className="w-full" disabled={name.trim().length < 2 || busy} onClick={() => void create()}>
            {busy ? "Creating…" : "Create workspace"} {!busy && <ArrowRight />}
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Joining as a client?</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Ask your coach to invite <span className="text-foreground">{ctx?.user.email}</span> — your space appears here the moment they do.
          </p>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            Check again
          </Button>
        </Card>
      </motion.div>

      <button className="text-sm text-muted-foreground transition-colors hover:text-foreground" onClick={() => void signOut().then(() => location.reload())}>
        Sign out
      </button>
    </div>
  );
}
