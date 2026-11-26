// Settings for the card catalog. Everything a user changes lives in wrangler.toml [vars] or a Worker secret;
// this file only holds defaults and limits.

export const VERSION = "0.1.0";

// The one place the Pro link and price live.
export const PRO_URL = "https://github.com/westidwell/card-catalog/blob/main/PRO.md";
export const PRO_PRICE = "$1/month";

export const LIMITS = {
  text: 4000,        // a card is a short passage, not a whole document
  blurb: 160,
  shelf: 80,
  source: 120,
  tags: 12,
  tag: 40,
  link: 500,
  filedBy: 60,
  note: 300,
  list: 60,
  askMax: 20,
  askDefault: 8,
  candidates: 250,   // most cards scored per question (keeps CPU time low on the free plan)
  body: 64 * 1024,   // largest request body accepted
  minToken: 16,
};

// REALMS = "N:notes" (default) or e.g. "W:work,H:home,S:system".
// The letter starts every card number in that realm: W-000042. The first realm is the default.
export function parseRealms(raw) {
  const out = [];
  for (const part of String(raw || "").split(",")) {
    const m = part.trim().match(/^([A-Za-z])\s*:\s*([A-Za-z0-9 _-]{1,30})$/);
    if (!m) continue;
    const letter = m[1].toUpperCase();
    if (out.some((r) => r.letter === letter)) continue;
    out.push({ letter, name: m[2].trim().toLowerCase() });
  }
  return out.length ? out : [{ letter: "N", name: "notes" }];
}

export function readConfig(env = {}) {
  return {
    realms: parseRealms(env.REALMS),
    title: String(env.CATALOG_TITLE || "Card catalog").slice(0, 60),
    publicPage: String(env.PUBLIC_PAGE || "").toLowerCase() === "true",
  };
}
