// Free tier access: one user, one shared bearer token, set as a Worker secret (CATALOG_TOKEN).
// MCP clients send it as "Authorization: Bearer <token>". The web page asks for it once and keeps
// a cookie holding a hash of it, so the token itself never sits in the browser.

import { LIMITS } from "./config.js";

const enc = new TextEncoder();

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

// Compares hashes, so the time taken doesn't depend on how much of the token was right.
async function same(a, b) {
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Returns null when the token is set up, or a message saying what to fix.
export function tokenProblem(env) {
  const t = env.CATALOG_TOKEN;
  if (!t) return "No token set. Run: npx wrangler secret put CATALOG_TOKEN";
  if (String(t).length < LIMITS.minToken) return `CATALOG_TOKEN is too short: use at least ${LIMITS.minToken} characters.`;
  return null;
}

export async function bearerOk(request, env) {
  if (tokenProblem(env)) return false;
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return same(m[1].trim(), env.CATALOG_TOKEN);
}

export const COOKIE = "cc_page";

export async function pageCookieValue(env) {
  return hex(await sha256("card-catalog page:" + env.CATALOG_TOKEN));
}

function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

export async function pageSignedIn(request, env) {
  if (tokenProblem(env)) return false;
  const got = readCookie(request, COOKIE);
  return !!got && same(got, await pageCookieValue(env));
}

export async function tokenMatches(token, env) {
  if (tokenProblem(env) || !token) return false;
  return same(String(token).trim(), env.CATALOG_TOKEN);
}

export async function setCookie(env, secure) {
  return `${COOKIE}=${await pageCookieValue(env)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 3600}${secure ? "; Secure" : ""}`;
}

export function clearCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
