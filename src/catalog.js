// The catalog itself: file a card, ask, read, bookmark, browse.
// Store-agnostic: works the same on the memory store (dev, tests) and D1 (Cloudflare).

import { LIMITS } from "./config.js";
import { rank, queryTerms } from "./search.js";
import { proMessage } from "./pro.js";

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
}

const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function formatNum(letter, seq) {
  return `${letter}-${String(seq).padStart(6, "0")}`;
}

// "n-12", "N 000012", "N-000012" all mean N-000012.
export function parseNum(input) {
  const m = String(input || "").trim().match(/^([A-Za-z])\s*-?\s*0*(\d{1,9})$/);
  if (!m) return null;
  const seq = Number(m[2]);
  if (!seq) return null;
  return { letter: m[1].toUpperCase(), seq, num: formatNum(m[1].toUpperCase(), seq) };
}

export function findRealm(config, value) {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value).trim().toLowerCase();
  const r = config.realms.find((x) => x.letter.toLowerCase() === v || x.name === v);
  if (!r) throw new CatalogError(`Unknown realm "${value}". Realms here: ${config.realms.map((x) => `${x.letter} (${x.name})`).join(", ")}.`);
  return r;
}

function cleanTags(tags) {
  if (tags === undefined || tags === null) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(",");
  const out = [];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const tag = t.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9 _-]+/g, "").replace(/\s+/g, "-").replace(/^-|-$/g, "").slice(0, LIMITS.tag);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, LIMITS.tags);
}

function firstSentence(text) {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  const s = m ? m[1] : t;
  return s.length > 120 ? s.slice(0, 117).replace(/\s+\S*$/, "") + "..." : s;
}

// Cards go to every agent you connect, so the catalog refuses text that looks like a secret.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
];
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
export function looksSecret(text) {
  if (SECRET_PATTERNS.some((re) => re.test(text))) return true;
  // Payment-card-shaped numbers: 13 to 19 digits (spaces or dashes allowed) that pass the Luhn check.
  for (const m of text.matchAll(/\b\d(?:[ -]?\d){12,18}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

export async function fileCard(store, config, args = {}) {
  const raw = typeof args.text === "string" ? args.text.trim() : "";
  if (!raw) throw new CatalogError("text is required: the passage this card holds.");
  if (raw.length > LIMITS.text) {
    throw new CatalogError(
      `That passage is ${raw.length} characters; a card holds up to ${LIMITS.text}. File it as several cards with the same source, in order, so read() can walk prev/next. ` +
        `(Cutting long chats into cards automatically: ${proMessage("Nightly chop")}.)`
    );
  }
  if (looksSecret(raw)) throw new CatalogError("That text looks like it holds a key, token or card number. Cards are shared with every connected agent, so leave secrets out.");

  const shelfTitle = clean(args.shelf, LIMITS.shelf);
  const shelfId = slug(shelfTitle);
  if (!shelfId) throw new CatalogError("shelf is required: the back room this card lives in, e.g. 'Spring planning'.");
  const sourceRaw = clean(args.source, LIMITS.source);
  const source = sourceRaw ? slug(sourceRaw) || shelfId : shelfId;
  const realm = findRealm(config, args.realm) || config.realms[0];
  const blurb = clean(args.blurb, LIMITS.blurb) || firstSentence(raw);
  const tags = cleanTags(args.tags);
  let link = clean(args.link, LIMITS.link);
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) throw new CatalogError("link must start with http:// or https://");
  const filedBy = clean(args.filed_by, LIMITS.filedBy);

  await store.init();
  const seq = await store.nextSeq();
  const now = new Date().toISOString();
  const card = {
    num: formatNum(realm.letter, seq),
    seq,
    realm: realm.letter,
    shelf: shelfId,
    source,
    blurb,
    tags,
    text: raw,
    link: link || null,
    filed_by: filedBy || null,
    filed_at: now,
  };
  await store.fileCard(card, { id: shelfId, title: shelfTitle, created_at: now });
  const { prev } = await store.neighbors(source, seq);
  return { num: card.num, shelf: shelfId, shelf_title: shelfTitle, source, blurb, tags, prev };
}

export async function readCard(store, config, numInput) {
  const p = parseNum(numInput);
  if (!p) throw new CatalogError(`"${numInput}" isn't a card number. Card numbers look like ${formatNum(config.realms[0].letter, 12)}.`);
  await store.init();
  let card = await store.getCard(p.num);
  let note = null;
  if (!card) {
    card = await store.getCardBySeq(p.seq);
    if (card) note = `No card ${p.num}; the card with that number is ${card.num}.`;
  }
  if (!card) return null;
  const { prev, next } = await store.neighbors(card.source, card.seq);
  return { ...card, prev, next, note };
}

export async function ask(store, config, args = {}) {
  const t0 = Date.now();
  const question = clean(args.question, 500);
  if (!question) throw new CatalogError("question is required.");
  const limit = Math.min(Math.max(parseInt(args.limit, 10) || LIMITS.askDefault, 1), LIMITS.askMax);
  const realm = findRealm(config, args.realm);
  const shelf = args.shelf ? slug(args.shelf) : "";
  await store.init();

  // A card number in the question goes straight to the top.
  const exact = [];
  for (const m of question.matchAll(/\b([A-Za-z])-0*(\d{1,9})\b/g)) {
    const c = await store.getCard(formatNum(m[1].toUpperCase(), Number(m[2])));
    if (c && !exact.some((x) => x.num === c.num)) exact.push(c);
  }

  const terms = queryTerms(question);
  const [total, cands] = await Promise.all([
    store.countCards(),
    terms.length ? store.candidates(terms, { realm: realm?.letter, shelf, limit: LIMITS.candidates }) : [],
  ]);
  const ranked = rank(cands, question, { total, limit });
  const cards = [
    ...exact.map((c) => ({ card: c, score: null, snippet: c.text.replace(/\s+/g, " ").slice(0, 160), exact: true })),
    ...ranked.filter((r) => !exact.some((e) => e.num === r.card.num)),
  ].slice(0, limit);

  return {
    question,
    total_cards: total,
    took_ms: Date.now() - t0,
    cards: cards.map((r) => ({
      num: r.card.num,
      blurb: r.card.blurb,
      shelf: r.card.shelf,
      shelf_title: r.card.shelf_title,
      tags: r.card.tags,
      score: r.score,
      snippet: r.snippet,
      ...(r.exact ? { exact: true } : {}),
    })),
  };
}

export async function bookmark(store, config, args = {}) {
  const action = (args.action || "add").toLowerCase();
  const list = slug(args.list || "default") || "default";
  await store.init();
  if (action === "list") return { action, list, bookmarks: await store.listBookmarks(list), lists: await store.bookmarkLists() };

  const raw = Array.isArray(args.nums) ? args.nums : args.num ? [args.num] : [];
  if (!raw.length) throw new CatalogError("nums is required: the card numbers to bookmark.");
  if (raw.length > 20) throw new CatalogError("Up to 20 cards at a time.");
  const nums = [];
  for (const n of raw) {
    const p = parseNum(n);
    if (!p) throw new CatalogError(`"${n}" isn't a card number.`);
    nums.push(p.num);
  }

  if (action === "remove") {
    let removed = 0;
    for (const num of nums) removed += await store.removeBookmark(list, num);
    return { action, list, removed };
  }
  if (action !== "add") throw new CatalogError(`action must be add, list or remove.`);

  const missing = [];
  for (const num of nums) if (!(await store.getCard(num))) missing.push(num);
  if (missing.length) throw new CatalogError(`No such card: ${missing.join(", ")}. Nothing was bookmarked.`);
  const note = clean(args.note, LIMITS.note);
  const by = clean(args.by, LIMITS.filedBy);
  const at = new Date().toISOString();
  for (const num of nums) await store.addBookmark({ list, num, note, by, at });
  return { action, list, added: nums };
}

export async function browse(store, config, args = {}) {
  await store.init();
  if (args.shelf) {
    const id = slug(args.shelf);
    const shelf = await store.getShelf(id);
    if (!shelf) return { shelf: null, cards: [], message: `No shelf "${args.shelf}".` };
    const limit = Math.min(Math.max(parseInt(args.limit, 10) || 50, 1), 200);
    const after = args.after ? parseNum(args.after)?.seq || 0 : 0;
    const cards = await store.shelfCards(id, { after, limit: limit + 1 });
    const more = cards.length > limit;
    const page = cards.slice(0, limit);
    return {
      shelf: { id: shelf.id, title: shelf.title },
      cards: page.map((c) => ({ num: c.num, blurb: c.blurb, tags: c.tags, source: c.source, filed_at: c.filed_at })),
      next_after: more ? page[page.length - 1].num : null,
    };
  }
  const [shelves, lists, total] = await Promise.all([store.listShelves(), store.bookmarkLists(), store.countCards()]);
  return { total_cards: total, realms: config.realms, shelves, bookmark_lists: lists };
}
