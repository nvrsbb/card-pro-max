// Which login the page in memory belongs to. Logging in or out loads the page afresh, so nothing carries over;
// this is the second guard, for a tab whose login changed some other way (in another tab, or a page brought back by
// the Back button): it says when to reload the page for whoever is logged in now. And how long logging out may wait.
import type { Login } from "./ledger.ts";

/** Whether a page loaded while `held` was logged in must go now that the server says `now` is (null: nobody). */
export function mustForget(held: Login | null, now: Login | null): boolean {
  return held !== null && held !== now;
}

/**
 * Remembers who the page in memory belongs to. `note` is told who's logged in each time the server answers,
 * and calls `forget` when that's someone else (or nobody); `reset` is for after forgetting on purpose (logging out).
 */
export function loginWatch(forget: () => void) {
  let held: Login | null = null;
  return {
    note(now: Login | null) {
      if (mustForget(held, now)) forget();
      held = now;
    },
    reset() { held = null; },
    get held() { return held; },
  };
}

/** How long Log out waits for edits still saving before it logs out anyway (those are then lost). */
export const LOGOUT_WAIT_MS = 2_000;

/**
 * Logs out once the edits in flight are saved, but never waits longer than `ms`: the session must not outlive a tap on
 * Log out by more than that. Answers whether the server took the logout.
 */
export async function logOutAfter(saves: Promise<void>, endSession: () => Promise<boolean>,
  wait: (ms: number) => Promise<void>, ms = LOGOUT_WAIT_MS): Promise<boolean> {
  await Promise.race([saves, wait(ms)]);
  return endSession();
}
