// Cloudflare D1 store. The tables are created on first use, so there is no migration step.
// Card numbers come from a counter row, not MAX(seq), so a number is never handed out twice.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`,
  `INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0)`,
  `CREATE TABLE IF NOT EXISTS shelves (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS cards (
     num TEXT PRIMARY KEY,
     seq INTEGER NOT NULL UNIQUE,
     realm TEXT NOT NULL,
     shelf TEXT NOT NULL,
     source TEXT NOT NULL,
     blurb TEXT NOT NULL,
     tags TEXT NOT NULL DEFAULT '[]',
     text TEXT NOT NULL,
     link TEXT,
     filed_by TEXT,
     filed_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS cards_source ON cards (source, seq)`,
  `CREATE INDEX IF NOT EXISTS cards_shelf ON cards (shelf, seq)`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
     list TEXT NOT NULL,
     num TEXT NOT NULL,
     note TEXT,
     by TEXT,
     at TEXT NOT NULL,
     PRIMARY KEY (list, num)
   )`,
];

const CARD_COLS = `c.num, c.seq, c.realm, c.shelf, c.source, c.blurb, c.tags, c.text, c.link, c.filed_by, c.filed_at, s.title AS shelf_title`;
const FROM = `FROM cards c LEFT JOIN shelves s ON s.id = c.shelf`;

function row(r) {
  if (!r) return null;
  let tags = [];
  try { tags = JSON.parse(r.tags || "[]"); } catch { tags = []; }
  return { ...r, tags, shelf_title: r.shelf_title || r.shelf };
}

export class D1Store {
  constructor(db) {
    this.name = "d1";
    this.db = db;
    this.ready = null;
  }

  init() {
    if (!this.ready) {
      this.ready = this.db.batch(SCHEMA.map((sql) => this.db.prepare(sql))).catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  async nextSeq() {
    const v = await this.db.prepare(`UPDATE meta SET v = v + 1 WHERE k = 'seq' RETURNING v`).first("v");
    return Number(v);
  }

  async fileCard(c, shelf) {
    await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO shelves (id, title, created_at) VALUES (?, ?, ?)`).bind(shelf.id, shelf.title, shelf.created_at),
      this.db
        .prepare(`INSERT INTO cards (num, seq, realm, shelf, source, blurb, tags, text, link, filed_by, filed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(c.num, c.seq, c.realm, c.shelf, c.source, c.blurb, JSON.stringify(c.tags || []), c.text, c.link || null, c.filed_by || null, c.filed_at),
    ]);
  }

  async getCard(num) {
    return row(await this.db.prepare(`SELECT ${CARD_COLS} ${FROM} WHERE c.num = ?`).bind(num).first());
  }

  async getCardBySeq(seq) {
    return row(await this.db.prepare(`SELECT ${CARD_COLS} ${FROM} WHERE c.seq = ?`).bind(seq).first());
  }

  async neighbors(source, seq) {
    const [p, n] = await this.db.batch([
      this.db.prepare(`SELECT num FROM cards WHERE source = ? AND seq < ? ORDER BY seq DESC LIMIT 1`).bind(source, seq),
      this.db.prepare(`SELECT num FROM cards WHERE source = ? AND seq > ? ORDER BY seq ASC LIMIT 1`).bind(source, seq),
    ]);
    return { prev: p.results[0]?.num || null, next: n.results[0]?.num || null };
  }

  async countCards() {
    return Number((await this.db.prepare(`SELECT COUNT(*) AS n FROM cards`).first("n")) || 0);
  }

  // Every card that mentions any of the words somewhere. Ranking happens in search.js,
  // the same code the memory store uses, so both stores answer the same way.
  async candidates(terms, { realm, shelf, limit }) {
    const where = [];
    const args = [];
    const ors = [];
    for (const t of terms) {
      const like = "%" + t.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
      ors.push(`(c.blurb LIKE ? ESCAPE '\\' OR c.tags LIKE ? ESCAPE '\\' OR c.text LIKE ? ESCAPE '\\' OR c.source LIKE ? ESCAPE '\\' OR s.title LIKE ? ESCAPE '\\')`);
      args.push(like, like, like, like, like);
    }
    where.push("(" + ors.join(" OR ") + ")");
    if (realm) { where.push("c.realm = ?"); args.push(realm); }
    if (shelf) { where.push("c.shelf = ?"); args.push(shelf); }
    args.push(limit);
    const { results } = await this.db.prepare(`SELECT ${CARD_COLS} ${FROM} WHERE ${where.join(" AND ")} ORDER BY c.seq DESC LIMIT ?`).bind(...args).all();
    return results.map(row);
  }

  async getShelf(id) {
    return (await this.db.prepare(`SELECT id, title, created_at FROM shelves WHERE id = ?`).bind(id).first()) || null;
  }

  async listShelves() {
    const { results } = await this.db
      .prepare(
        `SELECT s.id, s.title, COUNT(c.num) AS count, MAX(c.filed_at) AS latest_at,
                (SELECT num FROM cards WHERE shelf = s.id ORDER BY seq DESC LIMIT 1) AS latest_num,
                COALESCE(MAX(c.seq), 0) AS latest_seq
         FROM shelves s LEFT JOIN cards c ON c.shelf = s.id
         GROUP BY s.id ORDER BY latest_seq DESC`
      )
      .all();
    return results.map(({ latest_seq, ...r }) => ({ ...r, count: Number(r.count) }));
  }

  async shelfCards(id, { after = 0, limit = 50 } = {}) {
    const { results } = await this.db.prepare(`SELECT ${CARD_COLS} ${FROM} WHERE c.shelf = ? AND c.seq > ? ORDER BY c.seq ASC LIMIT ?`).bind(id, after, limit).all();
    return results.map(row);
  }

  async recentCards(limit = 10) {
    const { results } = await this.db.prepare(`SELECT ${CARD_COLS} ${FROM} ORDER BY c.seq DESC LIMIT ?`).bind(limit).all();
    return results.map(row);
  }

  async addBookmark(m) {
    await this.db
      .prepare(`INSERT INTO bookmarks (list, num, note, by, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (list, num) DO UPDATE SET note = excluded.note, by = excluded.by, at = excluded.at`)
      .bind(m.list, m.num, m.note || null, m.by || null, m.at)
      .run();
  }

  async removeBookmark(list, num) {
    const r = await this.db.prepare(`DELETE FROM bookmarks WHERE list = ? AND num = ?`).bind(list, num).run();
    return Number(r.meta?.changes || 0);
  }

  async listBookmarks(list) {
    const { results } = await this.db
      .prepare(`SELECT b.list, b.num, b.note, b.by, b.at, COALESCE(c.blurb, '') AS blurb FROM bookmarks b LEFT JOIN cards c ON c.num = b.num WHERE b.list = ? ORDER BY b.at, b.rowid`)
      .bind(list)
      .all();
    return results;
  }

  async bookmarkLists() {
    const { results } = await this.db.prepare(`SELECT list, COUNT(*) AS count FROM bookmarks GROUP BY list ORDER BY list`).all();
    return results.map((r) => ({ list: r.list, count: Number(r.count) }));
  }
}
