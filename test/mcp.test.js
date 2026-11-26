// The MCP handshake and JSON-RPC plumbing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memEnv, rpc, post, fetchWorker, TOKEN } from "./helpers.js";
import { PROTOCOLS } from "../src/mcp.js";

describe("MCP over HTTP", () => {
  it("answers initialize with the client's protocol version, server info, tools capability and instructions", async () => {
    const env = memEnv();
    const { status, body } = await rpc(env, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(status, 200);
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.result.protocolVersion, "2025-06-18");
    assert.equal(body.result.serverInfo.name, "card-catalog");
    assert.deepEqual(body.result.capabilities.tools, { listChanged: false });
    assert.match(body.result.instructions, /Ask first/);
  });

  it("offers its newest protocol version when the client asks for one it doesn't know", async () => {
    const { body } = await rpc(memEnv(), "initialize", { protocolVersion: "1999-01-01" });
    assert.equal(body.result.protocolVersion, PROTOCOLS[0]);
  });

  it("accepts the initialized notification with 202 and no body", async () => {
    const res = await post(memEnv(), { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(res.status, 202);
    assert.equal(await res.text(), "");
  });

  it("lists exactly the five free tools, each with an input schema", async () => {
    const { body } = await rpc(memEnv(), "tools/list", {});
    const tools = body.result.tools;
    assert.deepEqual(tools.map((t) => t.name), ["ask", "read", "file_card", "bookmark", "browse"]);
    for (const t of tools) {
      assert.equal(t.inputSchema.type, "object", t.name);
      assert.ok(t.description.length > 40, t.name);
    }
    assert.deepEqual(tools.find((t) => t.name === "ask").inputSchema.required, ["question"]);
    assert.deepEqual(tools.find((t) => t.name === "file_card").inputSchema.required, ["text", "shelf"]);
  });

  it("shows the configured realms in the tool descriptions", async () => {
    const { body } = await rpc(memEnv({ REALMS: "W:work,H:home" }), "tools/list", {});
    const ask = body.result.tools.find((t) => t.name === "ask");
    assert.match(ask.inputSchema.properties.realm.description, /W = work, H = home/);
  });

  it("answers ping, and returns empty resource and prompt lists", async () => {
    const env = memEnv();
    assert.deepEqual((await rpc(env, "ping")).body.result, {});
    assert.deepEqual((await rpc(env, "resources/list")).body.result, { resources: [] });
    assert.deepEqual((await rpc(env, "prompts/list")).body.result, { prompts: [] });
  });

  it("returns JSON-RPC errors for unknown methods, unknown tools, bad requests and bad JSON", async () => {
    const env = memEnv();
    assert.equal((await rpc(env, "nope/nothing")).body.error.code, -32601);
    assert.equal((await rpc(env, "tools/call", { name: "launch_rocket", arguments: {} })).body.error.code, -32602);
    const bad = await post(env, { id: 1, method: "ping" });
    assert.equal((await bad.json()).error.code, -32600);
    const garbled = await post(env, "{not json", { raw: true });
    assert.equal(garbled.status, 400);
    assert.equal((await garbled.json()).error.code, -32700);
  });

  it("handles a batch of requests", async () => {
    const res = await post(memEnv(), [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    const out = await res.json();
    assert.deepEqual(out.map((r) => r.id), [1, 2]);
  });

  it("refuses GET (no event stream), allows DELETE, answers CORS preflight, and caps request size", async () => {
    const env = memEnv();
    const auth = { Authorization: `Bearer ${TOKEN}` };
    assert.equal((await fetchWorker(env, "/mcp", { headers: auth })).status, 405);
    assert.equal((await fetchWorker(env, "/mcp", { method: "DELETE", headers: auth })).status, 204);
    const pre = await fetchWorker(env, "/mcp", { method: "OPTIONS" });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get("Access-Control-Allow-Headers"), /Authorization/);
    const big = await post(env, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "file_card", arguments: { shelf: "x", text: "a".repeat(70000) } } });
    assert.equal(big.status, 413);
  });

  it("gives tool results as text content plus structured content", async () => {
    const env = memEnv();
    const { body } = await rpc(env, "tools/call", { name: "file_card", arguments: { shelf: "Notes", text: "Hello from a test." } });
    assert.equal(body.result.isError, false);
    assert.equal(body.result.content[0].type, "text");
    assert.match(body.result.content[0].text, /^Filed N-000001/);
    assert.equal(body.result.structuredContent.num, "N-000001");
  });
});
