// Optional: runs the Worker inside workerd, Cloudflare's real runtime, with a local D1 database,
// through Miniflare. Needs `npm install` first (Miniflare is the only dev dependency).
// `npm test` does not run this file; `npm run test:workerd` does. Nothing here touches the network.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const TOKEN = "workerd-token-0123456789abcdef";

let Miniflare = null;
try {
  ({ Miniflare } = await import("miniflare"));
} catch {
  Miniflare = null;
}

describe("the Worker inside workerd with D1", { skip: !Miniflare && "miniflare isn't installed (run npm install)" }, () => {
  let mf;
  before(() => {
    mf = new Miniflare({
      modules: true,
      scriptPath: repo + "src/index.js",
      modulesRoot: repo,
      modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
      compatibilityDate: "2025-11-01",
      d1Databases: ["DB"],
      bindings: { CATALOG_TOKEN: TOKEN, REALMS: "W:work,H:home" },
    });
  });
  after(() => mf?.dispose());

  const rpc = async (method, params, token = TOKEN) => {
    const res = await mf.dispatchFetch("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { status: res.status, body: await res.json() };
  };
  const call = async (name, args) => (await rpc("tools/call", { name, arguments: args })).body.result;

  it("does the handshake and lists the tools", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
    assert.equal(init.body.result.serverInfo.name, "card-catalog");
    const list = await rpc("tools/list", {});
    assert.deepEqual(list.body.result.tools.map((t) => t.name), ["ask", "read", "file_card", "bookmark", "browse"]);
  });

  it("files, asks, reads with prev/next and bookmarks against D1", async () => {
    for (const text of ["Bins 1 and 2 are full.", "Turning day is Sunday.", "No cooked food in the bins: it brings rats."]) {
      const r = await call("file_card", { shelf: "Compost", source: "Compost chat", text, realm: "home", tags: ["compost"] });
      assert.equal(r.isError, false, r.content[0].text);
    }
    assert.equal((await call("file_card", { shelf: "Desk", text: "Work card." })).structuredContent.num, "W-000004");
    assert.equal((await call("ask", { question: "rats" })).structuredContent.cards[0].num, "H-000003");
    const read = (await call("read", { num: "H-2" })).structuredContent;
    assert.deepEqual([read.prev, read.next], ["H-000001", "H-000003"]);
    assert.equal((await call("bookmark", { nums: ["H-000001"], note: "x" })).isError, false);
    assert.equal((await call("browse", {})).structuredContent.total_cards, 4);
  });

  it("rejects a request without the token", async () => {
    assert.equal((await rpc("ping", {}, "")).status, 401);
  });
});
