// A small stand-in for Cloudflare D1, built on Node's own SQLite (node:sqlite, Node 22.13+).
// It lets local dev keep cards in a file and lets the tests run the real D1 SQL offline.
// Only the parts of the D1 API this project uses: prepare/bind/first/all/run and batch.

export async function sqliteAvailable() {
  try {
    await import("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

export async function openSqliteD1(path = ":memory:") {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);

  const plain = (r) => (r ? { ...r } : null);

  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      for (const a of args) {
        if (a === undefined) throw new Error("D1_TYPE_ERROR: undefined is not a supported bind value");
      }
      return new Statement(this.sql, args);
    }
    async first(column) {
      const r = plain(db.prepare(this.sql).get(...this.args));
      if (!r) return null;
      return column ? (column in r ? r[column] : null) : r;
    }
    async all() {
      return { success: true, results: db.prepare(this.sql).all(...this.args).map(plain), meta: {} };
    }
    async run() {
      const info = db.prepare(this.sql).run(...this.args);
      return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    }
  }

  return {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.all());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
