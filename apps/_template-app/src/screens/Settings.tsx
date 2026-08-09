/**
 * SETTINGS — and the two exits, which are the reason this screen is in the
 * template rather than left as an exercise.
 *
 * ⚠️ **`route-guard.ts` exempts `/api/tenant/close` and `/api/me/*` from EVERY
 * rung of the standing ladder.** The ladder is deliberately built so that paying
 * is A way out and not the ONLY one. Two apps shipped that exemption with no
 * routes behind it and no screen in front of it, so a suspended tenant was in a
 * trap: every write refused, the copy telling them to settle the invoice, and no
 * mechanism at all for the other answer. The exemption protected nothing.
 *
 * Both exits are `@4dl/app-kit`'s, and both take copy this product has to
 * supply — the noun, and one clause naming what is actually erased. "All your
 * data" is true of every product and informative about none, and this is the
 * last screen on which to be vague.
 *
 * A ROUTE rather than a Shell tab: settings is a place you go and come back
 * from, and the account menu navigates here. In Tessa it matched the Shell's
 * catch-all instead and rendered the app chrome over an empty body.
 */

import { AccountExitRows, CloseTenantCard, PasskeysCard } from "@4dl/app-kit";
import { ArrowLeft, Button, Group, Moon, Page, Row, Section, Select, Sun } from "@4dl/ui";
import { useSession } from "../session.js";
import { useTheme } from "../theme.js";

/** ⚠️ Match the SERVER. `TENANT_CLOSE_GRACE_DAYS` in `purge.ts` is the real
 *  number; wrong here is worse than absent, because it is a promise about a
 *  deadline somebody plans around. */
const CLOSE_GRACE_DAYS = 7;

export function Settings({ onBack }: { onBack: () => void }) {
  const { ctx, signOut, refresh } = useSession();
  /* `mode` is what is PAINTED; `choice` is what the person picked, which may be
     `"system"`. A three-option control has to know which is selected, and `mode`
     cannot say — "dark" reads identically whether it was chosen or inherited. */
  const { mode, choice, setChoice } = useTheme();
  const isOwner = ctx?.active?.role === "owner";

  return (
    <Page>
      <Section
        title="Settings"
        action={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden /> Back</Button>}
      >
        <Group>
          <Row
            icon={mode === "light" ? Sun : Moon}
            sub="Follows the device unless you choose."
            trailing={
              <Select
                value={choice}
                onChange={(v) => setChoice(v as "system" | "light" | "dark")}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            }
          >
            Appearance
          </Row>
        </Group>

        {/* Passkeys. The card handles the whole WebAuthn ceremony, including the
            three failure modes worth distinguishing (cancelled, unsupported,
            refused) — and its list is `null` until known, so it never shows a
            confident "0" to somebody with three. */}
        <PasskeysCard onChanged={() => void refresh()} />

        {/* Way out #1: the OWNER closes the tenant. Cancellable inside the
            window, which is what makes a mis-click recoverable. */}
        {isOwner && (
          <CloseTenantCard
            noun="workspace"
            erases="every record, file and member"
            graceDays={CLOSE_GRACE_DAYS}
            cancelsBilling
          />
        )}

        {/* Way out #2: a PERSON deletes their own account. `ownsTenant` is
            passed rather than discovered from the server's 409, so the row can
            say so BEFORE anything is sent — making somebody request a code, open
            an email and type six digits to learn the attempt was never going to
            work is a worse failure than the refusal that produces it. */}
        <AccountExitRows
          email={ctx?.user?.email ?? null}
          ownsTenant={isOwner}
          noun="workspace"
          closeFirstHint="Settings → Close workspace"
          onSignOut={() => void signOut()}
          onDeleted={() => void signOut()}
        />
      </Section>
    </Page>
  );
}
