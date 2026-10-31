// Password login: a signed cookie that says "<role> logged in until <time>". Server only.
// DASHBOARD_PASSWORD is the household login (role "member"); ADMIN_PASSWORD, when set, is the owner's ("admin"),
// who also sees admin pages such as the feature tracker.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Login } from "./ledger.ts";

export const SESSION_COOKIE = "cpm_session";
export const SESSION_DAYS = 30;
export type Role = Login; // admin: the owner, who also sees the Tracker; member: anyone else with the household password

const password = () => process.env.DASHBOARD_PASSWORD ?? "";
const adminPassword = () => process.env.ADMIN_PASSWORD ?? "";
const secret = () => process.env.SESSION_SECRET ?? "";

/** Login is skipped only in development with no password set; whoever runs it locally is the admin. */
export const authRequired = () => process.env.NODE_ENV === "production" || password() !== "";
export const authConfigured = () => password() !== "" && secret() !== "";

const same = (a: string, b: string) => {
  const [x, y] = [createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest()];
  return timingSafeEqual(x, y);
};

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** The role a password logs in as, or null when it's wrong. Both are compared, so timing doesn't say which matched. */
export function checkPassword(attempt: string): Role | null {
  if (!authConfigured()) return null;
  const admin = adminPassword() !== "" && same(attempt, adminPassword());
  const member = same(attempt, password());
  return admin ? "admin" : member ? "member" : null;
}

export function newSession(role: Role): string {
  const payload = `${role}.${Date.now() + SESSION_DAYS * 86_400_000}`;
  return `${payload}.${sign(payload)}`;
}

/** Who the cookie belongs to, or null when it's missing, expired or forged. */
export function sessionRole(cookie: string | undefined): Role | null {
  if (!authRequired()) return "admin";
  if (!authConfigured() || !cookie) return null;
  const [role, expires, signature = ""] = cookie.split(".");
  if ((role !== "admin" && role !== "member") || !(Number(expires) > Date.now()) || !same(signature, sign(`${role}.${expires}`))) return null;
  return role;
}

export const validSession = (cookie: string | undefined) => sessionRole(cookie) !== null;
export const isAdmin = (cookie: string | undefined) => sessionRole(cookie) === "admin";

/**
 * Where to go after logging in: only a path on this site, so the login page can't be used to bounce someone elsewhere.
 * Read the way a browser reads it (which drops tabs and newlines, so "/\t/evil.com" would be "//evil.com"), and passed
 * on in that clean form.
 */
export function safeNext(value: unknown): string {
  const next = String(value ?? "");
  const here = "http://card-pro-max.invalid";
  try {
    const url = new URL(next, here);
    if (/^\/(?![/\\])/.test(next.replace(/[\t\n\r]/g, "")) && url.origin === here) return url.pathname + url.search + url.hash;
  } catch { /* not a path */ }
  return "/";
}
