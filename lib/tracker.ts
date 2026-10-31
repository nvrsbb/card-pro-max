// The admin's feature tracker: a small backlog of what to build next, kept as tracker.json beside the ledger. From ~/Programs/budge.
// Pure, like ledger.ts, so the server and the tests share it.

export const STATUSES = ["backlog", "next", "doing", "done"] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** `closed` is the day it moved to done (YYYY-MM-DD); done items closed before this month are archived by month. */
export type Feature = { id: number; title: string; description: string; status: Status; priority: Priority; created: string; updated: string; closed?: string };
export type Tracker = { nextId: number; items: Feature[] };
export type FeatureFields = Pick<Feature, "title" | "description" | "status" | "priority">;

export type TrackerOp =
  | { type: "add"; fields: FeatureFields }
  | { type: "update"; id: number; changes: Partial<FeatureFields> }
  | { type: "delete"; id: number };

export const TRACKER_FILE = "tracker.json";

// The starting board: what the first version built, and ideas raised along the way. Proposals only.
const SEED: (FeatureFields & { created: string })[] = [
  { status: "done", priority: "high", created: "2026-10-31", title: "RCBC promo catalog",
    description: "Every promo on rcbccredit.com/promos, with its period, card networks, mechanics and DTI permit, checked daily and on demand (Check for new promos). New ones are marked New; ones the bank takes down are kept as gone." },
  { status: "done", priority: "high", created: "2026-10-31", title: "Track a promo: watching, joined, earned, credited",
    description: "Each promo's side panel says where we are with it, which card, the minimum spend and the reward (guessed from the mechanics to start with)." },
  { status: "done", priority: "high", created: "2026-10-31", title: "Spending toward a promo's minimum",
    description: "Log what was spent on which card; the Overview shows how far each joined promo is and how long is left." },
  { status: "done", priority: "medium", created: "2026-10-31", title: "Our cards",
    description: "The cards we hold, by network, so Promos can show only the ones our cards can use." },
  { status: "backlog", priority: "high", created: "2026-10-31", title: "More banks",
    description: "BPI, BDO, Metrobank, Security Bank, UnionBank: one parser each like lib/rcbc.ts, behind the same Check for new promos." },
  { status: "backlog", priority: "medium", created: "2026-10-31", title: "Which RCBC cards a promo is for",
    description: "Some promos are only for premium cards (World Mastercard, Visa Infinite…) or one co-brand. Read that from the mechanics and match it to our cards, not just the network." },
  { status: "backlog", priority: "medium", created: "2026-10-31", title: "Log spending from card alerts",
    description: "Paste or share an RCBC transaction alert and it becomes spending toward the promo at that merchant, like Budge's Paste an alert." },
  { status: "backlog", priority: "low", created: "2026-10-31", title: "A nudge before a joined promo ends",
    description: "A note (or a phone notification) three days before a joined promo ends while its minimum spend isn't met yet." },
];

export function seedTracker(): Tracker {
  const items = SEED.map(({ created, ...f }, i) => ({ id: i + 1, ...f, created, updated: created, ...(f.status === "done" ? { closed: created } : {}) }));
  return { nextId: items.length + 1, items };
}

export function readTracker(text: string | undefined): Tracker {
  if (text === undefined) return seedTracker();
  const data = JSON.parse(text) as Tracker;
  // Items done before closing dates were kept count as closed on their last update.
  const items = (Array.isArray(data.items) ? data.items : []).map((f) => (f.status === "done" && !f.closed ? { ...f, closed: f.updated } : f));
  return { nextId: Number(data.nextId) || 1, items };
}

export const writeTracker = (tracker: Tracker) => JSON.stringify(tracker, null, 2) + "\n";

export function applyTrackerOp(tracker: Tracker, op: TrackerOp, today: string): Tracker {
  switch (op.type) {
    case "add":
      return { nextId: tracker.nextId + 1, items: [...tracker.items,
        { id: tracker.nextId, ...op.fields, created: today, updated: today, ...(op.fields.status === "done" ? { closed: today } : {}) }] };
    case "update":
      return { ...tracker, items: tracker.items.map((f) => {
        if (f.id !== op.id) return f;
        const next: Feature = { ...f, ...op.changes, updated: today };
        // Moving to done closes it today; moving out of done reopens it.
        if (next.status !== "done") delete next.closed;
        else if (f.status !== "done") next.closed = today;
        return next;
      }) };
    case "delete":
      return { ...tracker, items: tracker.items.filter((f) => f.id !== op.id) };
  }
}

/** Newest first: the latest added on top, whatever its status or priority. */
export const newestFirst = (a: Feature, b: Feature) => b.created.localeCompare(a.created) || b.id - a.id;

/**
 * Done items split by when they closed: this month's stay on the board (`current`); earlier ones go to the archive,
 * one entry per month (YYYY-MM), newest month first, each newest first.
 */
export function archive(items: Feature[], thisMonth: string): { current: Feature[]; months: [string, Feature[]][] } {
  const done = items.filter((f) => f.status === "done").sort(newestFirst);
  const month = (f: Feature) => (f.closed ?? f.updated).slice(0, 7);
  const months = new Map<string, Feature[]>();
  for (const f of done.filter((x) => month(x) < thisMonth)) months.set(month(f), [...(months.get(month(f)) ?? []), f]);
  return { current: done.filter((f) => month(f) >= thisMonth), months: [...months].sort((a, b) => b[0].localeCompare(a[0])) };
}

/** The git commit message for an edit. */
export function describeTrackerOp(tracker: Tracker, op: TrackerOp): string {
  const title = (id: number) => tracker.items.find((f) => f.id === id)?.title ?? "a feature";
  switch (op.type) {
    case "add": return `Tracker: add F-${tracker.nextId} ${op.fields.title}`;
    case "update": {
      const what = op.changes.status && Object.keys(op.changes).length === 1 ? `move to ${op.changes.status}` : "edit";
      return `Tracker: ${what} F-${op.id} ${title(op.id)}`;
    }
    case "delete": return `Tracker: delete F-${op.id} ${title(op.id)}`;
  }
}

const isTitle = (v: unknown) => typeof v === "string" && v.trim() !== "" && v.length <= 120;
const isDescription = (v: unknown) => typeof v === "string" && v.length <= 4000;
const isStatus = (v: unknown) => STATUSES.includes(v as Status);
const isPriority = (v: unknown) => PRIORITIES.includes(v as Priority);
const isFeatureId = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

/** Checks an edit sent by the browser before it is applied. */
export function isTrackerOp(v: unknown): v is TrackerOp {
  const op = v as TrackerOp;
  if (!op || typeof op !== "object") return false;
  switch (op.type) {
    case "add": {
      const f = op.fields;
      return !!f && isTitle(f.title) && isDescription(f.description) && isStatus(f.status) && isPriority(f.priority);
    }
    case "update": {
      const c = op.changes;
      if (!isFeatureId(op.id) || !c || typeof c !== "object") return false;
      const checks: Record<string, (v: unknown) => boolean> = { title: isTitle, description: isDescription, status: isStatus, priority: isPriority };
      return Object.keys(c).length > 0 && Object.entries(c).every(([k, val]) => checks[k]?.(val) ?? false);
    }
    case "delete": return isFeatureId(op.id);
    default: return false;
  }
}
