/**
 * Signing a test in, the way a person does: ask for a code, read it, exchange it.
 *
 * ⚠️ NOT A SHORTCUT AROUND THE CEREMONY. A fixture that inserted a session row
 * would let the sign-in path rot while every other suite stayed green — and the
 * defect that reaches production is the one on the path nobody drives.
 */

import { env } from "cloudflare:test";
import worker, { delivered } from "../src/worker.js";

export const SETUP = "https://setup.hello.4dl.app";

export const post = async (origin: string, path: string, body: unknown, cookie = "") => {
  const res = await worker.fetch(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env as never,
  );
  return { res, body: (await res.json()) as Record<string, unknown> };
};

/** Returns the cookie for that origin. Sessions are per origin, so it matters. */
export async function signIn(email: string, origin: string): Promise<string> {
  await post(origin, "/api/identity.code.request", { email });
  const { res } = await post(origin, "/api/identity.code.verify", { email, code: delivered.get(email) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}
