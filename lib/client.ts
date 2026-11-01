"use client";

// The browser's copy of the ledger. Edits show at once, then are saved (one commit each) in order. As in ~/Programs/budge.
import { useSyncExternalStore } from "react";
import { applyOp, type Ledger, type Op } from "./ledger";
import type { BankCheck } from "./import";
import type { LedgerSource } from "./store";

export * from "./ledger";

type State = { ledger: Ledger | null; source: LedgerSource | null; pending: number; error: string | null };

let state: State = { ledger: null, source: null, pending: 0, error: null };
let started = false;
let queue = Promise.resolve();
let generation = 0; // goes up when the ledger is forgotten, so answers asked for before then are dropped
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401) {
    // A full load, so the proxy sees the expired cookie and the login page starts clean.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
    throw new Error("Not logged in.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export async function reload(): Promise<void> {
  const asked = generation;
  try {
    const { ledger, source } = await request<{ ledger: Ledger; source: LedgerSource }>("/api/ledger");
    if (asked === generation) set({ ledger, source, error: null });
  } catch (error) { if (asked === generation) set({ error: (error as Error).message }); }
}

/** Drops the ledger in memory (the login changed) and loads it again if a page is showing it. */
export function forgetLedger(): void {
  generation += 1;
  queue = Promise.resolve();
  started = listeners.size > 0;
  set({ ledger: null, source: null, pending: 0, error: null });
  if (started) void reload();
}

/** Resolves once every edit made so far has been saved (or has failed), so logging out doesn't cut one off. */
export const settled = (): Promise<void> => queue;

/** Shows the edit straight away and saves it after any edits still in flight. False when it can't apply here. */
export function mutate(op: Op): boolean {
  if (!state.ledger) return false;
  let next: Ledger;
  try { next = applyOp(state.ledger, op); }
  catch (error) { set({ error: (error as Error).message }); return false; }
  set({ ledger: next, pending: state.pending + 1, error: null });
  const asked = generation;
  queue = queue.then(async () => {
    if (asked !== generation) return; // made before the login changed: not saved under someone else's name
    try {
      const { ledger } = await request<{ ledger: Ledger }>("/api/ledger", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
      if (asked !== generation) return;
      // Take the saved version only when nothing newer is waiting, so later edits don't flicker away.
      set(state.pending === 1 ? { ledger, pending: 0 } : { pending: state.pending - 1 });
    } catch (error) {
      if (asked !== generation) return;
      set({ pending: state.pending - 1, error: `Not saved: ${(error as Error).message}` });
      if (state.pending === 0) await reload();
    }
  });
  return true;
}

export type { BankCheck, CheckResult } from "./import";

/** "Check for new promos": every bank, after any edits in flight, then shows the catalog as saved. */
export function checkForPromos(): Promise<BankCheck[]> {
  const asked = generation;
  set({ pending: state.pending + 1, error: null });
  const run = queue.then(async () => {
    try {
      const { checks, ledger } = await request<{ checks: BankCheck[]; ledger: Ledger }>("/api/import", { method: "POST" });
      if (asked === generation) set(state.pending === 1 ? { ledger, pending: 0 } : { pending: state.pending - 1 });
      return checks;
    } catch (error) {
      if (asked === generation) set({ pending: state.pending - 1 });
      throw error;
    }
  });
  queue = run.then(() => {}, () => {});
  return run;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) { started = true; void reload(); }
  return () => { listeners.delete(listener); };
}

const serverState: State = { ledger: null, source: null, pending: 0, error: null };
const useLedgerState = () => useSyncExternalStore(subscribe, () => state, () => serverState);

/** The ledger, or null until it has loaded. */
export const useLedger = () => useLedgerState().ledger;
export const useLedgerStatus = () => {
  const { ledger, source, pending, error } = useLedgerState();
  return { loaded: ledger !== null, source, saving: pending > 0, error };
};

/** A short random id for a new card or spending row. */
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
