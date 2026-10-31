"use client";

// Logging in or out starts the browser afresh, so nothing from the last login stays in memory (lib/login.ts).
import { forgetLedger, settled } from "./client";
import { loginWatch, logOutAfter } from "./login";
import type { Login } from "./ledger";

// When the login changed in another tab, the whole page reloads, and the server answers for the new login.
const watch = loginWatch(() => {
  forgetLedger();
  window.location.reload();
});

/** Tells the browser who the server says is logged in; a page held for someone else is reloaded. */
export const noteLogin = (role: Login | null) => watch.note(role);

/** Goes to `href` with a full page load, keeping nothing from the last login. */
export function startAfresh(href: string): void {
  forgetLedger();
  watch.reset();
  window.location.replace(href);
}

let ending: Promise<boolean> | null = null;

/** Ends the session on the server, once. `keepalive` lets the request finish even if the app is closed meanwhile. */
function endSession(): Promise<boolean> {
  ending ??= fetch("/api/logout", { method: "POST", cache: "no-store", keepalive: true })
    .then((res) => res.ok || res.status === 401)
    .catch(() => false)
    .then((done) => { if (!done) ending = null; return done; });
  return ending;
}

/** Logs out once edits still saving are done (waiting up to 2 seconds), then opens the login page afresh. */
export async function leave(): Promise<boolean> {
  const done = await logOutAfter(settled(), endSession, (ms) => new Promise((r) => setTimeout(r, ms)));
  if (done) startAfresh("/login");
  return done;
}
