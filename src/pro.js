// Pro features. These are reserved for the Pro edition, which isn't open yet.
// If you came here to build one of them, read PRO.md first: pull requests that add
// these features will be closed with a pointer to PRO.md (see CONTRIBUTING.md).
//
// Each function below says what the feature does and throws a ProFeatureError.
// Nothing here calls out to any server: this file is a signpost, not a licence check.

import { PRO_URL, PRO_PRICE } from "./config.js";

export function proMessage(name) {
  return `${name} is part of Pro (${PRO_PRICE}, not open yet): see PRO.md`;
}

export class ProFeatureError extends Error {
  constructor(name) {
    super(proMessage(name));
    this.name = "ProFeatureError";
    this.feature = name;
    this.url = PRO_URL;
  }
}

// The list the web page, the MCP server and the tests all read. Keep it in step with PRO.md.
// `tools` are MCP tool names that answer with the Pro message instead of "unknown tool".
export const PRO_FEATURES = [
  {
    id: "team-sign-in",
    name: "Team sign-in",
    summary: "People sign in with Google, Microsoft, GitHub or any OpenID provider, each with a role (reader, filer, admin), and clients that only speak OAuth can connect.",
    tools: [],
  },
  {
    id: "many-libraries",
    name: "Many libraries",
    summary: "Separate catalogs (work, home, one per client) from one deployment, each with its own access and its own numbering.",
    tools: ["switch_library"],
  },
  {
    id: "nightly-chop",
    name: "Nightly chop",
    summary: "Each night, finished chats and call transcripts are cut into numbered cards with blurbs and tags and filed on the right shelf.",
    tools: ["chop"],
  },
  {
    id: "work-queue",
    name: "Agent work queue",
    summary: "Scheduled agents wake up, take one job from a shared queue, report what they did and clock out, with leases so two agents never take the same job.",
    tools: ["wake_up", "take_job", "report_job", "clock_out"],
  },
  {
    id: "usage-reports",
    name: "Usage reports",
    summary: "Which questions your agents ask, which cards they read, and which cards nobody reads, from records kept in your own database.",
    tools: ["usage_report"],
  },
  {
    id: "snowflake",
    name: "Snowflake-native version",
    summary: "The same catalog running inside your own Snowflake account, with Snowflake roles deciding who reads what.",
    tools: [],
  },
];

export function proFeatureForTool(toolName) {
  return PRO_FEATURES.find((f) => f.tools.includes(toolName)) || null;
}

/**
 * Team sign-in: replace the single shared token with real sign-in (Google, Microsoft,
 * GitHub or any OpenID Connect provider), roles per person (reader, filer, admin),
 * and OAuth so hosted chat apps that only speak OAuth can connect.
 */
export function teamSignIn() {
  throw new ProFeatureError("Team sign-in");
}

/**
 * Many libraries: run several catalogs from one deployment, each with its own
 * shelves, numbering and access, and let an agent switch between them.
 */
export function manyLibraries() {
  throw new ProFeatureError("Many libraries");
}

/**
 * Nightly chop: on a schedule, take finished chats and call transcripts, cut them into
 * card-sized passages, write a blurb and tags for each, file them in order on the right
 * shelf so prev/next links follow the conversation, and skip anything already filed.
 */
export function nightlyChop() {
  throw new ProFeatureError("Nightly chop");
}

/**
 * Agent work queue: scheduled agents call wake up, take one job, work it, report what
 * they did and clock out. Jobs are leased so two agents never take the same one, and a
 * job an agent dropped goes back on the queue.
 */
export function workQueue() {
  throw new ProFeatureError("Agent work queue");
}

/**
 * Usage reports: which questions agents ask, which cards they read, how fast answers
 * come back, and which cards nobody reads, kept in the user's own database.
 */
export function usageReports() {
  throw new ProFeatureError("Usage reports");
}

/**
 * Snowflake-native version: the same tools and numbering, stored and governed inside
 * the user's own Snowflake account instead of Cloudflare D1.
 */
export function snowflakeNative() {
  throw new ProFeatureError("Snowflake-native version");
}
