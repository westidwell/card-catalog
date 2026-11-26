// Pro features are visible but locked: stubs in src/pro.js, a locked list on the web page,
// and a clear message (never "unknown tool") if an agent calls one by name.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { memEnv, call, rpc, fetchWorker, file } from "./helpers.js";
import { PRO_URL, PRO_PRICE } from "../src/config.js";
import * as pro from "../src/pro.js";

const STUBS = {
  "Team sign-in": pro.teamSignIn,
  "Many libraries": pro.manyLibraries,
  "Nightly chop": pro.nightlyChop,
  "Agent work queue": pro.workQueue,
  "Usage reports": pro.usageReports,
  "Snowflake-native version": pro.snowflakeNative,
};

describe("Pro stubs", () => {
  it("keeps the Pro link and price in one place", () => {
    assert.equal(PRO_URL, "https://github.com/westidwell/card-catalog/blob/main/PRO.md");
    assert.equal(PRO_PRICE, "$1/month");
  });

  it("has one stub per Pro feature, each throwing the Pro message", () => {
    assert.deepEqual(Object.keys(STUBS), pro.PRO_FEATURES.map((f) => f.name));
    for (const [name, fn] of Object.entries(STUBS)) {
      assert.equal(typeof fn, "function", name);
      assert.throws(fn, (e) => {
        assert.ok(e instanceof pro.ProFeatureError);
        assert.equal(e.message, `${name} is part of Pro ($1/month, not open yet): see PRO.md`);
        assert.equal(e.url, PRO_URL);
        return true;
      });
    }
  });

  it("matches PRO.md: the top line, and every feature listed", async () => {
    const md = await readFile(new URL("../PRO.md", import.meta.url), "utf8");
    assert.equal(md.split("\n")[0], "Pro is $1/month (launch price). It isn't open yet: star or watch this repo to hear when it opens.");
    for (const f of pro.PRO_FEATURES) assert.ok(md.includes(`**${f.name}**`), f.name);
  });

  it("answers a call to a Pro tool name with the Pro message", async () => {
    const env = memEnv();
    const chop = await call(env, "chop", { text: "a long chat" });
    assert.equal(chop.isError, true);
    assert.equal(chop.text, "Nightly chop is part of Pro ($1/month, not open yet): see PRO.md");
    for (const name of ["wake_up", "take_job", "report_job", "clock_out"]) {
      assert.match((await call(env, name)).text, /^Agent work queue is part of Pro/);
    }
    assert.match((await call(env, "usage_report")).text, /^Usage reports is part of Pro/);
    assert.match((await call(env, "switch_library")).text, /^Many libraries is part of Pro/);
  });

  it("does not list Pro tools in tools/list", async () => {
    const { body } = await rpc(memEnv(), "tools/list");
    const names = body.result.tools.map((t) => t.name);
    for (const f of pro.PRO_FEATURES) for (const t of f.tools) assert.ok(!names.includes(t), t);
  });

  it("shows every Pro feature on the web page, locked, with the message and a link to PRO.md", async () => {
    const env = memEnv({ PUBLIC_PAGE: "true" });
    await file(env, { shelf: "S", text: "A card." });
    const html = await (await fetchWorker(env, "/")).text();
    for (const f of pro.PRO_FEATURES) {
      assert.ok(html.includes(`<span>${f.name}</span>`), f.name);
      assert.ok(html.includes(`${f.name} is part of Pro ($1/month, not open yet): see <a href="${PRO_URL}">PRO.md</a>`), f.name);
    }
    assert.equal((html.match(/class="lock"/g) || []).length, pro.PRO_FEATURES.length);
  });
});
