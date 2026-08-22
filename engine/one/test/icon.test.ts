/**
 * THE TILE ON SOMEBODY'S HOME SCREEN, THROUGH THE REAL ROUTES.
 *
 * ⚠️ EVERY FAILURE THIS COVERS IS ONE NOBODY REPORTS. A missing favicon is a
 * grey square somebody assumes is how the product is; a missing
 * `apple-touch-icon` is a screenshot of the page pinned to a phone; a
 * commercial-only feature that a personal workspace can write is a business's
 * mark on a workspace that is not that business, discovered by a regulator or by
 * nobody. None of them throws, and none of them fails a unit test of the
 * function underneath.
 *
 * ⚠️ SO THE ASSERTIONS ARE HTTP, AND THEY GO THROUGH THE DOORS. `installableFor`
 * answered for a workspace and 404'd everywhere else; the only way to see that
 * the identity door had no icon at all was to ask the identity door.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { addShard, createTenant, noteShardApp, setIcon, type Db } from "@engine/runtime";
import worker, { APPS } from "../src/index.js";
import { booted } from "./warm.js";

const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };
const call = (host: string, path: string) =>
  worker.fetch(new Request(`http://${host}:8080${path}`), asDev as never);

const directory = () => env.DIRECTORY as unknown as Db;

/* ⚠️ A REAL PNG, BUILT HERE. A fixture file would be a binary in the repository
   nobody can review, and the encoder that would have made it is the thing on the
   other side of these assertions. Sixteen bytes of header is all `readPng`
   looks at, so this is honest about what it is testing. */
const png = (side: number, extra = 64): Uint8Array => {
  const out = new Uint8Array(24 + extra);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  out.set([0, 0, 0, 13], 8);
  out.set([...new TextEncoder().encode("IHDR")], 12);
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  out.set(be(side), 16);
  out.set(be(side), 20);
  return out;
};

let personal = "";
let business = "";

beforeAll(async () => {
  await booted(asDev);
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", id);

  personal = `own${Date.now().toString(36)}`;
  business = `biz${Date.now().toString(36)}`;
  for (const slug of [personal, business]) {
    const made = await createTenant(directory(), {
      slug, name: slug, country: "DE", where: "eu", apps: ["inventory"],
    });
    if (typeof made === "string") throw new Error(`${slug}: ${made}`);
  }
  /* ⚠️ Straight to the column, because becoming a business is a whole
     transaction with a legal name and a payment behind it — and what is under
     test here is what a commercial workspace may do, not how it became one. */
  await directory().prepare(`UPDATE tenant SET kind = 'commercial' WHERE slug = ?`)
    .bind(business).run();
});

/* ------------------------------------------------------------ every door --- */

describe("what a browser asks for before it has read anything", () => {
  /*
    ⚠️ THE DOORS ARE THE FIRST THREE SCREENS ANYBODY SEES and they had no icon
    and no manifest at all — `installableFor` refused every door that was not a
    workspace. A deployment with no icon on its own sign-in page is not neutral;
    it is a browser drawing a blank page symbol beside our name.
  */
  for (const host of ["id.localhost", "setup.localhost", "localhost"]) {
    it(`serves ${host} an icon`, async () => {
      const svg = await call(host, "/icon.svg");
      expect(svg.status, `${host}: /icon.svg`).toBe(200);
      expect(svg.headers.get("content-type")).toContain("image/svg+xml");

      const png = await call(host, "/icon.png");
      expect(png.status, `${host}: /icon.png`).toBe(200);
      expect(png.headers.get("content-type")).toBe("image/png");
    });

    /* ⚠️ AND IS NOT INSTALLABLE FROM IT. These doors are not places anybody
       comes back to — a manifest here is a home-screen tile whose `start_url`
       opens the sign-up wizard, or the console, for ever. The icon and the
       manifest are opposite questions, which is why they answer differently on
       the same host. */
    it(`cannot be installed from ${host}`, async () => {
      expect((await call(host, "/manifest.webmanifest")).status).toBe(404);
    });
  }

  it("gives a workspace both, because a workspace IS the installable thing", async () => {
    const manifest = await call(`${personal}.localhost`, "/manifest.webmanifest");
    expect(manifest.status).toBe(200);
    const body = await manifest.json() as { icons: { src: string }[]; name: string };
    expect(body.name).toContain("One");
    expect(body.icons.map((i) => i.src)).toContain("/icon.png");
  });

  /* ⚠️ THE NAMES A PLATFORM ASKS FOR ON ITS OWN, before any markup of ours has a
     say — which includes every error page and the manifest's whole scope. */
  for (const path of ["/apple-touch-icon.png", "/favicon.ico"]) {
    it(`answers ${path}, which nothing of ours links to`, async () => {
      const got = await call("id.localhost", path);
      expect(got.status).toBe(200);
      expect(got.headers.get("content-type")).toBe("image/png");
    });
  }

  it("draws a real PNG, not an empty one", async () => {
    const got = await call("id.localhost", "/icon.png");
    const bytes = new Uint8Array(await got.arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(200);
  });
});

/* ------------------------------------------------------- the two kinds --- */

describe("whose mark a workspace wears", () => {
  it("gives a personal workspace ours, and refuses it one of its own", async () => {
    const refused = await setIcon(directory(), tenantIdOf(personal), "personal", png(512));
    expect(refused).toBe("not_commercial");

    /* ⚠️ AND IT STILL HAS A TILE. "Personal workspaces wear ours" is a default,
       not a withheld feature — a blank tile is a page somebody cannot find
       again. */
    const got = await call(`${personal}.localhost`, "/icon.png");
    expect(got.status).toBe(200);
  });

  it("lets a commercial workspace upload one, and then serves that one", async () => {
    const mine = png(512, 200);
    const done = await setIcon(directory(), tenantIdOf(business), "commercial", mine);
    expect(typeof done).not.toBe("string");

    const got = await call(`${business}.localhost`, "/icon.png");
    expect(got.status).toBe(200);
    const served = new Uint8Array(await got.arrayBuffer());
    expect(served.length, "the drawn tile was served instead of the upload")
      .toBe(mine.length);

    /* ⚠️ AND THE MANIFEST DECLARES THE SIZE READ OUT OF THE FILE. An installer
       picks by `sizes` and does not check, so a wrong one is chosen for the
       largest slot and upscaled onto a home screen. */
    const manifest = await (await call(`${business}.localhost`, "/manifest.webmanifest"))
      .json() as { icons: { src: string; sizes: string }[] };
    expect(manifest.icons.find((i) => i.src === "/icon.png")?.sizes).toBe("512x512");
  });

  /*
    ⚠️ THE READ CHECKS THE KIND TOO, AND THIS IS WHY. A workspace that uploaded
    while commercial and was then changed back would otherwise keep serving it —
    a business's mark on a workspace that is no longer that business, on a public
    route, with nothing anywhere reporting it.
  */
  /*
    ⚠️ THE UPLOAD HAPPENS INSIDE THIS TEST, and that is not tidiness. The Workers
    pool isolates storage per test, so a fixture written by the test above is
    rolled back before this one runs — which made the first version of this
    assertion compare the drawn tile against a length nothing had ever stored.
    It passed, and it passed just as happily with the check it exists for
    deleted. A test that cannot fail is worse than no test, because it is counted.
  */
  it("stops serving an upload the moment the workspace is not a business", async () => {
    const mine = png(512, 200);
    expect(typeof await setIcon(directory(), tenantIdOf(business), "commercial", mine))
      .not.toBe("string");
    /* It is theirs while they are a business. */
    expect((await (await call(`${business}.localhost`, "/icon.png")).arrayBuffer()).byteLength)
      .toBe(mine.length);

    await directory().prepare(`UPDATE tenant SET kind = 'personal' WHERE slug = ?`)
      .bind(business).run();

    const served = new Uint8Array(
      await (await call(`${business}.localhost`, "/icon.png")).arrayBuffer());
    /* Ours, drawn — which is a different file from the one they uploaded. */
    expect(served.length, "a business's mark is still being served for a workspace that is not that business")
      .not.toBe(mine.length);
    expect([...served.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});

/* ------------------------------------------------------------ refusals --- */

describe("what the store refuses, and why each one is its own", () => {
  const cases: readonly [string, Uint8Array, string][] = [
    ["a file that is not a PNG", new TextEncoder().encode("<svg>oh no</svg>xxxxxxxxxxxxx"), "not_a_png"],
    ["nothing at all", new Uint8Array(0), "empty"],
  ];
  for (const [says, body, refusal] of cases) {
    it(`refuses ${says}`, async () => {
      expect(await setIcon(directory(), tenantIdOf(business), "commercial", body)).toBe(refusal);
    });
  }

  it("refuses one that is not square, because a home screen crops it", async () => {
    const tall = png(512);
    tall.set([0, 0, 1, 0], 20);
    expect(await setIcon(directory(), tenantIdOf(business), "commercial", tall)).toBe("not_square");
  });

  it("refuses one too small to be sharp where it is largest", async () => {
    expect(await setIcon(directory(), tenantIdOf(business), "commercial", png(64)))
      .toBe("wrong_size");
  });

  it("refuses one too big to be an icon at all", async () => {
    expect(await setIcon(directory(), tenantIdOf(business), "commercial", png(512, 200_000)))
      .toBe("too_big");
  });
});

/* ⚠️ Resolved from the slug rather than remembered, because `createTenant`'s
   id is not the thing under test and threading it would be a fixture. */
function tenantIdOf(slug: string): never {
  return ids[slug] as never;
}
const ids: Record<string, string> = {};
beforeAll(async () => {
  for (const slug of [personal, business]) {
    const row = await directory().prepare(`SELECT id FROM tenant WHERE slug = ?`)
      .bind(slug).first<{ id: string }>();
    ids[slug] = row!.id;
  }
});
