// The single shared token: MCP needs it, the web page needs it (unless PUBLIC_PAGE=true).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memEnv, post, fetchWorker, file, TOKEN } from "./helpers.js";

const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

describe("MCP access", () => {
  it("rejects a request with no token", async () => {
    const res = await post(memEnv(), ping, { token: "" });
    assert.equal(res.status, 401);
    assert.match(res.headers.get("WWW-Authenticate"), /^Bearer/);
    assert.match((await res.json()).error, /bearer token/);
  });

  it("rejects a wrong token, including one that only shares a prefix", async () => {
    assert.equal((await post(memEnv(), ping, { token: "wrong-token-0123456789" })).status, 401);
    assert.equal((await post(memEnv(), ping, { token: TOKEN.slice(0, -1) })).status, 401);
    assert.equal((await post(memEnv(), ping, { token: TOKEN + "x" })).status, 401);
  });

  it("accepts the right token", async () => {
    const res = await post(memEnv(), ping);
    assert.equal(res.status, 200);
  });

  it("refuses to run with no token set, or a short one, and says how to fix it", async () => {
    const none = await post(memEnv({ CATALOG_TOKEN: "" }), ping, { token: "" });
    assert.equal(none.status, 503);
    assert.match((await none.json()).error, /wrangler secret put CATALOG_TOKEN/);
    const short = await post(memEnv({ CATALOG_TOKEN: "short" }), ping, { token: "short" });
    assert.equal(short.status, 503);
    assert.match((await short.json()).error, /too short/);
  });

  it("says so when no storage is bound", async () => {
    const res = await post({ CATALOG_TOKEN: TOKEN }, ping);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /D1 database/);
  });

  it("health shows only status, version and store type", async () => {
    const res = await fetchWorker(memEnv(), "/health");
    assert.deepEqual(Object.keys(await res.json()).sort(), ["ok", "store", "version"]);
  });
});

describe("web page access", () => {
  it("shows a sign-in form, not cards, without the cookie", async () => {
    const env = memEnv();
    await file(env, { shelf: "Private shelf", text: "Something only the owner should see." });
    const res = await fetchWorker(env, "/");
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /name="token"/);
    assert.doesNotMatch(body, /Private shelf/);
    const card = await (await fetchWorker(env, "/card/N-000001")).text();
    assert.doesNotMatch(card, /only the owner/);
  });

  it("signs in with the token, sets an HttpOnly cookie that isn't the token, and then shows shelves", async () => {
    const env = memEnv();
    await file(env, { shelf: "Private shelf", text: "Something only the owner should see." });
    const wrong = await fetchWorker(env, "/login", { method: "POST", body: new URLSearchParams({ token: "nope-nope-nope-nope" }) });
    assert.equal(wrong.status, 401);
    const res = await fetchWorker(env, "/login", { method: "POST", body: new URLSearchParams({ token: TOKEN }) });
    assert.equal(res.status, 303);
    const cookie = res.headers.get("Set-Cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
    assert.ok(!cookie.includes(TOKEN));
    const page = await (await fetchWorker(env, "/", { headers: { Cookie: cookie.split(";")[0] } })).text();
    assert.match(page, /Private shelf/);
    const forged = await (await fetchWorker(env, "/", { headers: { Cookie: "cc_page=" + "0".repeat(64) } })).text();
    assert.doesNotMatch(forged, /Private shelf/);
  });

  it("is open to anyone when PUBLIC_PAGE is true, while MCP still needs the token", async () => {
    const env = memEnv({ PUBLIC_PAGE: "true" });
    await file(env, { shelf: "Demo shelf", text: "A public demo card." });
    assert.match(await (await fetchWorker(env, "/")).text(), /Demo shelf/);
    assert.equal((await post(env, ping, { token: "" })).status, 401);
  });
});
