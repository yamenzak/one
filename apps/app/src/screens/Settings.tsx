/**
 * Settings (DESIGN.md §1.10) — flat list. Account, security (passkeys),
 * appearance. Passkey enrollment is the "add a one-tap sign-in" flow.
 */

import { useEffect, useState } from "react";
import { Button, Card, Chip, SettingsList } from "@mossa/ui";
import { useSession } from "../session.js";
import { enrollPasskey, listPasskeys, passkeySupported } from "../passkey.js";

export function Settings({ onBack }: { onBack: () => void }) {
  const { ctx, signOut } = useSession();
  const [passkeys, setPasskeys] = useState<{ id: string; name: string | null }[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (passkeySupported()) void listPasskeys().then(setPasskeys);
  }, []);

  const addPasskey = async () => {
    setEnrolling(true);
    setMsg(null);
    try {
      await enrollPasskey(`${navigator.platform || "device"} passkey`);
      setPasskeys(await listPasskeys());
      setMsg("Passkey added — next time you can sign in with a tap.");
    } catch {
      setMsg("Passkey setup was cancelled or failed.");
    } finally {
      setEnrolling(false);
    }
  };

  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === "light" ? "" : "light";
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    localStorage.setItem("mossa-theme", next || "dark");
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2">←</button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <div className="text-sm text-fg-muted">Signed in as</div>
        <div className="font-semibold">{ctx?.user.email}</div>
      </Card>

      {/* Security / passkeys */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-good">Security</h3>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Passkeys</div>
              <div className="text-sm text-fg-muted">One-tap sign-in with Face ID, fingerprint, or device PIN.</div>
            </div>
            <Chip tone={passkeys.length ? "good" : "neutral"}>{passkeys.length}</Chip>
          </div>
          {passkeys.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm text-fg-muted">
              🔑 {p.name ?? "Passkey"}
            </div>
          ))}
          {passkeySupported() ? (
            <Button variant="tonal" className="w-full" disabled={enrolling} onClick={() => void addPasskey()}>
              {enrolling ? "Waiting for your device…" : "＋ Add a passkey"}
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">This device doesn't support passkeys — you'll keep using email codes.</p>
          )}
          {msg && <p className="text-sm text-fg-muted">{msg}</p>}
        </Card>
      </section>

      <SettingsList
        sections={[
          {
            header: "Appearance",
            rows: [{ icon: "🌓", label: "Toggle light / dark", onClick: toggleTheme }],
          },
          {
            header: "Account",
            rows: [{ icon: "🚪", label: "Sign out", onClick: () => void signOut().then(() => location.reload()) }],
          },
        ]}
      />
    </div>
  );
}
