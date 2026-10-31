"use client";

// Admin only: the proxy answers 404 to anyone else, so this page never renders for them.
import { useEffect, useState, type FormEvent } from "react";
import { monthKey, monthLabel } from "@/lib/dates";
import { archive, newestFirst, PRIORITIES, STATUSES, type Feature, type FeatureFields, type Status, type Tracker, type TrackerOp } from "@/lib/tracker";
import { Drawer } from "../components";

const COLUMN: Record<Status, string> = { backlog: "Backlog", next: "Next", doing: "In progress", done: "Done" };
const BLANK: FeatureFields = { title: "", description: "", status: "backlog", priority: "medium" };

async function send(op?: TrackerOp): Promise<Tracker> {
  const res = await fetch("/api/tracker", op
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) }
    : { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as Tracker;
}

export default function TrackerPage() {
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Feature | null | undefined>(undefined); // undefined: closed; null: new
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [thisMonth, setThisMonth] = useState(""); // read once loaded, not while rendering

  useEffect(() => {
    send().then((t) => { setThisMonth(monthKey(new Date())); setTracker(t); }, (e: Error) => setLoadError(e.message));
  }, []);

  function open(feature: Feature | null) { setError(""); setArmed(false); setArchiveOpen(false); setEditing(feature); }

  async function run(op: TrackerOp) {
    setSaving(true);
    try { setTracker(await send(op)); setEditing(undefined); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries((Object.keys(BLANK) as (keyof FeatureFields)[]).map((k) => [k, String(form.get(k) ?? "").trim()])) as FeatureFields;
    if (!editing) return run({ type: "add", fields });
    // Only what changed in this dialog, so a save can't undo an edit made in another tab.
    const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => editing[k as keyof FeatureFields] !== v));
    if (Object.keys(changes).length === 0) return setEditing(undefined);
    return run({ type: "update", id: editing.id, changes });
  }

  function remove() {
    if (!editing) return;
    if (!armed) return setArmed(true); // a second click confirms, so a stray click can't delete
    return run({ type: "delete", id: editing.id });
  }

  const form = editing ?? BLANK;
  // Done keeps this month's; earlier months are in the archive.
  const { current: doneNow, months } = archive(tracker?.items ?? [], thisMonth);
  const card = (f: Feature) => <li key={f.id}>
    <button type="button" className="tr-card" onClick={() => open(f)}>
      <span className="tr-meta">F-{f.id}<span className={`prio ${f.priority}`}>{f.priority}</span>{f.closed && <span>done {f.closed}</span>}</span>
      <b>{f.title}</b>
      {f.description && <p>{f.description}</p>}
    </button>
  </li>;

  return <section className="page">
    <div className="page-head">
      <p className="muted">{loadError ? <span className="down">Tracker unavailable: {loadError}</span> : "Admin only. Features to build next, from idea to done. Saved as tracker.json beside the ledger."}</p>
      <div className="head-actions">
        <button type="button" onClick={() => setArchiveOpen(true)} disabled={!tracker}>Archive{months.length > 0 && ` · ${months.reduce((n, [, items]) => n + items.length, 0)}`}</button>
        <button type="button" className="primary" onClick={() => open(null)} disabled={!tracker}>New feature</button>
      </div>
    </div>
    <div className="board">
      {STATUSES.map((status) => {
        // Newest first in every column, whether open or done.
        const items = status === "done" ? doneNow : (tracker?.items ?? []).filter((f) => f.status === status).sort(newestFirst);
        return <div className="panel" key={status}>
          <div className="panel-head"><h2>{COLUMN[status]} <span className="muted">{items.length}</span></h2></div>
          <ul className="tr-list">
            {items.length === 0 ? <li className="muted">{tracker ? (status === "done" ? "Nothing done this month yet" : "Nothing here") : "Loading…"}</li> : items.map(card)}
          </ul>
        </div>;
      })}
    </div>
    <Drawer open={archiveOpen} title="Archive" onClose={() => setArchiveOpen(false)}>
      <p className="muted">Done items from earlier months, by the month they were done. This month&apos;s stay in Done.</p>
      {months.length === 0 ? <p className="muted">Nothing archived yet.</p> : months.map(([month, items], i) =>
        <details key={month} className="tr-month" open={i === 0}>
          <summary>{monthLabel(month)} <span className="muted">{items.length}</span></summary>
          <ul className="tr-list">{items.map(card)}</ul>
        </details>)}
    </Drawer>
    <Drawer open={editing !== undefined} title={editing ? `F-${editing.id}` : "New feature"} onClose={() => setEditing(undefined)}>
      {editing !== undefined && <form key={editing?.id ?? "new"} className="tr-form" onSubmit={save}>
        <label>Title <input name="title" maxLength={120} required defaultValue={form.title} /></label>
        <label>Description <textarea name="description" rows={8} maxLength={4000} defaultValue={form.description} /></label>
        <div className="tr-row">
          <label>Status <select name="status" defaultValue={form.status}>
            {STATUSES.map((s) => <option key={s} value={s}>{COLUMN[s]}</option>)}
          </select></label>
          <label>Priority <select name="priority" defaultValue={form.priority}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select></label>
        </div>
        {editing && <p className="muted">Added {editing.created} · updated {editing.updated}{editing.closed && ` · done ${editing.closed}`}</p>}
        {error && <p className="down" role="alert">{error}</p>}
        <div className="tr-actions">
          {editing && <button type="button" className="danger" onClick={remove} disabled={saving}>{armed ? "Click again to delete" : "Delete"}</button>}
          <button type="button" className="tr-cancel" onClick={() => setEditing(undefined)}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>}
    </Drawer>
  </section>;
}
