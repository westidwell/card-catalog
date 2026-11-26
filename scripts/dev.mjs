#!/usr/bin/env node
// Run the Worker on your own machine with plain Node: no Cloudflare account, no wrangler.
//
//   node scripts/dev.mjs                 empty catalog, kept in memory
//   node scripts/dev.mjs --seed          load the sample cards first
//   node scripts/dev.mjs --db cards.db   keep cards in a SQLite file (Node 22.13+), same SQL as D1
//   node scripts/dev.mjs --port 8787 --public
//
// Set CATALOG_TOKEN to choose the token; otherwise a random one is made and printed.

import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import worker, { storeFor } from "../src/index.js";
import { MemoryStore } from "../src/store-memory.js";
import { readConfig } from "../src/config.js";
import { fileCard } from "../src/catalog.js";
import { openSqliteD1 } from "./sqlite-d1.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const port = Number(opt("--port", process.env.PORT || 8787));
const token = process.env.CATALOG_TOKEN || randomBytes(24).toString("base64url");
const env = {
  CATALOG_TOKEN: token,
  REALMS: process.env.REALMS,
  CATALOG_TITLE: process.env.CATALOG_TITLE,
  PUBLIC_PAGE: flag("--public") ? "true" : process.env.PUBLIC_PAGE,
};

const dbPath = opt("--db", "");
if (dbPath) env.DB = await openSqliteD1(dbPath);
else env.STORE = new MemoryStore();

if (flag("--seed")) {
  const seed = JSON.parse(await readFile(new URL("../seed/sample-cards.json", import.meta.url), "utf8"));
  const store = storeFor(env);
  const config = readConfig(env);
  for (const c of seed.cards) await fileCard(store, config, { ...c, filed_by: "sample-seed" });
  console.log(`Loaded ${seed.cards.length} sample cards.`);
}

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host || "localhost:" + port}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await worker.fetch(request, env, { waitUntil() {} });
    const headers = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end("dev server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  const base = `http://localhost:${port}`;
  console.log(`\ncard-catalog running at ${base}  (${dbPath ? "SQLite file " + dbPath : "in memory"})`);
  console.log(`MCP endpoint: ${base}/mcp`);
  if (!process.env.CATALOG_TOKEN) console.log(`Token for this run: ${token}\n(set CATALOG_TOKEN to pick your own)`);
  console.log(`\nConnect Claude Code:\n  claude mcp add --transport http card-catalog ${base}/mcp --header "Authorization: Bearer <token>"\n`);
});
