"use client";

// The catalog: every promo, narrowed to what's on for our cards by default. A promo opens in the side panel.
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState, type FormEvent } from "react";
import { BANKS, checkForPromos, KINDS, KIND_LABEL, mutate, NETWORKS, NETWORK_LABEL, type CheckResult, type Kind, type Ledger, type Network, type Promo, type PromoFields, useLedger } from "@/lib/client";
import { manilaToday } from "@/lib/dates";
import { byEnding, cardsFor, hasEnded, isNew, isOn, isUpcoming, trackingOf } from "@/lib/promos";
import { holders, ownedCards, possessive } from "@/lib/cards";
import { Drawer, Ends, focusHere, KindChip, networkNames, StatusChip } from "../components";
import { PromoPanel } from "../promo-panel";

const SHOWS = { on: "On now", new: "New this week", upcoming: "Starting later", tracked: "Tracking", past: "Ended or taken down", all: "All" } as const;
type Show = keyof typeof SHOWS;

function shown(ledger: Ledger, p: Promo, show: Show, today: string): boolean {
  switch (show) {
    case "on": return isOn(p, today);
    case "new": return isNew(p, ledger.promos, today);
    case "upcoming": return isUpcoming(p, today);
    case "tracked": return !!trackingOf(ledger, p.id);
    case "past": return !!p.gone || hasEnded(p, today);
    case "all": return true;
  }
}

/** Plain text that matches a promo: its title, summary or mechanics. */
const matches = (p: Promo, q: string) => !q || `${p.title}\n${p.summary}\n${p.details}`.toLowerCase().includes(q);

export default function PromosPage() {
  return <Suspense><Promos /></Suspense>;
}

function Promos() {
  const ledger = useLedger();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const asked = params.get("show") ?? "";
  const [show, setShow] = useState<Show>(asked in SHOWS ? asked as Show : "on");
  const [kind, setKind] = useState<Kind | "">("");
  const [whose, setWhose] = useState<string | null>(null); // "ours", a person's id, or "any"; null: ours once we have some
  const [open, setOpen] = useState<string | null>(params.get("promo"));
  const [editing, setEditing] = useState<Promo | null | undefined>(undefined); // undefined: closed; null: new
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ result?: CheckResult; error?: string } | null>(null);

  if (!ledger) return <section className="page"><p className="muted">Loading…</p></section>;
  const today = manilaToday();
  const anyOurs = ownedCards(ledger.cards).length > 0;
  const forWhom = anyOurs ? whose ?? "ours" : "any";
  const theirs = forWhom === "any" ? [] : ownedCards(ledger.cards, forWhom === "ours" ? undefined : forWhom);
  const list = ledger.promos
    .filter((p) => shown(ledger, p, show, today) && (!kind || p.kind === kind) && (forWhom === "any" || cardsFor(p, theirs).length > 0) && matches(p, q))
    .sort(show === "new" ? (a, b) => b.added.localeCompare(a.added) || byEnding(a, b) : byEnding);

  async function check() {
    setChecking(true);
    setChecked(null);
    try { setChecked({ result: await checkForPromos() }); }
    catch (error) { setChecked({ error: (error as Error).message }); }
    finally { setChecking(false); }
  }

  return <section className="page">
    <div className="page-head">
      <div className="filters">
        <input className="search" type="search" placeholder="Search promos" aria-label="Search promos" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Which promos" value={show} onChange={(e) => setShow(e.target.value as Show)}>
          {(Object.keys(SHOWS) as Show[]).map((s) => <option key={s} value={s}>{SHOWS[s]}</option>)}
        </select>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Kind | "")}>
          <option value="">Every kind</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        {anyOurs && <select aria-label="For whose cards" value={forWhom} onChange={(e) => setWhose(e.target.value)}>
          <option value="ours">For our cards</option>
          {ledger.people.length > 1 && holders(ledger).map((x) => <option key={x.id} value={x.id}>For {possessive(x.name)} cards</option>)}
          <option value="any">For any card</option>
        </select>}
      </div>
      <div className="head-actions">
        <button type="button" onClick={() => setEditing(null)}>Add promo</button>
        <button type="button" className="primary" onClick={() => void check()} disabled={checking}>{checking ? "Checking RCBC…" : "Check for new promos"}</button>
      </div>
    </div>
    {checked && <p className="note" role="status">{checked.error ? <span className="down">{checked.error}</span> : summary(checked.result!)}</p>}
    <div className="workspace">
      <div className="panel">
        <div className="panel-head"><h2>{SHOWS[show]} <span className="muted">{list.length} promo{list.length === 1 ? "" : "s"}</span></h2></div>
        {ledger.promos.length === 0 ? <div className="empty">
          <p>No promos yet.</p><p>Check for new promos reads every promo on RCBC&apos;s site; it takes about half a minute the first time.</p>
        </div> : list.length === 0 ? <div className="empty"><p>Nothing here with these filters.</p></div> : <div className="scroll">
          <table className="rows">
            <thead><tr><th>Promo</th><th>Kind</th><th className="hide-sm">Cards</th><th>Ends</th><th>Ours</th></tr></thead>
            <tbody>{list.map((p) => {
              const t = trackingOf(ledger, p.id);
              return <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}>
                <td className="title-cell">
                  <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setOpen(p.id); }}>{p.title}</button>
                  {isNew(p, ledger.promos, today) && <> <span className="chip new">New</span></>}
                  {p.summary && <span className="sub">{p.summary}</span>}
                </td>
                <td><KindChip kind={p.kind} /></td>
                <td className="hide-sm">{networkNames(p.networks)}</td>
                <td><Ends promo={p} today={today} /></td>
                <td className={t ? "" : "hide-sm"}>{t ? <StatusChip status={t.status} /> : <span className="muted">—</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </div>
    </div>
    <PromoPanel ledger={ledger} promoId={open} onClose={() => setOpen(null)} onEdit={(p) => { setOpen(null); setEditing(p); }} />
    <Drawer open={editing !== undefined} title={editing ? "Edit promo" : "Add a promo"} onClose={() => setEditing(undefined)}>
      {editing !== undefined && <PromoForm key={editing?.id ?? "new"} ledger={ledger} promo={editing} onDone={(id) => { setEditing(undefined); if (id) setOpen(id); }} />}
    </Drawer>
  </section>;
}

function summary(r: CheckResult): string {
  const parts = [[r.added, "new"], [r.updated, "updated"], [r.gone, "taken down"]].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  const failed = r.failed ? ` ${r.failed} page${r.failed === 1 ? "" : "s"} didn't load; they'll be read next time.` : "";
  return `Checked RCBC: ${parts.length ? parts.join(", ") : "nothing changed"}.${failed}`;
}

/** A promo heard about elsewhere (an email, a branch poster), or one added by hand being edited. */
function PromoForm({ ledger, promo, onDone }: { ledger: Ledger; promo: Promo | null; onDone: (id: string | null) => void }) {
  const [error, setError] = useState("");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "").trim();
    const fields: PromoFields = { title: get("title"), summary: get("summary"), url: get("url"), details: get("details"),
      kind: get("kind") as Kind, starts: get("starts"), ends: get("ends"), networks: NETWORKS.filter((n) => form.get(`net-${n}`)) };
    if (fields.starts && fields.ends && fields.ends < fields.starts) return setError("It can't end before it starts.");
    if (promo) {
      const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => JSON.stringify(promo[k as keyof Promo]) !== JSON.stringify(v)));
      if (Object.keys(changes).length === 0 || mutate({ type: "updatePromo", id: promo.id, changes, today: manilaToday() })) onDone(promo.id);
      return;
    }
    const base = fields.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "promo";
    const bank = get("bank") as keyof typeof BANKS;
    let slug = `mine-${base}`;
    for (let n = 2; ledger.promos.some((p) => p.id === `${bank}:${slug}`); n++) slug = `mine-${base}-${n}`;
    if (mutate({ type: "addPromo", bank, slug, fields, today: manilaToday() })) onDone(`${bank}:${slug}`);
  }
  const p = promo;
  return <form className="form" onSubmit={save}>
    {!p && <p className="muted note">For a promo that isn&apos;t on the bank&apos;s promo page. The ones that are come in with Check for new promos.</p>}
    <label>Title <input name="title" required maxLength={160} defaultValue={p?.title} {...focusHere()} placeholder="₱500 cashback on GrabFood" /></label>
    <div className="row">
      <label>Bank <select name="bank" defaultValue={p?.bank ?? "rcbc"} disabled={!!p}>
        {Object.entries(BANKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Kind <select name="kind" defaultValue={p?.kind ?? "cashback"}>
        {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select></label>
    </div>
    <div className="row">
      <label>Starts <input name="starts" type="date" defaultValue={p?.starts} /></label>
      <label>Ends <input name="ends" type="date" defaultValue={p?.ends} /></label>
    </div>
    <fieldset><legend>Card networks (none: any card)</legend>
      {NETWORKS.map((n: Network) => <label key={n} className="check"><input type="checkbox" name={`net-${n}`} defaultChecked={p?.networks.includes(n)} /> {NETWORK_LABEL[n]}</label>)}
    </fieldset>
    <label>Summary <input name="summary" maxLength={1000} defaultValue={p?.summary} /></label>
    <label>Link <input name="url" type="url" maxLength={500} defaultValue={p?.url} placeholder="https://" /></label>
    <label>Mechanics <textarea name="details" rows={8} maxLength={20000} defaultValue={p?.details} placeholder="Minimum spend, how to register, when the reward is credited…" /></label>
    {error && <p className="down" role="alert">{error}</p>}
    <div className="actions">
      <button type="button" onClick={() => onDone(null)}>Cancel</button>
      <button type="submit" className="primary push">{p ? "Save" : "Add promo"}</button>
    </div>
  </form>;
}
