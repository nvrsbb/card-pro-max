"use client";

// Spending: everything we spent toward a promo's minimum, newest first. Logged here or from a promo's side panel.
import { useState, type FormEvent } from "react";
import { mutate, newId, type Ledger, type Spend, useLedger } from "@/lib/client";
import { manilaToday, shortDate } from "@/lib/dates";
import { money, parseAmount } from "@/lib/format";
import { OPEN, trackingOf } from "@/lib/promos";
import { Card, Drawer, focusHere } from "../components";
import { PromoPanel } from "../promo-panel";

export default function SpendingPage() {
  const ledger = useLedger();
  const [promoFilter, setPromoFilter] = useState("");
  const [editing, setEditing] = useState<Spend | null | undefined>(undefined); // undefined: closed; null: new
  const [open, setOpen] = useState<string | null>(null);
  if (!ledger) return <section className="page"><p className="muted">Loading…</p></section>;
  const today = manilaToday();
  const title = (id: string) => ledger.promos.find((p) => p.id === id)?.title ?? "A removed promo";
  const cardName = (id: string) => ledger.cards.find((c) => c.id === id)?.name ?? (id ? "A removed card" : "");
  const rows = ledger.spend.filter((s) => !promoFilter || s.promo === promoFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const month = today.slice(0, 7);
  const thisMonth = ledger.spend.filter((s) => s.date.startsWith(month)).reduce((n, s) => n + s.amount, 0);
  const total = rows.reduce((n, s) => n + s.amount, 0);
  const withSpend = [...new Set(ledger.spend.map((s) => s.promo))];

  return <section className="page">
    <div className="page-head">
      <div className="filters">
        <select aria-label="Promo" value={promoFilter} onChange={(e) => setPromoFilter(e.target.value)}>
          <option value="">Every promo</option>
          {withSpend.map((id) => [id, title(id)]).sort((a, b) => a[1].localeCompare(b[1])).map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
      </div>
      <div className="head-actions">
        <button type="button" className="primary" onClick={() => setEditing(null)}>Log spending</button>
      </div>
    </div>
    <div className="cards">
      <Card label="Spent toward promos this month" value={money(thisMonth)} />
      <Card label={promoFilter ? "Spent on this promo" : "Spent toward promos, all time"} value={money(total)} hint={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`} />
    </div>
    <div className="workspace">
      <div className="panel">
        <div className="panel-head"><h2>Spending</h2></div>
        {rows.length === 0 ? <div className="empty"><p>Nothing logged yet.</p><p>Log what you spend on a card toward a promo&apos;s minimum, and the Overview shows how far you are.</p></div> : <div className="scroll">
          <table className="rows">
            <thead><tr><th>Promo</th><th className="hide-sm">Date</th><th className="hide-sm">Card</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{rows.map((s) => <tr key={s.id}>
              <td className="title-cell">
                <button type="button" className="link" onClick={() => setOpen(s.promo)}>{title(s.promo)}</button>
                <span className="sub">{[shortDate(s.date, today), cardName(s.card), s.note].filter(Boolean).join(" · ")}</span>
              </td>
              <td className="hide-sm">{shortDate(s.date, today)}</td>
              <td className="hide-sm">{cardName(s.card) || <span className="muted">—</span>}</td>
              <td className="num">{money(s.amount)}</td>
              <td><button type="button" className="icon-btn" aria-label="Edit" title="Edit" onClick={() => setEditing(s)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" /></svg>
              </button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </div>
    <Drawer open={editing !== undefined} title={editing ? "Edit spending" : "Log spending"} onClose={() => setEditing(undefined)}>
      {editing !== undefined && <SpendForm key={editing?.id ?? "new"} ledger={ledger} spend={editing} promo={promoFilter} onDone={() => setEditing(undefined)} />}
    </Drawer>
    <PromoPanel ledger={ledger} promoId={open} onClose={() => setOpen(null)} />
  </section>;
}

function SpendForm({ ledger, spend, promo, onDone }: { ledger: Ledger; spend: Spend | null; promo: string; onDone: () => void }) {
  const [error, setError] = useState("");
  const [armed, setArmed] = useState(false);
  // Promos we're in (or the one this row is for), soonest-ending first.
  const choices = ledger.promos.filter((p) => p.id === spend?.promo || OPEN.includes(trackingOf(ledger, p.id)?.status ?? "skipped"))
    .sort((a, b) => (a.ends || "9999").localeCompare(b.ends || "9999"));
  const [promoId, setPromoId] = useState(spend?.promo ?? (promo || choices[0]?.id || ""));

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = parseAmount(String(form.get("amount") ?? ""));
    if (!promoId) return setError("Pick the promo it counts toward.");
    if (!(amount > 0)) return setError("Type the amount spent.");
    const fields = { date: String(form.get("date")), promo: promoId, card: String(form.get("card") ?? ""), amount, note: String(form.get("note") ?? "").trim() };
    if (!spend) { if (mutate({ type: "addSpend", id: newId(), fields, created: new Date().toISOString() })) onDone(); return; }
    const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => spend[k as keyof Spend] !== v));
    if (Object.keys(changes).length === 0 || mutate({ type: "updateSpend", id: spend.id, changes })) onDone();
  }

  if (choices.length === 0) return <p className="muted">Track a promo first: open one on Promos and mark it Joined. Spending counts toward a promo&apos;s minimum.</p>;
  return <form className="form" onSubmit={save}>
    <label>Promo <select value={promoId} onChange={(e) => setPromoId(e.target.value)}>
      {choices.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select></label>
    <div className="row">
      <label>Amount <input className="amount" name="amount" inputMode="decimal" required defaultValue={spend?.amount} {...focusHere()} /></label>
      <label>Date <input name="date" type="date" required defaultValue={spend?.date ?? manilaToday()} /></label>
    </div>
    <label>Card <select name="card" key={promoId} defaultValue={spend?.card ?? trackingOf(ledger, promoId)?.card ?? ""}>
      <option value="">—</option>
      {ledger.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    <label>Note <input name="note" maxLength={500} defaultValue={spend?.note} placeholder="Where, what" /></label>
    {error && <p className="down" role="alert">{error}</p>}
    <div className="actions">
      {spend && <button type="button" className="danger" onClick={() => { if (!armed) return setArmed(true); if (mutate({ type: "deleteSpend", id: spend.id })) onDone(); }}>
        {armed ? "Click again to delete" : "Delete"}</button>}
      <button type="button" onClick={onDone}>Cancel</button>
      <button type="submit" className="primary push">{spend ? "Save" : "Log spending"}</button>
    </div>
  </form>;
}
