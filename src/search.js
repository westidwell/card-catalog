// Ranking. Plain words in, best cards out. No embeddings, no model calls, nothing to pay for.
//
// Each query word is weighted by how rare it is in the catalog (rare words count more),
// then scored by where it appears on the card: the blurb and tags count most, then the
// shelf name and source, then the passage text (with diminishing returns for repeats and
// a nudge for short passages). Cards that match every word beat cards that match some.

const STOP = new Set(
  ("a an and are as at be but by can did do does for from had has have how i if in is it its " +
    "me my of on or our so than that the their them then there these they this to us was we " +
    "were what when where which who why will with you your about any into just only over")
    .split(" ")
);

export function words(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

// A light touch: "beds" finds "bed", "berries" finds "berry". Nothing cleverer.
export function stem(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function queryTerms(question) {
  const all = words(question);
  let picked = all.filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
  if (!picked.length) picked = all;
  return [...new Set(picked.map(stem))].slice(0, 8);
}

const stems = (text) => words(text).map(stem);

// Whole words whose stem is `term`: "tap" matches tap and taps; "berry" matches berry and berries.
function termPattern(term) {
  const alts = [term, term + "s"];
  if (term.endsWith("y") && term.length > 2) alts.push(term.slice(0, -1) + "ies");
  return new RegExp(`(?<![a-z0-9])(?:${alts.join("|")})(?![a-z0-9])`, "g");
}

// cards: [{ num, seq, blurb, tags[], text, shelf, shelf_title, source }]
// total: how many cards the whole catalog holds (for rarity weighting)
// The passage text is scanned with one native regex per word instead of being split into tokens,
// which keeps a question inside the Workers free plan's CPU budget even with hundreds of long cards.
export function rank(cards, question, { total = cards.length, limit = 8 } = {}) {
  const terms = queryTerms(question);
  if (!terms.length || !cards.length) return [];
  const patterns = terms.map(termPattern);

  const docs = cards.map((c) => {
    const low = String(c.text || "").toLowerCase();
    return {
      c,
      low,
      blurb: stems(c.blurb),
      tags: (c.tags || []).flatMap((t) => stems(t)),
      shelf: stems(c.shelf_title || c.shelf),
      source: stems(c.source),
      tf: patterns.map((re) => (low.match(re) || []).length),
      len: low.length || 1,
    };
  });

  const N = Math.max(total, docs.length);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length || 1;
  const idf = terms.map((t, i) => {
    const df = docs.filter((d) => d.tf[i] || d.blurb.includes(t) || d.tags.includes(t) || d.shelf.includes(t) || d.source.includes(t)).length;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });

  // The question's own words, in order, for the exact-phrase nudge.
  const phraseWords = words(question).filter((w) => terms.includes(stem(w)));
  const phrase = terms.length > 1 && phraseWords.length > 1 ? " " + phraseWords.join(" ") + " " : "";
  const k1 = 1.2, b = 0.75;
  const out = [];
  for (const d of docs) {
    let score = 0, matched = 0;
    terms.forEach((t, i) => {
      let hit = 0;
      if (d.blurb.includes(t)) hit += 3;
      if (d.tags.includes(t)) hit += 3;
      if (d.shelf.includes(t)) hit += 1.5;
      if (d.source.includes(t)) hit += 1;
      const tf = d.tf[i];
      if (tf) hit += (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.len) / avgLen));
      if (hit) {
        matched++;
        score += idf[i] * hit;
      }
    });
    if (!matched) continue;
    score *= (matched / terms.length) ** 2;
    if (phrase && matched === terms.length) {
      const flat = " " + (String(d.c.blurb || "").toLowerCase() + " " + d.low).replace(/[^a-z0-9]+/g, " ") + " ";
      if (flat.includes(phrase)) score *= 1.25;
    }
    out.push({ card: d.c, score: Math.round(score * 100) / 100, matched });
  }
  out.sort((x, y) => y.score - x.score || y.card.seq - x.card.seq);
  return out.slice(0, limit).map((r) => ({ ...r, snippet: snippet(r.card.text, terms) }));
}

export function snippet(text, terms, width = 160) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = low.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, at - 40);
  const cut = t.slice(start, start + width);
  return (start > 0 ? "..." : "") + cut + (start + width < t.length ? "..." : "");
}
