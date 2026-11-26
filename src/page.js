// The small read-only web page: shelves, cards, a search box, and the Pro features shown locked.
// No scripts, no outside fonts or images, nothing loaded from anywhere else.

import { PRO_URL, VERSION } from "./config.js";
import { PRO_FEATURES, proMessage } from "./pro.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="7" width="26" height="20" rx="3" fill="#8a5a2b"/><rect x="6" y="4" width="20" height="14" rx="2" fill="#fbf6ea" stroke="#8a5a2b" stroke-width="1.5"/><path d="M9 9h14M9 13h10" stroke="#8a5a2b" stroke-width="1.5"/><rect x="12" y="19" width="8" height="4" rx="2" fill="#fbf6ea"/></svg>`;

const LOCK = `<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;

const CSS = `
:root{--bg:#f4efe4;--paper:#fffdf7;--ink:#2b2620;--muted:#6f655a;--line:#e2d8c6;--rule:#d9534f22;--accent:#8a5a2b;--accent-ink:#fff;--chip:#efe6d3;--focus:#b5762f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1916;--paper:#24211d;--ink:#ece6da;--muted:#a69c8e;--line:#3a352e;--rule:#d9534f33;--accent:#d9a066;--accent-ink:#1b1916;--chip:#302b25;--focus:#d9a066}}
:root[data-theme="dark"]{--bg:#1b1916;--paper:#24211d;--ink:#ece6da;--muted:#a69c8e;--line:#3a352e;--rule:#d9534f33;--accent:#d9a066;--accent-ink:#1b1916;--chip:#302b25;--focus:#d9a066}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.wrap{max-width:1040px;margin:0 auto;padding:24px 16px 48px}
header.top{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;margin-bottom:24px}
header.top h1{font-size:1.4rem;margin:0;flex:1 1 auto}
header.top h1 a{color:var(--ink)}
.plain{display:inline-block}
.count{color:var(--muted);font-size:.9rem}
form.search{display:flex;gap:8px;flex:1 1 320px;max-width:480px}
input[type=search],input[type=password]{flex:1;min-width:0;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font:inherit}
button{padding:9px 14px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:600;cursor:pointer}
.grid{display:grid;grid-template-columns:1fr;gap:24px}
@media (min-width:860px){.grid{grid-template-columns:minmax(0,1fr) 300px}}
h2{font-size:1rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 12px}
.drawers{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:28px}
.drawer{display:block;padding:14px 14px 12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;color:var(--ink)}
.drawer .plain{width:100%}
.drawer:hover{border-color:var(--accent)}
.drawer .pull{display:block;width:40px;height:8px;border-radius:4px;background:var(--line);margin:0 auto 10px}
.drawer b{display:block;overflow-wrap:anywhere}
.drawer .sub{color:var(--muted);font-size:.85rem}
.cards{display:flex;flex-direction:column;gap:10px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px 12px 18px;background-image:linear-gradient(90deg,transparent 8px,var(--rule) 8px,var(--rule) 9px,transparent 9px)}
.card .num{font:600 .85rem ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--accent)}
.card .meta{color:var(--muted);font-size:.85rem}
.card p{margin:4px 0 0;overflow-wrap:anywhere}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.tag{background:var(--chip);border-radius:999px;padding:1px 9px;font-size:.8rem;color:var(--muted)}
.passage{white-space:pre-wrap;overflow-wrap:anywhere;font-size:1rem;margin:14px 0 0}
.walk{display:flex;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px}
.panel p{margin:0 0 10px;color:var(--muted);font-size:.9rem}
details.locked{border-top:1px solid var(--line);padding:8px 0}
details.locked summary{cursor:pointer;display:flex;align-items:center;gap:8px;list-style:none;font-weight:600}
details.locked summary::-webkit-details-marker{display:none}
details.locked summary .badge{margin-left:auto;font-size:.75rem;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 8px}
details.locked .msg{margin:8px 0 2px 24px;font-size:.9rem}
details.locked .sum{margin:0 0 4px 24px;color:var(--muted);font-size:.85rem}
.lock{width:16px;height:16px;color:var(--muted);flex:none}
.empty{color:var(--muted)}
.note{background:var(--chip);border-radius:8px;padding:10px 12px;font-size:.9rem}
.err{color:#b3261e}
footer{margin-top:40px;color:var(--muted);font-size:.85rem}
.narrow{max-width:420px;margin:12vh auto 0}
.narrow form{display:flex;gap:8px;margin-top:12px}
`;

export function layout(config, title, body, { count = null, q = "", search = true } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>${CSS}</style></head>
<body><div class="wrap">
<header class="top"><h1><a href="/"><span class="plain">${esc(config.title)}</span></a></h1>${count === null ? "" : `<span class="count">${count} card${count === 1 ? "" : "s"}</span>`}
${search ? `<form class="search" action="/" method="get" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="Ask the catalog" aria-label="Search cards"><button type="submit">Ask</button></form>` : ""}
</header>
${body}
<footer>card-catalog ${esc(VERSION)} · read-only view · agents connect at <code>/mcp</code></footer>
</div></body></html>`;
}

function cardItem(c, extra = "") {
  return `<article class="card"><a class="num" href="/card/${esc(c.num)}"><span class="plain">${esc(c.num)}</span></a> <span class="meta">${esc(c.shelf_title || c.shelf)}</span>
<p>${esc(c.blurb)}</p>${extra}${c.tags?.length ? `<div class="tags">${c.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}</article>`;
}

export function proPanel() {
  const items = PRO_FEATURES.map(
    (f) => `<details class="locked"><summary>${LOCK}<span>${esc(f.name)}</span><span class="badge">Pro</span></summary>
<p class="msg">${esc(proMessage(f.name)).replace("PRO.md", `<a href="${esc(PRO_URL)}">PRO.md</a>`)}</p><p class="sum">${esc(f.summary)}</p></details>`
  ).join("");
  return `<aside class="panel" aria-label="Pro features"><h2>Pro</h2><p>Not open yet. These are reserved for the Pro edition.</p>${items}</aside>`;
}

export function homePage(config, { total, shelves, recent, q = "", results = null }) {
  let main;
  if (results) {
    main = `<h2>${results.cards.length} result${results.cards.length === 1 ? "" : "s"} for “${esc(q)}”</h2>
<div class="cards">${results.cards.length ? results.cards.map((c) => cardItem(c, `<p class="meta">${esc(c.snippet)}</p>`)).join("") : `<p class="empty">No cards match. Try other words.</p>`}</div>`;
  } else if (!total) {
    main = `<div class="note"><p><b>The catalog is empty.</b> Connect an agent to <code>/mcp</code> and file a card with <code>file_card</code>, or load the sample cards with <code>npm run seed</code>.</p></div>`;
  } else {
    main = `<h2>Shelves</h2><div class="drawers">${shelves
      .map((s) => `<a class="drawer" href="/shelf/${esc(s.id)}"><span class="plain"><span class="pull"></span><b>${esc(s.title)}</b><span class="sub">${s.count} card${s.count === 1 ? "" : "s"}${s.latest_num ? " · newest " + esc(s.latest_num) : ""}</span></span></a>`)
      .join("")}</div>
<h2>Newest cards</h2><div class="cards">${recent.map((c) => cardItem(c)).join("")}</div>`;
  }
  return layout(config, config.title, `<div class="grid"><main>${main}</main>${proPanel()}</div>`, { count: total, q });
}

export function shelfPage(config, shelf, cards, total) {
  return layout(
    config,
    `${shelf.title} · ${config.title}`,
    `<div class="grid"><main><h2>${esc(shelf.title)}</h2><div class="cards">${cards.length ? cards.map((c) => cardItem(c)).join("") : `<p class="empty">No cards on this shelf yet.</p>`}</div></main>${proPanel()}</div>`,
    { count: total }
  );
}

export function cardPage(config, c, total) {
  const walk = `<nav class="walk" aria-label="Same source">${c.prev ? `<a href="/card/${esc(c.prev)}">← ${esc(c.prev)}</a>` : `<span class="empty">First card from this source</span>`}${
    c.next ? `<a href="/card/${esc(c.next)}">${esc(c.next)} →</a>` : `<span class="empty">Last card from this source</span>`
  }</nav>`;
  const link = c.link ? `<p class="meta">Original: <a href="${esc(c.link)}" rel="noopener noreferrer">${esc(c.link)}</a></p>` : "";
  const body = `<article class="card"><span class="num">${esc(c.num)}</span> <span class="meta"><a href="/shelf/${esc(c.shelf)}">${esc(c.shelf_title)}</a> · source: ${esc(c.source)} · filed ${esc(c.filed_at.slice(0, 10))}${
    c.filed_by ? " by " + esc(c.filed_by) : ""
  }</span>
<p><b>${esc(c.blurb)}</b></p>${c.tags.length ? `<div class="tags">${c.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
<div class="passage">${esc(c.text)}</div>${link}${walk}</article>`;
  return layout(config, `${c.num} · ${config.title}`, `<div class="grid"><main>${body}</main>${proPanel()}</div>`, { count: total });
}

export function loginPage(config, { error = "", problem = "" } = {}) {
  const body = problem
    ? `<main class="narrow"><h2>Not set up yet</h2><p class="err">${esc(problem)}</p></main>`
    : `<main class="narrow"><h2>Sign in</h2><p>Paste the catalog token (the CATALOG_TOKEN you set). It stays on this device as a cookie that holds a hash of it.</p>
<form method="post" action="/login"><input type="password" name="token" autocomplete="current-password" aria-label="Catalog token" required><button type="submit">Open</button></form>${error ? `<p class="err">${esc(error)}</p>` : ""}</main>`;
  return layout(config, `Sign in · ${config.title}`, body, { search: false });
}

export function notFoundPage(config, what = "That page isn't here.") {
  return layout(config, `Not found · ${config.title}`, `<main class="narrow"><h2>Not found</h2><p>${esc(what)}</p><p><a href="/">Back to the shelves</a></p></main>`);
}
