// Filing, reading with prev/next, search ranking, bookmarks and browsing,
// run once against the memory store and once against the D1 SQL.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STORES, call, file } from "./helpers.js";

for (const S of STORES) {
  describe(`catalog on the ${S.name}`, { skip: S.skip }, () => {
    describe("file_card", () => {
      it("numbers cards in order and chains cards from the same source", async () => {
        const env = await S.make();
        const a = await file(env, { shelf: "Spring planning", source: "Meeting one", text: "The work day is the first Saturday after the frost." });
        const b = await file(env, { shelf: "Spring planning", source: "Meeting one", text: "Beds 3 and 7 need new boards." });
        const c = await file(env, { shelf: "Compost", text: "Bin 3 is the one to fill." });
        assert.equal(a.num, "N-000001");
        assert.equal(b.num, "N-000002");
        assert.equal(c.num, "N-000003");
        assert.equal(a.prev, null);
        assert.equal(b.prev, "N-000001");
        assert.equal(c.prev, null, "a different source is not chained");
        assert.equal(a.shelf, "spring-planning");
        assert.equal(a.source, "meeting-one");
        assert.equal(c.source, "compost", "source defaults to the shelf");
      });

      it("writes a blurb from the first sentence when none is given, and cleans tags", async () => {
        const env = await S.make();
        const r = await file(env, { shelf: "Compost", text: "Turning day is Sunday at ten. Bring a fork and gloves.", tags: ["#Compost", "compost", "Work Day", 42] });
        assert.equal(r.blurb, "Turning day is Sunday at ten.");
        assert.deepEqual(r.tags, ["compost", "work-day"]);
      });

      it("uses realm letters in card numbers and keeps one sequence across realms", async () => {
        const env = await S.make({ REALMS: "W:work,H:home" });
        const a = await file(env, { shelf: "Desk", text: "First card in work." });
        const b = await file(env, { shelf: "Garden", text: "First card in home.", realm: "home" });
        const c = await file(env, { shelf: "Desk", text: "Second card in work.", realm: "W" });
        assert.deepEqual([a.num, b.num, c.num], ["W-000001", "H-000002", "W-000003"]);
        const bad = await call(env, "file_card", { shelf: "Desk", text: "x", realm: "moon" });
        assert.equal(bad.isError, true);
        assert.match(bad.text, /Unknown realm "moon"/);
      });

      it("refuses empty text, a missing shelf, a bad link and passages that are too long", async () => {
        const env = await S.make();
        assert.match((await call(env, "file_card", { shelf: "A" })).text, /text is required/);
        assert.match((await call(env, "file_card", { text: "Hello there." })).text, /shelf is required/);
        assert.match((await call(env, "file_card", { shelf: "A", text: "Hello.", link: "javascript:alert(1)" })).text, /link must start/);
        const long = await call(env, "file_card", { shelf: "A", text: "word ".repeat(1000) });
        assert.equal(long.isError, true);
        assert.match(long.text, /several cards with the same source/);
        assert.match(long.text, /Nightly chop is part of Pro \(\$1\/month, not open yet\): see PRO\.md/);
        const empty = await call(env, "browse", {});
        assert.equal(empty.data.total_cards, 0, "nothing was filed by the refused calls");
      });

      it("refuses text that looks like a secret", async () => {
        const env = await S.make();
        const fakeKey = "gh" + "p_" + "A1b2C3d4".repeat(5);
        const fakeCard = ["4111", "1111", "1111", "1111"].join(" ");
        for (const text of [`token is ${fakeKey}`, `pay with ${fakeCard}`, "-----BEGIN " + "PRIVATE KEY-----\nabc"]) {
          const r = await call(env, "file_card", { shelf: "Oops", text });
          assert.equal(r.isError, true, text);
          assert.match(r.text, /secret/);
        }
        const ok = await call(env, "file_card", { shelf: "Fine", text: "Order 1234 5678 arrived on the 12th." });
        assert.equal(ok.isError, false);
      });
    });

    describe("read", () => {
      it("returns the passage with prev and next from the same source", async () => {
        const env = await S.make();
        await file(env, { shelf: "Chat", source: "Thread A", text: "A one." });
        await file(env, { shelf: "Chat", source: "Thread B", text: "B one." });
        await file(env, { shelf: "Chat", source: "Thread A", text: "A two.", tags: ["second"], link: "https://example.com/a" });
        await file(env, { shelf: "Chat", source: "Thread A", text: "A three." });

        const mid = await call(env, "read", { num: "N-000003" });
        assert.equal(mid.isError, false);
        assert.equal(mid.data.text, "A two.");
        assert.equal(mid.data.prev, "N-000001");
        assert.equal(mid.data.next, "N-000004");
        assert.deepEqual(mid.data.tags, ["second"]);
        assert.equal(mid.data.link, "https://example.com/a");
        assert.match(mid.text, /^N-000003 \| shelf: Chat \| source: thread-a \| prev: N-000001 \| next: N-000004/);

        const first = await call(env, "read", { num: "N-000001" });
        assert.equal(first.data.prev, null);
        assert.equal(first.data.next, "N-000003");
        const last = await call(env, "read", { num: "N-000004" });
        assert.equal(last.data.next, null);
        const lone = await call(env, "read", { num: "N-000002" });
        assert.deepEqual([lone.data.prev, lone.data.next], [null, null]);
      });

      it("accepts loose card numbers and says when the letter was wrong", async () => {
        const env = await S.make();
        await file(env, { shelf: "S", text: "One." });
        await file(env, { shelf: "S", text: "Two." });
        assert.equal((await call(env, "read", { num: "n-2" })).data.num, "N-000002");
        assert.equal((await call(env, "read", { num: "N 000002" })).data.num, "N-000002");
        const wrong = await call(env, "read", { num: "X-2" });
        assert.equal(wrong.data.num, "N-000002");
        assert.match(wrong.data.note, /No card X-000002/);
        const missing = await call(env, "read", { num: "N-99" });
        assert.equal(missing.isError, true);
        assert.match(missing.text, /No card/);
        const junk = await call(env, "read", { num: "hello" });
        assert.equal(junk.isError, true);
        assert.match(junk.text, /isn't a card number/);
      });
    });

    describe("ask", () => {
      async function garden(env) {
        await file(env, { shelf: "Compost", text: "We talked about many things, and the compost came up once near the end.", blurb: "Long meeting about the shed roof" });
        await file(env, { shelf: "Compost", text: "Bins 1 and 2 are full; add to bin 3.", blurb: "Compost bins 1 and 2 are full", tags: ["compost", "bins"] });
        await file(env, { shelf: "Water", text: "Water before nine or after six.", blurb: "Watering hours", tags: ["watering"] });
        await file(env, { shelf: "Water", text: "The rain tank tap leaks; a new washer is ordered.", blurb: "Rain tank tap leaks", tags: ["repairs"] });
        await file(env, { shelf: "Pests", text: "Aphids on the beans; spray with water first.", blurb: "Aphids on the broad beans", tags: ["pests"] });
      }

      it("puts a blurb or tag match above a passing mention", async () => {
        const env = await S.make();
        await garden(env);
        const r = await call(env, "ask", { question: "compost" });
        assert.equal(r.data.cards[0].num, "N-000002");
        assert.equal(r.data.cards[1].num, "N-000001");
        assert.equal(r.data.cards.length, 2);
        assert.equal(r.data.total_cards, 5);
        assert.equal(typeof r.data.took_ms, "number");
        assert.match(r.text, /^2 cards for "compost"/);
      });

      it("ranks cards matching every word above cards matching one, and ignores stop words", async () => {
        const env = await S.make();
        await garden(env);
        const r = await call(env, "ask", { question: "what is wrong with the rain tank tap?" });
        assert.equal(r.data.cards[0].num, "N-000004");
        const plural = await call(env, "ask", { question: "leaking taps" });
        assert.equal(plural.data.cards[0].num, "N-000004", "taps finds tap");
      });

      it("filters by shelf and realm, honours limit, and puts a quoted card number first", async () => {
        const env = await S.make({ REALMS: "N:notes,H:home" });
        await garden(env);
        await file(env, { shelf: "Water", realm: "home", text: "Home watering can is in the porch.", blurb: "Watering can lives in the porch" });
        assert.deepEqual((await call(env, "ask", { question: "watering", realm: "home" })).data.cards.map((c) => c.num), ["H-000006"]);
        assert.ok((await call(env, "ask", { question: "watering", shelf: "Water" })).data.cards.every((c) => c.shelf === "water"));
        assert.equal((await call(env, "ask", { question: "compost", shelf: "Pests" })).data.cards.length, 0);
        assert.equal((await call(env, "ask", { question: "water tank compost aphids", limit: 2 })).data.cards.length, 2);
        const byNum = await call(env, "ask", { question: "what did N-000005 say about compost?" });
        assert.equal(byNum.data.cards[0].num, "N-000005");
        assert.equal(byNum.data.cards[0].exact, true);
      });

      it("answers an unmatched question with no cards and a hint", async () => {
        const env = await S.make();
        await garden(env);
        const r = await call(env, "ask", { question: "submarine" });
        assert.equal(r.data.cards.length, 0);
        assert.match(r.text, /No cards match "submarine"/);
        assert.equal((await call(env, "ask", { question: "" })).isError, true);
      });
    });

    describe("bookmark", () => {
      it("adds, lists and removes, and refuses unknown cards", async () => {
        const env = await S.make();
        await file(env, { shelf: "S", text: "One thing.", blurb: "First" });
        await file(env, { shelf: "S", text: "Two things.", blurb: "Second" });
        const add = await call(env, "bookmark", { nums: ["N-000001", "n-2"], note: "for the newsletter", list: "Newsletter", by: "helper" });
        assert.deepEqual(add.data.added, ["N-000001", "N-000002"]);
        const list = await call(env, "bookmark", { action: "list", list: "newsletter" });
        assert.deepEqual(list.data.bookmarks.map((b) => [b.num, b.blurb, b.note]), [["N-000001", "First", "for the newsletter"], ["N-000002", "Second", "for the newsletter"]]);
        assert.deepEqual(list.data.lists, [{ list: "newsletter", count: 2 }]);
        const rm = await call(env, "bookmark", { action: "remove", nums: ["N-000001"], list: "newsletter" });
        assert.equal(rm.data.removed, 1);
        assert.deepEqual((await call(env, "bookmark", { action: "list", list: "newsletter" })).data.bookmarks.map((b) => b.num), ["N-000002"]);
        const bad = await call(env, "bookmark", { nums: ["N-000002", "N-000050"], note: "x" });
        assert.equal(bad.isError, true);
        assert.match(bad.text, /No such card: N-000050/);
        assert.equal((await call(env, "bookmark", { action: "list" })).data.bookmarks.length, 0, "nothing saved when one number is wrong");
      });
    });

    describe("browse", () => {
      it("lists shelves with counts, then the cards on one shelf, with paging", async () => {
        const env = await S.make();
        assert.match((await call(env, "browse")).text, /catalog is empty/);
        for (let i = 1; i <= 5; i++) await file(env, { shelf: "Big shelf", text: `Card number ${i} here.` });
        await file(env, { shelf: "Small shelf", text: "Only card." });
        await call(env, "bookmark", { nums: ["N-000001"], note: "x" });
        const all = await call(env, "browse");
        assert.equal(all.data.total_cards, 6);
        assert.deepEqual(all.data.shelves.map((s) => [s.id, s.title, s.count, s.latest_num]), [["small-shelf", "Small shelf", 1, "N-000006"], ["big-shelf", "Big shelf", 5, "N-000005"]]);
        assert.deepEqual(all.data.bookmark_lists, [{ list: "default", count: 1 }]);
        const page1 = await call(env, "browse", { shelf: "Big shelf", limit: 2 });
        assert.deepEqual(page1.data.cards.map((c) => c.num), ["N-000001", "N-000002"]);
        assert.equal(page1.data.next_after, "N-000002");
        const page3 = await call(env, "browse", { shelf: "big-shelf", limit: 2, after: "N-000004" });
        assert.deepEqual(page3.data.cards.map((c) => c.num), ["N-000005"]);
        assert.equal(page3.data.next_after, null);
        assert.equal((await call(env, "browse", { shelf: "Nope" })).isError, true);
      });
    });
  });
}
