/**
 * Turning Cloudflare's custom-hostname errors into something an owner can act on.
 *
 * Cloudflare says exactly what is wrong and, for the CAA case, exactly which
 * certificate authority to authorise. We were fetching those messages and then
 * dropping them: `present()` never returned them, so a domain sat at "Pending"
 * with a screen that listed the records to add and no hint that DNS was actively
 * refusing to let the certificate issue. The owner's only route to the truth was
 * the Cloudflare dashboard, which they do not have access to.
 *
 * Pure so it can be tested against the real message text, which is the part most
 * likely to drift.
 */

/** A DNS record the owner must add, ready to render next to the others. */
export interface CaaFix {
  /** The zone apex the CAA belongs on. */
  name: string;
  /** The authority to authorise, e.g. "ssl.com". */
  authority: string;
  /** The full record value, e.g. `0 issue "ssl.com"`. */
  value: string;
}

/**
 * The registrable apex of a hostname — where a CAA record has to go.
 *
 * CAA cannot live on the hostname itself when that name is a CNAME: DNS forbids
 * other records alongside a CNAME, so `coaching.byshujaa.com` cannot carry one
 * and it must be set at `byshujaa.com`.
 *
 * Deliberately naive (last two labels) rather than shipping a public-suffix list.
 * It is wrong for multi-label suffixes like `co.uk`, so the label the UI renders
 * says "your domain's root", and the owner — who knows their own domain — is the
 * one placing the record. Being approximately right and honest about it beats a
 * 15,000-entry list that also goes stale.
 */
export function apexOf(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

/**
 * If Cloudflare is reporting a CAA block, the record that unblocks it.
 *
 * Matches on the authority Cloudflare names rather than a hardcoded list of its
 * CAs: Cloudflare has used Let's Encrypt, Google Trust Services and SSL.com at
 * different times and for different certificate packs, so a list here would be
 * a guess with an expiry date. The message already carries the answer.
 */
export function caaFixFromErrors(hostname: string, errors: readonly string[]): CaaFix | null {
  for (const e of errors) {
    if (!/caa/i.test(e)) continue;
    // "…add records for this authority (ssl.com)" — the parenthesised authority.
    const paren = /\(([a-z0-9.-]+\.[a-z]{2,})\)/i.exec(e);
    // Fallback: a bare domain after the word "authority".
    const bare = /authority[^a-z0-9]*([a-z0-9.-]+\.[a-z]{2,})/i.exec(e);
    const authority = (paren?.[1] ?? bare?.[1])?.toLowerCase();
    if (!authority) continue;
    return { name: apexOf(hostname), authority, value: `0 issue "${authority}"` };
  }
  return null;
}
