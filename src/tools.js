// The MCP tools: their descriptions (what an agent sees) and what each one does.

import { LIMITS } from "./config.js";
import { ask, readCard, fileCard, bookmark, browse } from "./catalog.js";

export function toolDefs(config) {
  const realmHelp = config.realms.map((r) => `${r.letter} = ${r.name}`).join(", ");
  const realmProp = {
    type: "string",
    description: `Optional realm, by letter or name (${realmHelp}).`,
  };
  const ex = `${config.realms[0].letter}-000012`;
  return [
    {
      name: "ask",
      title: "Ask the catalog",
      description:
        "Ask first, before searching anywhere else. A plain question in; the best numbered cards out, each with a one-line blurb, its shelf and a short snippet. " +
        "Answer from the blurbs when they are enough; call read with a card number when you need the passage itself.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "What you want to know, in plain words. A card number in the question comes back first." },
          realm: realmProp,
          shelf: { type: "string", description: "Optional: only look on this shelf (name or id)." },
          limit: { type: "integer", minimum: 1, maximum: LIMITS.askMax, description: `How many cards. Default ${LIMITS.askDefault}.` },
        },
        required: ["question"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "read",
      title: "Read a card",
      description:
        `Read one card by number (like ${ex}): the full passage, its shelf, source, tags and link, plus the numbers of the previous and next card from the same source. ` +
        "To keep reading the conversation, call read on the next number.",
      inputSchema: {
        type: "object",
        properties: { num: { type: "string", description: `Card number, e.g. ${ex}.` } },
        required: ["num"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "file_card",
      title: "File a card",
      description:
        `File one short passage (up to ${LIMITS.text} characters) from a chat, call, doc or note as a numbered card. ` +
        "Give it a shelf (the back room it lives in), a one-line blurb an agent can answer from, and a few tags. " +
        "Cards filed with the same source are linked in order, so read can walk prev and next. Card numbers never change. " +
        "Never file passwords, keys, card numbers or anything you would not want every connected agent to see.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The passage itself." },
          shelf: { type: "string", description: "Shelf name, e.g. 'Spring planning'. Created if new." },
          blurb: { type: "string", description: `One line an agent can answer from (up to ${LIMITS.blurb} characters). Default: the first sentence.` },
          tags: { type: "array", items: { type: "string" }, maxItems: LIMITS.tags, description: "A few topic words." },
          source: { type: "string", description: "Which chat, call or doc this came from. Cards with the same source are chained prev/next. Default: the shelf." },
          realm: realmProp,
          link: { type: "string", description: "Optional http(s) link to the original." },
          filed_by: { type: "string", description: "Your agent name." },
        },
        required: ["text", "shelf"],
      },
    },
    {
      name: "bookmark",
      title: "Bookmark cards",
      description:
        "Save card numbers on a named reading list with a one-line note on why, so you or another agent can pick them up later. " +
        "action: add (default), list (show a list) or remove.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "list", "remove"], description: "Default add." },
          nums: { type: "array", items: { type: "string" }, maxItems: 20, description: "Card numbers (for add and remove)." },
          note: { type: "string", description: "One line: why these matter." },
          list: { type: "string", description: "Reading list name. Default: default." },
          by: { type: "string", description: "Your agent name." },
        },
      },
    },
    {
      name: "browse",
      title: "Browse shelves",
      description: "With no shelf: every shelf with its card count and newest card, plus the realms and reading lists. With a shelf: the cards on it in filing order.",
      inputSchema: {
        type: "object",
        properties: {
          shelf: { type: "string", description: "Optional shelf name or id." },
          after: { type: "string", description: "Paging: list cards after this card number." },
          limit: { type: "integer", minimum: 1, maximum: 200, description: "Cards per page. Default 50." },
        },
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

// Short text the agent reads, alongside the same data as structuredContent.
const tagLine = (tags) => (tags && tags.length ? "  #" + tags.join(" #") : "");

export const HANDLERS = {
  async ask(store, config, args) {
    const r = await ask(store, config, args);
    if (!r.cards.length) {
      return { data: r, text: `No cards match "${r.question}" (${r.total_cards} in the catalog, ${r.took_ms} ms). Try other words, or browse the shelves.` };
    }
    const lines = r.cards.map((c) => `${c.num}  [${c.shelf_title}]  ${c.blurb}${tagLine(c.tags)}\n    ${c.snippet}`);
    return {
      data: r,
      text: `${r.cards.length} card${r.cards.length === 1 ? "" : "s"} for "${r.question}" (${r.took_ms} ms, ${r.total_cards} in the catalog). Read one with read(num).\n\n${lines.join("\n")}`,
    };
  },

  async read(store, config, args) {
    const c = await readCard(store, config, args.num);
    if (!c) return { data: { found: false, num: args.num }, text: `No card ${args.num}.`, isError: true };
    const head = `${c.num} | shelf: ${c.shelf_title} | source: ${c.source} | prev: ${c.prev || "none"} | next: ${c.next || "none"}`;
    const extra = [c.note, c.tags.length ? "tags: " + c.tags.join(", ") : "", c.link ? "link: " + c.link : "", `filed ${c.filed_at}${c.filed_by ? " by " + c.filed_by : ""}`].filter(Boolean);
    return { data: { found: true, ...c }, text: `${head}\n${extra.join("\n")}\nblurb: ${c.blurb}\n\n${c.text}` };
  },

  async file_card(store, config, args) {
    const r = await fileCard(store, config, args);
    return { data: r, text: `Filed ${r.num} on shelf "${r.shelf_title}" (source: ${r.source}).${r.prev ? ` Previous card from this source: ${r.prev}.` : ""}` };
  },

  async bookmark(store, config, args) {
    const r = await bookmark(store, config, args);
    if (r.action === "list") {
      const lines = r.bookmarks.map((b) => `${b.num}  ${b.blurb}${b.note ? "  (" + b.note + ")" : ""}`);
      return { data: r, text: lines.length ? `Reading list "${r.list}":\n${lines.join("\n")}` : `Reading list "${r.list}" is empty.` };
    }
    if (r.action === "remove") return { data: r, text: `Removed ${r.removed} from "${r.list}".` };
    return { data: r, text: `Bookmarked ${r.added.join(", ")} on "${r.list}".` };
  },

  async browse(store, config, args) {
    const r = await browse(store, config, args);
    if ("shelves" in r) {
      const lines = r.shelves.map((s) => `${s.title} (${s.id}): ${s.count} card${s.count === 1 ? "" : "s"}${s.latest_num ? ", newest " + s.latest_num : ""}`);
      const lists = r.bookmark_lists.length ? `\nReading lists: ${r.bookmark_lists.map((l) => `${l.list} (${l.count})`).join(", ")}` : "";
      const head = `${r.total_cards} card${r.total_cards === 1 ? "" : "s"} on ${r.shelves.length} shel${r.shelves.length === 1 ? "f" : "ves"}`;
      return { data: r, text: lines.length ? `${head}:\n${lines.join("\n")}${lists}` : "The catalog is empty. File a card with file_card." };
    }
    if (!r.shelf) return { data: r, text: r.message, isError: true };
    const lines = r.cards.map((c) => `${c.num}  ${c.blurb}${tagLine(c.tags)}`);
    return { data: r, text: `${r.shelf.title}:\n${lines.join("\n")}${r.next_after ? `\nMore: browse with after=${r.next_after}` : ""}` };
  },
};
