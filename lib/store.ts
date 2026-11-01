// Where the ledger's files live. Server only. Adapted from ~/Programs/budge.
// - GitHub (LEDGER_REPO + LEDGER_GITHUB_TOKEN): every edit is one commit, so git history is the audit log.
// - A local folder (LEDGER_DIR, default .ledger/) when no repo is configured, for development.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyOp, BANKS, changedFiles, commitMessage, fromFiles, isLedgerFile, SETTINGS_FILE, toFiles, whoIs, type Bank, type Ledger, type Login, type Op } from "./ledger.ts";
import { describeImport, mergeImport } from "./promos.ts";
import type { Detail, Listed } from "./rcbc.ts";
import { applyTrackerOp, describeTrackerOp, readTracker, TRACKER_FILE, writeTracker, type Tracker, type TrackerOp } from "./tracker.ts";

export type LedgerSource = { kind: "github"; repo: string; branch: string; url: string; historyUrl: string } | { kind: "local"; dir: string };
type Snapshot = { files: Record<string, string>; version: string };

interface Backend {
  source: LedgerSource;
  /** The files `want` picks (the ledger's, by default) and the version they were read at. */
  read(want?: (path: string) => boolean): Promise<Snapshot>;
  /** Writes the files as one change on top of `version`; false when someone else changed the ledger first. */
  write(files: Record<string, string>, message: string, version: string): Promise<boolean>;
}

export class LedgerError extends Error {}

// ---------- GitHub ----------

const blobCache = new Map<string, string>(); // blob sha → content; a sha's content never changes
// commit sha → its files; a commit never changes either, so a read while nothing new was saved takes one GitHub call.
type TreeEntry = { path: string; sha: string; type: string };
const treeCache = new Map<string, TreeEntry[]>();
const TREES_KEPT = 20;

function githubBackend(repo: string, token: string, branch: string): Backend {
  async function gh<T>(route: string, init?: { method: string; body: unknown }): Promise<{ status: number; body: T }> {
    const res = await fetch(`https://api.github.com/repos/${repo}${route}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      body: init ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as T;
    if (res.status >= 400 && res.status !== 422) {
      const hint = res.status === 401 ? "the token is invalid or expired" : res.status === 403 || res.status === 404
        ? `the token can't reach ${repo} (it needs Contents: read and write on that repo)` : `status ${res.status}`;
      throw new LedgerError(`GitHub request failed: ${hint}.`);
    }
    return { status: res.status, body };
  }

  return {
    source: { kind: "github", repo, branch, url: `https://github.com/${repo}`, historyUrl: `https://github.com/${repo}/commits/${branch}` },
    async read(want = isLedgerFile) {
      const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
      const head = ref.body.object.sha;
      let entries = treeCache.get(head);
      if (!entries) {
        const commit = await gh<{ tree: { sha: string } }>(`/git/commits/${head}`);
        const tree = await gh<{ tree: TreeEntry[] }>(`/git/trees/${commit.body.tree.sha}?recursive=1`);
        entries = tree.body.tree;
        treeCache.set(head, entries);
        if (treeCache.size > TREES_KEPT) treeCache.delete(treeCache.keys().next().value!);
      }
      const files: Record<string, string> = {};
      await Promise.all(entries.filter((e) => e.type === "blob" && want(e.path)).map(async (e) => {
        let content = blobCache.get(e.sha);
        if (content === undefined) {
          const blob = await gh<{ content: string }>(`/git/blobs/${e.sha}`);
          content = Buffer.from(blob.body.content, "base64").toString("utf8");
          blobCache.set(e.sha, content);
        }
        files[e.path] = content;
      }));
      return { files, version: head };
    },
    async write(changed, message, version) {
      const base = await gh<{ tree: { sha: string } }>(`/git/commits/${version}`);
      const tree = await gh<{ sha: string }>("/git/trees", { method: "POST", body: {
        base_tree: base.body.tree.sha,
        tree: Object.entries(changed).map(([p, content]) => ({ path: p, mode: "100644", type: "blob", content })),
      } });
      const commit = await gh<{ sha: string }>("/git/commits", { method: "POST", body: { message, tree: tree.body.sha, parents: [version] } });
      const ref = await gh(`/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: commit.body.sha, force: false } });
      return ref.status !== 422; // 422: the branch moved on (not a fast-forward)
    },
  };
}

// ---------- local folder ----------

function localBackend(dir: string): Backend {
  const hash = (files: Record<string, string>) =>
    createHash("sha256").update(JSON.stringify(Object.entries(files).sort())).digest("hex");
  // The version covers every file, like a git commit, so a write fails if anything changed since the read.
  async function all(): Promise<Snapshot> {
    const files: Record<string, string> = {};
    const list = async (sub: string) => (await readdir(path.join(/*turbopackIgnore: true*/ dir, sub)).catch(() => [])).map((f) => (sub ? `${sub}/${f}` : f));
    const names = (await Promise.all(["", "promos", "spend"].map(list))).flat();
    for (const name of names.filter((n) => isLedgerFile(n) || n === TRACKER_FILE)) files[name] = await readFile(path.join(/*turbopackIgnore: true*/ dir, name), "utf8");
    return { files, version: hash(files) };
  }
  return {
    source: { kind: "local", dir },
    async read(want = isLedgerFile) {
      const { files, version } = await all();
      return { files: Object.fromEntries(Object.entries(files).filter(([name]) => want(name))), version };
    },
    async write(changed, _message, version) {
      if ((await all()).version !== version) return false;
      for (const [name, content] of Object.entries(changed)) {
        const file = path.join(/*turbopackIgnore: true*/ dir, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
      }
      return true;
    },
  };
}

// ---------- public ----------

function backend(): Backend {
  const repo = process.env.LEDGER_REPO;
  const token = process.env.LEDGER_GITHUB_TOKEN;
  if (repo && token) return githubBackend(repo, token, process.env.LEDGER_BRANCH || "main");
  if (process.env.NODE_ENV === "production" && !process.env.LEDGER_DIR) {
    throw new LedgerError("No ledger configured. Set LEDGER_REPO and LEDGER_GITHUB_TOKEN.");
  }
  return localBackend(path.resolve(/*turbopackIgnore: true*/ process.env.LEDGER_DIR || ".ledger"));
}

export async function readLedger(): Promise<{ ledger: Ledger; source: LedgerSource }> {
  const store = backend();
  return { ledger: fromFiles((await store.read()).files), source: store.source };
}

/** Applies one edit on top of the latest ledger and saves it, retrying if another edit landed first. */
export async function saveOp(op: Op, login?: Login | null): Promise<Ledger> {
  const store = backend();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { files, version } = await store.read();
    const before = fromFiles(files);
    const next = applyOp(before, op);
    const changed = changedFiles(files, toFiles(next));
    if (Object.keys(changed).length === 0) return next;
    if (await store.write(changed, commitMessage(before, op, login), version)) return next;
  }
  throw new LedgerError("The ledger kept changing while saving. Try again.");
}

export type ImportSummary = { added: number; updated: number; gone: number; removed: number };

/**
 * Merges a check of a bank's list into the catalog as one commit, retrying like saveOp. `listed` and `details` were
 * fetched before (lib/import.ts), so a retry doesn't fetch again. `by` is a login, or what ran it ("daily check").
 */
export async function saveImport(bank: Bank, listed: Listed[], details: Record<string, Detail>, today: string, url: (slug: string) => string,
  by: string, tried: string[] = []): Promise<{ ledger: Ledger; summary: ImportSummary }> {
  const store = backend();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { files, version } = await store.read();
    const before = fromFiles(files);
    const result = mergeImport(before, bank, listed, details, today, url, tried);
    const next = { ...before, promos: result.promos };
    const summary = { added: result.added.length, updated: result.updated.length, gone: result.gone.length, removed: result.removed.length };
    const changed = changedFiles(files, toFiles(next));
    if (Object.keys(changed).length === 0) return { ledger: next, summary };
    const who = by === "admin" || by === "member" ? whoIs(before, by) : by;
    if (await store.write(changed, `${describeImport(BANKS[bank], result)} (by ${who})`, version)) return { ledger: next, summary };
  }
  throw new LedgerError("The ledger kept changing while saving. Try again.");
}

// ---------- feature tracker (admin) ----------

const isTrackerFile = (p: string) => p === TRACKER_FILE;
const isTrackerOrSettings = (p: string) => p === TRACKER_FILE || p === SETTINGS_FILE;

export async function loadTracker(): Promise<Tracker> {
  return readTracker((await backend().read(isTrackerFile)).files[TRACKER_FILE]);
}

/** Applies one tracker edit on top of the latest version and saves it as one commit, retrying like saveOp. */
export async function saveTrackerOp(op: TrackerOp, login?: Login | null): Promise<Tracker> {
  const store = backend();
  const today = new Date().toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { files, version } = await store.read(isTrackerOrSettings);
    const before = readTracker(files[TRACKER_FILE]);
    const next = applyTrackerOp(before, op, today);
    const who = login && whoIs(fromFiles({ [SETTINGS_FILE]: files[SETTINGS_FILE] ?? "" }), login);
    const message = who ? `${describeTrackerOp(before, op)} (by ${who})` : describeTrackerOp(before, op);
    if (await store.write({ [TRACKER_FILE]: writeTracker(next) }, message, version)) return next;
  }
  throw new LedgerError("The tracker kept changing while saving. Try again.");
}
