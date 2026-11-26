#!/usr/bin/env node
// Load the sample cards into a running catalog over MCP, the same way an agent files them.
//
//   CATALOG_TOKEN=... node scripts/seed.mjs                                   (local dev server)
//   CATALOG_TOKEN=... node scripts/seed.mjs https://card-catalog.<you>.workers.dev
//
// The sample cards are made up (a fictional garden club). File them only into a catalog you're testing.

import { readFile } from "node:fs/promises";

const base = (process.argv[2] || "http://localhost:8787").replace(/\/+$/, "");
const url = base.endsWith("/mcp") ? base : base + "/mcp";
const token = process.env.CATALOG_TOKEN;
if (!token) {
  console.error("Set CATALOG_TOKEN to the catalog's token first.");
  process.exit(1);
}

const seed = JSON.parse(await readFile(new URL("../seed/sample-cards.json", import.meta.url), "utf8"));
let id = 0;
for (const card of seed.cards) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "file_card", arguments: { ...card, filed_by: "sample-seed" } } }),
  });
  if (!res.ok) {
    console.error(`Stopped: the server answered ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const out = await res.json();
  const text = out.result?.content?.[0]?.text || out.error?.message || "no answer";
  if (out.error || out.result?.isError) {
    console.error(`Stopped: ${text}`);
    process.exit(1);
  }
  console.log(text);
}
console.log(`\nDone: ${seed.cards.length} sample cards filed at ${url}`);
