// MCP over Streamable HTTP, stateless: every POST carries one JSON-RPC message (or a batch)
// and gets a plain JSON answer. No sessions, no server-sent events, nothing to keep alive.

import { VERSION, LIMITS } from "./config.js";
import { toolDefs, HANDLERS } from "./tools.js";
import { CatalogError } from "./catalog.js";
import { proFeatureForTool, proMessage } from "./pro.js";

export const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

function instructions(config) {
  const ex = `${config.realms[0].letter}-000012`;
  return [
    `This is a card catalog: numbered cards (like ${ex}), each a short passage from a chat, call, doc or note, kept on a shelf with tags and a one-line blurb.`,
    "Ask first: call ask before searching mail, files or the web. Answer from the blurbs when they are enough.",
    "Read a card by number when you need the passage; read its prev or next number to follow the conversation.",
    "File what is worth keeping with file_card, one short passage per card, same source for passages from the same conversation.",
    "Bookmark numbers you or another agent will need later. Card numbers never change, so they are safe to quote.",
    "Never file passwords, keys or card numbers.",
  ].join("\n");
}

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleOne(msg, store, config) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return fail(msg?.id, -32600, "Invalid request");
  }
  const { id, method } = msg;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};
  if (id === undefined || id === null) return null; // a notification: nothing to answer

  switch (method) {
    case "initialize": {
      const want = params.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "card-catalog", title: config.title, version: VERSION },
        instructions: instructions(config),
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolDefs(config) });
    case "tools/call": {
      const name = params.name;
      const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      const handler = Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : null;
      if (!handler) {
        const pro = proFeatureForTool(name);
        if (pro) return ok(id, { content: [{ type: "text", text: proMessage(pro.name) }], isError: true });
        return fail(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const r = await handler(store, config, args);
        return ok(id, { content: [{ type: "text", text: r.text }], structuredContent: r.data, isError: !!r.isError });
      } catch (e) {
        if (e instanceof CatalogError) return ok(id, { content: [{ type: "text", text: e.message }], isError: true });
        console.error("tool failed", name, e);
        return ok(id, { content: [{ type: "text", text: "Something went wrong on the server. Try again." }], isError: true });
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export async function handleMcp(request, store, config, headers = {}) {
  if (request.method === "GET") return new Response("This MCP server answers POST requests only (no event stream).", { status: 405, headers: { Allow: "POST, DELETE", ...headers } });
  if (request.method === "DELETE") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST, DELETE", ...headers } });

  if (Number(request.headers.get("Content-Length") || 0) > LIMITS.body) return json(fail(null, -32600, "Request too large"), 413, headers);
  const raw = await request.text();
  if (raw.length > LIMITS.body) return json(fail(null, -32600, "Request too large"), 413, headers);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(fail(null, -32700, "Parse error"), 400, headers);
  }

  if (Array.isArray(body)) {
    if (!body.length) return json(fail(null, -32600, "Empty batch"), 400, headers);
    const out = [];
    for (const m of body.slice(0, 20)) {
      const r = await handleOne(m, store, config);
      if (r) out.push(r);
    }
    return out.length ? json(out, 200, headers) : new Response(null, { status: 202, headers });
  }
  const r = await handleOne(body, store, config);
  return r ? json(r, 200, headers) : new Response(null, { status: 202, headers });
}
