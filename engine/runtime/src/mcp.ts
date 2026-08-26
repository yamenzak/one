/**
 * THE AGENT DOOR — MCP, STATELESS, ON THE TENANT'S OWN ADDRESS (D13).
 *
 * ⚠️ A TOOL CALL IS AN OPERATION CALL WITH A DIFFERENT ENVELOPE, AND NOTHING
 * ELSE. Everything between the envelope and the handler — locating the tenant,
 * who is asking, the replay, all seven gates, the audit entry — is
 * `performOperation`, the same function the HTTP door ends in (D12). Nothing in
 * this file may run a handler or apply a gate itself: the moment it does, the
 * agent door is a second place a concern can be forgotten, invisibly.
 *
 * ⚠️ STATELESS BY THE PROTOCOL'S OWN DESIGN. MCP dropped the session handshake:
 * each request carries what it needs, so there is no session to store, no
 * Durable Object, and nothing here that a cold isolate answers differently.
 * `initialize` is still answered — clients send it — but nothing is remembered.
 *
 * ⚠️ WHO IS ASKING IS THE DEPLOYMENT'S OWN IDENTITY, NEVER THE PROTOCOL'S.
 * A browser agent arrives with the member's session cookie (same origin, same
 * jar); a server agent arrives with a bearer token the account minted. Both
 * resolve through the same `identify` seam as every HTTP request, so a role
 * taken away stops working on the very next tool call.
 *
 * ⚠️ AN OPERATION THAT OPTED OUT (`tool: { why }`) DOES NOT EXIST HERE. Not
 * listed, and a call to it answers exactly as a tool that never existed —
 * a refusal that confirmed the name would undo the reason for opting out.
 */

import type { Door, McpTool, Problem } from "@engine/kernel";
import { PLATFORM_PROBLEMS, PUBLIC, isTool, problem, saidWhen, toolFor } from "@engine/kernel";
import { compose, surfaceOfComposed, type Composed, type Resolved } from "./compose.js";
import { NOBODY, performOperation, type Located, type Who, type Wiring } from "./serve.js";

/* --------------------------------------------------------------- envelope --- */

/**
 * ⚠️ THE VERSION IS THE SPEC'S DATE, echoed back when the client's is unknown.
 * Refusing an unknown version would refuse every future client; answering with
 * ours lets the client decide, which is the protocol's own rule.
 */
const PROTOCOL = "2025-06-18";

interface RpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

const rpcResult = (id: RpcRequest["id"], result: unknown): Response =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200, headers: { "content-type": "application/json; charset=utf-8" },
  });

const rpcError = (id: RpcRequest["id"], code: number, message: string): Response =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), {
    status: 200, headers: { "content-type": "application/json; charset=utf-8" },
  });

const asProblem = (p: Problem): Response =>
  new Response(JSON.stringify({ problem: p }), {
    status: p.status, headers: { "content-type": "application/json; charset=utf-8" },
  });

/* ------------------------------------------------------------ the answer --- */

export async function answerMcp(
  wiring: Wiring, request: Request, door: Door, now: Date,
): Promise<Response> {
  /* ⚠️ Tools are a workspace's operations, so the door must be a workspace. */
  if (door.kind !== "tenant") return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
  if (request.method !== "POST") return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

  /* ⚠️ THE SAME TWO-ANSWER SHAPE THE HTTP DOOR USES, for the same reason: the
     identity needs where this workspace IS and nothing about what it holds, so
     both start here rather than one after the other. See `Locating`. */
  const locating = wiring.locate(door);
  const identifying = wiring.identify?.(request, locating.where) ?? Promise.resolve(NOBODY);

  /* ⚠️ A refusal still settles what it started — see the same note in `serve`. */
  const refusing = async <T>(answer: T): Promise<T> => {
    await Promise.allSettled([identifying]);
    return answer;
  };

  const located = await locating.located;
  if (!located) return refusing(asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found")));

  const rpc = await readRpc(request);
  if (!rpc) return refusing(rpcError(null, -32700, "expected a JSON-RPC 2.0 request object"));

  const who = await identifying;

  switch (rpc.method) {
    case "initialize":
      return rpcResult(rpc.id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "one", title: door.slug ?? door.host, version: "1" },
      });

    /* ⚠️ A notification gets no body by the spec; 202 says "heard". */
    case "notifications/initialized":
      return new Response(null, { status: 202 });

    case "ping":
      return rpcResult(rpc.id, {});

    case "tools/list":
      return rpcResult(rpc.id, { tools: await listTools(wiring, located, who) });

    case "tools/call":
      return callTool(wiring, located, who, rpc, now,
        { origin: new URL(request.url).origin, slug: door.slug });

    default:
      return rpcError(rpc.id, -32601, `no such method: ${rpc.method}`);
  }
}

async function readRpc(request: Request): Promise<RpcRequest | null> {
  try {
    const parsed: unknown = JSON.parse(await request.text());
    /* ⚠️ No batches: the protocol dropped them, and a batch is a loop the
       caller can hold themselves. */
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rpc = parsed as Partial<RpcRequest>;
    if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return null;
    return rpc as RpcRequest;
  } catch { return null; }
}

/* ---------------------------------------------------------------- listing --- */

/**
 * ⚠️ LISTED MEANS CALLABLE BY THIS CALLER — the same rule the navigation
 * follows (D10): a destination somebody cannot reach is not drawn. A catalogue
 * of tools the permission gate will refuse teaches an agent to try them, and
 * every attempt is an audit row for a call that was never going to run.
 */
async function listTools(wiring: Wiring, located: Located, who: Who): Promise<readonly McpTool[]> {
  const out: McpTool[] = [];
  const seen = new Set<string>();
  for (const composed of composedApps(wiring, located)) {
    /* ⚠️ Per app (D15): the same caller may reach different tools in different
       products, and one flat set would list the union — tools the gate refuses. */
    const permissions = await who.permissionsIn(composed.app.id);
    /* ⚠️ ONE SOURCE, NOT A SECOND WALK. `surfaceOfComposed` is what the
       OpenAPI document and the typed client are written from; a catalogue that
       enumerated the map itself would be a second answer to "what does this
       deployment answer", and the two drift in the direction nobody tests. */
    for (const resolved of surfaceOfComposed(composed)) {
      if (seen.has(resolved.id)) continue;
      seen.add(resolved.id);
      if (!maySee(resolved, who, permissions)) continue;
      const tool = toolFor(resolved.spec);
      if (tool) out.push(walkedThrough(tool, composed));
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * WHAT A PERSON IS ASKED ON THE WAY TO THIS WRITE, TOLD TO THE AGENT TOO.
 *
 * ⚠️ AN OPERATION REACHED THROUGH A FLOW HAS A CONTEXT ITS INPUT SCHEMA CANNOT
 * CARRY. `product.register` takes twenty fields; what the SCREEN does is ask ten
 * plain questions, in an order, some of which are skipped depending on the
 * answers before them. That order is the product's own understanding of the
 * thing being made — and an agent given only the field names is guessing at
 * exactly the reasoning the flow already encodes.
 *
 * ⚠️ IT IS THE SAME DECLARATION THE SCREEN IS BUILT FROM, which is what stops it
 * becoming a second description that drifts: `story` in the manifest, and the
 * one thing `Create` draws.
 *
 * ⚠️ AND IT IS APPENDED RATHER THAN REPLACING THE SUMMARY. The summary says what
 * the operation DOES; this says what a person is walked through to reach it, and
 * an agent needs both — one to choose the tool, the other to fill it in.
 */
function walkedThrough(tool: McpTool, composed: Composed): McpTool {
  const flow = composed.app.screens.find((screen) => screen.story?.writes === tool.name)?.story;
  if (!flow) return tool;
  /* ⚠️ THE CONDITION IN WORDS — see `saidWhen`. A `Match` is an object, and one
     interpolated raw is `[object Object]`: not a degraded sentence but a wrong
     one, because the agent then reads a conditional question as an unconditional
     one and the guard the flow expresses is missing from its own account. */
  const asked = flow.asks
    .map((step) => (step.when ? `${step.ask} (only when ${saidWhen(step.when)})` : step.ask))
    .join(" ");
  return {
    ...tool,
    description: `${tool.description} A person reaching this is asked: ${asked}`,
  };
}

const maySee = (resolved: Resolved, who: Who, permissions: ReadonlySet<string>): boolean =>
  resolved.permission === PUBLIC
    ? who.signedIn
    : permissions.has(resolved.permission as string);

const composedApps = (wiring: Wiring, located: Located): readonly Composed[] =>
  located.apps
    .map((appId) => wiring.apps[appId])
    .filter((make): make is NonNullable<typeof make> => !!make)
    .map((make) => compose(make()));

/* ---------------------------------------------------------------- calling --- */

async function callTool(
  wiring: Wiring, located: Located, who: Who, rpc: RpcRequest, now: Date,
  /* ⚠️ The same address the HTTP door passes, so a tool that sends somebody
     somewhere sends them to the workspace they are actually in. */
  at: { readonly origin: string; readonly slug: string | null },
): Promise<Response> {
  const name = String(rpc.params?.name ?? "");
  const given = rpc.params?.arguments ?? {};
  if (given === null || typeof given !== "object" || Array.isArray(given)) {
    return rpcError(rpc.id, -32602, "arguments must be an object");
  }

  let found: { readonly composed: Composed; readonly op: Resolved } | null = null;
  for (const composed of composedApps(wiring, located)) {
    const op = composed.byId.get(name);
    if (op) { found = { composed, op }; break; }
  }

  /*
    ⚠️ AN OPT-OUT AND A TOOL THAT NEVER EXISTED ANSWER IDENTICALLY. `tool:
    { why }` marks operations a model must not reach — spending, granting,
    minting — and a distinct refusal would confirm to the model that the name is
    real and worth asking a human to call.
  */
  if (!found || !isTool(found.op.spec)) {
    return rpcError(rpc.id, -32602, `no such tool: ${name}`);
  }

  const outcome = await performOperation(
    wiring, located, who, found, given as Record<string, unknown>, null, now, at,
  );

  /*
    ⚠️ A REFUSAL IS A TOOL RESULT, NOT A PROTOCOL ERROR. The protocol's errors
    mean "the request was malformed"; a gate saying no is a fact about the
    caller that the model should read and relay — so it arrives as `isError`
    content, in the same words the HTTP door would have used.
  */
  if (outcome.kind === "refused") {
    return rpcResult(rpc.id, {
      content: [{ type: "text", text: refusalText(outcome.problem) }],
      structuredContent: { problem: outcome.problem },
      isError: true,
    });
  }

  const answer = outcome.answer ?? {};
  return rpcResult(rpc.id, {
    content: [{ type: "text", text: JSON.stringify(answer) }],
    structuredContent: answer,
    isError: false,
  });
}

const refusalText = (p: Problem): string =>
  p.detail ? `${p.title} ${p.detail}` : p.title;
