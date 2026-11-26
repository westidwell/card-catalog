// The read-only web page and the sample cards.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { memEnv, call, fetchWorker, file } from "./helpers.js";

const open = (extra) => memEnv({ PUBLIC_PAGE: "true", ...extra });

describe("web page", () => {
  it("says the catalog is empty when it is", async () => {
    const html = await (await fetchWorker(open(), "/")).text();
    assert.match(html, /The catalog is empty/);
    assert.match(html, /<title>Card catalog<\/title>/);
  });

  it("lists shelves and newest cards, and shows a card with prev and next links", async () => {
    const env = open({ CATALOG_TITLE: "Garden notes" });
    await file(env, { shelf: "Compost", source: "Chat", text: "First." });
    await file(env, { shelf: "Compost", source: "Chat", text: "Second.", link: "https://example.com/chat" });
    await file(env, { shelf: "Compost", source: "Chat", text: "Third." });
    const home = await (await fetchWorker(env, "/")).text();
    assert.match(home, /<title>Garden notes<\/title>/);
    assert.match(home, /href="\/shelf\/compost"/);
    assert.match(home, /3 cards/);
    const card = await (await fetchWorker(env, "/card/N-000002")).text();
    assert.match(card, /href="\/card\/N-000001"/);
    assert.match(card, /href="\/card\/N-000003"/);
    assert.match(card, /href="https:\/\/example.com\/chat" rel="noopener noreferrer"/);
    const shelf = await (await fetchWorker(env, "/shelf/compost")).text();
    assert.equal((shelf.match(/class="card"/g) || []).length, 3);
  });

  it("searches from the page", async () => {
    const env = open();
    await file(env, { shelf: "Water", text: "Water before nine.", blurb: "Watering hours" });
    await file(env, { shelf: "Pests", text: "Aphids on the beans.", blurb: "Aphids" });
    const html = await (await fetchWorker(env, "/?q=watering")).text();
    assert.match(html, /1 result for/);
    assert.match(html, /Watering hours/);
    assert.doesNotMatch(html, /Aphids/);
  });

  it("escapes card text, sends a strict content policy, redirects loose numbers and 404s missing ones", async () => {
    const env = open();
    await file(env, { shelf: "<b>Odd</b> shelf", text: "<script>alert(1)</script> is not run.", blurb: "<img src=x onerror=alert(1)>" });
    const res = await fetchWorker(env, "/card/N-000001");
    const html = await res.text();
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(res.headers.get("Content-Security-Policy"), /default-src 'none'/);
    const loose = await fetchWorker(env, "/card/n-1");
    assert.equal(loose.status, 303);
    assert.equal(loose.headers.get("Location"), "/card/N-000001");
    assert.equal((await fetchWorker(env, "/card/N-000099")).status, 404);
    assert.equal((await fetchWorker(env, "/shelf/nope")).status, 404);
    assert.equal((await fetchWorker(env, "/card/%E0%A4%A")).status, 404);
    assert.equal((await fetchWorker(env, "/elsewhere")).status, 404);
  });

  it("serves a favicon", async () => {
    const res = await fetchWorker(open(), "/favicon.svg");
    assert.equal(res.headers.get("Content-Type"), "image/svg+xml");
  });
});

describe("sample cards", () => {
  it("load cleanly over MCP and answer questions about the made-up garden club", async () => {
    const seed = JSON.parse(await readFile(new URL("../seed/sample-cards.json", import.meta.url), "utf8"));
    assert.ok(seed.cards.length >= 18 && seed.cards.length <= 25, `${seed.cards.length} sample cards`);
    const env = memEnv();
    for (const c of seed.cards) await file(env, c);

    const rats = await call(env, "ask", { question: "why no cooked food in the compost?" });
    assert.match(rats.data.cards[0].blurb, /rats/);

    // Walk the compost chat from its first card to its last.
    const start = (await call(env, "ask", { question: "compost bins full bin 3" })).data.cards[0].num;
    let num = start, steps = 0;
    while (num) {
      const r = await call(env, "read", { num });
      assert.equal(r.data.source, "compost-committee-chat");
      num = r.data.next;
      steps++;
    }
    assert.equal(steps, 4);

    const shelves = (await call(env, "browse")).data.shelves.map((s) => s.title).sort();
    assert.deepEqual(shelves, ["Compost", "Pests", "Plots and members", "Seed swap", "Spring planning", "Water rota"]);
  });
});
