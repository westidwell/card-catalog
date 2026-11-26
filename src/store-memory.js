// An in-memory store with the same shape as the D1 store. Used by local dev and the tests.
// Everything is gone when the process stops.

const copy = (c) => (c ? { ...c, tags: [...(c.tags || [])] } : null);

export class MemoryStore {
  constructor() {
    this.name = "memory";
    this.seq = 0;
    this.cards = new Map();     // num -> card
    this.shelves = new Map();   // id -> { id, title, created_at }
    this.marks = new Map();     // "list\u0000num" -> bookmark
  }

  async init() {}

  async nextSeq() {
    this.seq += 1;
    return this.seq;
  }

  async fileCard(card, shelf) {
    if (!this.shelves.has(shelf.id)) this.shelves.set(shelf.id, { ...shelf });
    this.cards.set(card.num, copy(card));
  }

  withShelf(c) {
    return c ? { ...copy(c), shelf_title: this.shelves.get(c.shelf)?.title || c.shelf } : null;
  }

  all() {
    return [...this.cards.values()].sort((a, b) => a.seq - b.seq);
  }

  async getCard(num) {
    return this.withShelf(this.cards.get(num));
  }

  async getCardBySeq(seq) {
    return this.withShelf(this.all().find((c) => c.seq === seq));
  }

  async neighbors(source, seq) {
    const same = this.all().filter((c) => c.source === source);
    const before = same.filter((c) => c.seq < seq);
    const after = same.filter((c) => c.seq > seq);
    return { prev: before.length ? before[before.length - 1].num : null, next: after.length ? after[0].num : null };
  }

  async countCards() {
    return this.cards.size;
  }

  async candidates(terms, { realm, shelf, limit }) {
    const hit = [];
    for (const c of this.all().reverse()) {
      if (realm && c.realm !== realm) continue;
      if (shelf && c.shelf !== shelf) continue;
      const title = this.shelves.get(c.shelf)?.title || "";
      const hay = [c.blurb, JSON.stringify(c.tags), c.text, c.source, title].join("\n").toLowerCase();
      if (terms.some((t) => hay.includes(t))) hit.push(this.withShelf(c));
      if (hit.length >= limit) break;
    }
    return hit;
  }

  async getShelf(id) {
    const s = this.shelves.get(id);
    return s ? { ...s } : null;
  }

  async listShelves() {
    const rows = [];
    for (const s of this.shelves.values()) {
      const cards = this.all().filter((c) => c.shelf === s.id);
      const last = cards[cards.length - 1];
      rows.push({ id: s.id, title: s.title, count: cards.length, latest_num: last?.num || null, latest_at: last?.filed_at || null, latest_seq: last?.seq || 0 });
    }
    return rows.sort((a, b) => b.latest_seq - a.latest_seq).map(({ latest_seq, ...r }) => r);
  }

  async shelfCards(id, { after = 0, limit = 50 } = {}) {
    return this.all().filter((c) => c.shelf === id && c.seq > after).slice(0, limit).map((c) => this.withShelf(c));
  }

  async recentCards(limit = 10) {
    return this.all().reverse().slice(0, limit).map((c) => this.withShelf(c));
  }

  async addBookmark(m) {
    this.marks.set(m.list + "\u0000" + m.num, { ...m });
  }

  async removeBookmark(list, num) {
    return this.marks.delete(list + "\u0000" + num) ? 1 : 0;
  }

  async listBookmarks(list) {
    return [...this.marks.values()]
      .filter((m) => m.list === list)
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .map((m) => ({ ...m, blurb: this.cards.get(m.num)?.blurb || "" }));
  }

  async bookmarkLists() {
    const counts = new Map();
    for (const m of this.marks.values()) counts.set(m.list, (counts.get(m.list) || 0) + 1);
    return [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([list, count]) => ({ list, count }));
  }
}
