// Shared test helpers. Every test runs the real Worker handler (src/index.js) in Node,
// against an in-memory store or against the D1 SQL on Node's built-in SQLite.

import worker from "../src/index.js";
import { MemoryStore } from "../src/store-memory.js";
import { sqliteAvailable, openSqliteD1 } from "../scripts/sqlite-d1.mjs";

export const TOKEN = "test-token-0123456789abcdef";
export const BASE = "https://catalog.example.test";

export const HAS_SQLITE = await sqliteAvailable();

export function memEnv(extra = {}) {
  return { CATALOG_TOKEN: TOKEN, STORE: new MemoryStore(), ...extra };
}

export async function d1Env(extra = {}) {
  return { CATALOG_TOKEN: TOKEN, DB: await openSqliteD1(":memory:"), ...extra };
}

// Each store the suites run against. D1 is skipped where node:sqlite isn't available.
export const STORES = [
  { name: "memory store", make: async (extra) => memEnv(extra) },
  { name: "D1 store (SQLite)", make: async (extra) => d1Env(extra), skip: !HAS_SQLITE && "node:sqlite not available in this Node version" },
];

export async function fetchWorker(env, path, init = {}) {
  return worker.fetch(new Request(BASE + path, init), env, { waitUntil() {} });
}

export async function post(env, body, { token = TOKEN, raw = false } = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchWorker(env, "/mcp", { method: "POST", headers, body: raw ? body : JSON.stringify(body) });
}

let nextId = 1;
export async function rpc(env, method, params) {
  const res = await post(env, { jsonrpc: "2.0", id: nextId++, method, params });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

// Calls a tool and returns { text, data, isError }.
export async function call(env, name, args = {}) {
  const { body } = await rpc(env, "tools/call", { name, arguments: args });
  if (body.error) throw new Error(`JSON-RPC error ${body.error.code}: ${body.error.message}`);
  return { text: body.result.content[0].text, data: body.result.structuredContent, isError: body.result.isError };
}

export async function file(env, args) {
  const r = await call(env, "file_card", args);
  if (r.isError) throw new Error(r.text);
  return r.data;
}
