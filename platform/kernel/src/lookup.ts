/**
 * WHOSE SERVERS AN APP MAY TALK TO — declared.
 *
 * Layer 2. Imports nothing.
 *
 * ⚠️ AN OUTBOUND REQUEST IS A CAPABILITY, NOT A CONVENIENCE, and the reason is
 * where a worker runs. It sits inside a network; a URL a caller can influence is
 * a request made FROM that position, to an address the caller chose, with
 * whatever the worker's identity gets it. That is server-side request forgery,
 * and the classic form is not exotic — it is a product that takes a barcode,
 * builds `https://api.example/v1/${code}`, and one day is handed a code
 * containing `../` or a whole other host.
 *
 * So an app declares the SERVICES it may reach, BY HOST — never a base URL,
 * because a base URL carries a path somebody will eventually interpolate into,
 * which is the whole mistake this design makes unavailable.
 *
 * The asking itself is the runtime's. What is here is the declaration and
 * everything decidable about it before any request exists.
 */

export interface ServiceSpec {
  /**
   * ⚠️ THE HOST, AND ONLY THE HOST. Not a base URL: a base URL carries a path
   * that somebody will one day want to interpolate into.
   */
  readonly host: string;
  /** One line, for an operator reading what this deployment talks to. */
  readonly label: string;
  /**
   * ⚠️ THE CONFIG KEY HOLDING ITS CREDENTIAL, where it needs one. Absent means a
   * service that takes none — and a service whose key is CONFIGURED as empty is
   * unconfigured rather than open, exactly as the mail lane treats a provider.
   */
  readonly keyConfig?: string;
  /** How the key travels. Nothing anywhere puts one in a query string. */
  readonly keyHeader?: string;
}

export type Services = Readonly<Record<string, ServiceSpec>>;

export interface ServiceProblem { readonly id: string; readonly why: string }

/**
 * ⚠️ EVERY ONE OF THESE IS A REQUEST THAT WOULD LEAVE THIS WORKER FOR SOMEWHERE
 * NOBODY MEANT, and none of them is visible in a green suite.
 */
export function serviceProblems(services: Services): readonly ServiceProblem[] {
  const out: ServiceProblem[] = [];
  for (const [id, service] of Object.entries(services)) {
    const host = service.host;
    /*
      ⚠️ AN ALLOW-LIST, NOT A LIST OF FORBIDDEN CHARACTERS. This was a blocklist
      first — `/`, `:`, `*` and a trim — and it accepted `example.test?a=1`,
      which puts the entire escaped path inside a query string and asks the
      service a question nobody wrote. A blocklist here is a promise to have
      thought of every character that means something in a URL, and there is no
      reason to make that promise: a hostname is labels and dots, and everything
      else is a mistake whatever it would have done.
    */
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
      out.push({ id, why: "declares something that is not a hostname — a path, a scheme, a wildcard or a query is somewhere a caller's value could end up" });
    }
    if (!host.includes(".")) out.push({ id, why: "declares a host with no dot, which is a name inside our own network" });
    /*
      ⚠️ A LOOPBACK OR PRIVATE ADDRESS IS THE SSRF TARGET ITSELF. A service
      declared as one is not a mistake to warn about later; it is the thing the
      whole design refuses.
    */
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      out.push({ id, why: "declares an address inside our own network" });
    }
    if (service.keyHeader && !service.keyConfig) {
      out.push({ id, why: "says how a credential travels and never says where it comes from" });
    }
  }
  return out;
}
