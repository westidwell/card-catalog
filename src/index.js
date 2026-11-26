// card-catalog: a personal card catalog MCP server for Cloudflare Workers.
//
//   POST /mcp          MCP (JSON-RPC), needs "Authorization: Bearer <CATALOG_TOKEN>"
//   GET  /             read-only web page: shelves, newest cards, search (token sign-in unless PUBLIC_PAGE=true)
//   GET  /shelf/<id>   cards on one shelf
//   GET  /card/<num>   one card with prev/next
//   GET  /health       { ok, version, store }

import { readConfig, VERSION, LIMITS } from "./config.js";
import { D1Store } from "./store-d1.js";
import { handleMcp } from "./mcp.js";
import { ask, readCard } from "./catalog.js";
import { bearerOk, tokenProblem, pageSignedIn, tokenMatches, setCookie, clearCookie } from "./access.js";
import { homePage, shelfPage, cardPage, loginPage, notFoundPage, FAVICON } from "./page.js";

const d1Stores = new WeakMap();

// Tests and local dev hand in a store as env.STORE; on Cloudflare the D1 binding DB is used.
export function storeFor(env) {
  if (env.STORE) return env.STORE;
  if (env.DB) {
    let s = d1Stores.get(env.DB);
    if (!s) d1Stores.set(env.DB, (s = new D1Store(env.DB)));
    return s;
  }
  return null;
}

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const PAGE_HEADERS = {
  ...SECURITY,
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...PAGE_HEADERS, ...extra } });
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...SECURITY, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const decode = (s) => {
  try { return decodeURIComponent(s); } catch { return ""; }
};
const redirect = (to, extra = {}) => new Response(null, { status: 303, headers: { Location: to, ...extra } });

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const config = readConfig(env);
  const store = storeFor(env);
  const secure = url.protocol === "https:";

  if (path === "/favicon.svg" || path === "/favicon.ico") {
    return new Response(FAVICON, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
  }
  if (path === "/health") return json({ ok: !!store && !tokenProblem(env), version: VERSION, store: store ? store.name : "none" });

  // ---- MCP ----
  if (path === "/mcp") {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const problem = tokenProblem(env);
    if (problem) return json({ error: problem }, 503, CORS);
    if (!(await bearerOk(request, env))) {
      return json({ error: "Missing or wrong bearer token." }, 401, { ...CORS, "WWW-Authenticate": 'Bearer realm="card-catalog"' });
    }
    if (!store) return json({ error: "No storage. Bind a D1 database as DB in wrangler.toml (see README)." }, 503, CORS);
    return handleMcp(request, store, config, CORS);
  }

  // ---- web page ----
  if (path === "/login" && request.method === "POST") {
    const problem = tokenProblem(env);
    if (problem) return html(loginPage(config, { problem }), 503);
    const form = await request.formData().catch(() => null);
    const token = form ? String(form.get("token") || "") : "";
    if (!(await tokenMatches(token, env))) return html(loginPage(config, { error: "That token didn't match." }), 401);
    return redirect("/", { "Set-Cookie": await setCookie(env, secure) });
  }
  if (path === "/logout") return redirect("/", { "Set-Cookie": clearCookie(secure) });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: SECURITY });

  const isPage = path === "/" || path.startsWith("/shelf/") || path.startsWith("/card/");
  if (!isPage) return html(notFoundPage(config), 404);

  if (!config.publicPage) {
    const problem = tokenProblem(env);
    if (problem) return html(loginPage(config, { problem }), 503);
    if (!(await pageSignedIn(request, env))) return html(loginPage(config));
  }
  if (!store) return html(loginPage(config, { problem: "No storage. Bind a D1 database as DB in wrangler.toml (see README)." }), 503);
  await store.init();
  const total = await store.countCards();

  if (path === "/") {
    const q = (url.searchParams.get("q") || "").slice(0, 200).trim();
    if (q) {
      const r = await ask(store, config, { question: q, limit: LIMITS.askMax });
      return html(homePage(config, { total, q, results: r }));
    }
    const [shelves, recent] = await Promise.all([store.listShelves(), store.recentCards(10)]);
    return html(homePage(config, { total, shelves, recent }));
  }
  if (path.startsWith("/shelf/")) {
    const id = decode(path.slice(7)).slice(0, 80);
    const shelf = await store.getShelf(id);
    if (!shelf) return html(notFoundPage(config, "No shelf by that name."), 404);
    return html(shelfPage(config, shelf, await store.shelfCards(id, { limit: 500 }), total));
  }
  const num = decode(path.slice(6)).slice(0, 20);
  const card = await readCard(store, config, num).catch(() => null);
  if (!card) return html(notFoundPage(config, `No card ${num}.`), 404);
  if (card.num !== num) return redirect("/card/" + card.num);
  return html(cardPage(config, card, total));
}

export default {
  async fetch(request, env = {}, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error("request failed", e);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  },
};
