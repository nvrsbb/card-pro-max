"use client";

// Cards: the cards we hold. Each one shows the promos it can use now and the ones we've joined on it.
import { useState, type FormEvent } from "react";
import { BANKS, mutate, NETWORKS, NETWORK_LABEL, newId, type Card as CardT, type Ledger, type Network, useLedger } from "@/lib/client";
import { manilaToday } from "@/lib/dates";
import { cardsFor, isOn } from "@/lib/promos";
import { Drawer, focusHere } from "../components";
import { PromoPanel } from "../promo-panel";

// RCBC's cards, as its promo mechanics list them, for adding with one tap. The network is the one in each name.
const RCBC_CARDS: { name: string; network: Network }[] = [
  { name: "RCBC Visa Infinite", network: "visa" },
  { name: "RCBC Airmiles Visa Signature", network: "visa" },
  { name: "RCBC World Mastercard", network: "mastercard" },
  { name: "RCBC Mastercard Platinum", network: "mastercard" },
  { name: "RCBC JCB Platinum", network: "jcb" },
  { name: "RCBC UnionPay Diamond", network: "unionpay" },
];

export default function CardsPage() {
  const ledger = useLedger();
  const [editing, setEditing] = useState<CardT | null | undefined>(undefined); // undefined: closed; null: new
  const [open, setOpen] = useState<string | null>(null);
  if (!ledger) return <section className="page"><p className="muted">Loading…</p></section>;
  const today = manilaToday();
  const on = ledger.promos.filter((p) => isOn(p, today));

  return <section className="page">
    <div className="page-head">
      <p className="muted grow">The cards we hold. Promos shows only what these can use.</p>
      <div className="head-actions"><button type="button" className="primary" onClick={() => setEditing(null)}>Add card</button></div>
    </div>
    {ledger.cards.length === 0 ? <div className="panel"><div className="empty">
      <p>No cards yet.</p><p>Add the cards you hold: tap Add card, or pick one of RCBC&apos;s there.</p>
    </div></div> : <div className="scroll-page card-grid">
      {[...ledger.cards].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
        const usable = on.filter((p) => cardsFor(p, [c]).length > 0);
        const joined = ledger.tracking.filter((t) => t.card === c.id && (t.status === "joined" || t.status === "earned"));
        return <div className="panel card-tile" key={c.id}>
          <span className="net">{BANKS[c.bank]} · {NETWORK_LABEL[c.network]}</span>
          <div className="panel-head"><h2>{c.name}</h2>
            <button type="button" className="icon-btn" aria-label={`Edit ${c.name}`} title="Edit" onClick={() => setEditing(c)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" /></svg>
            </button>
          </div>
          {c.note && <p className="muted note">{c.note}</p>}
          <p className="note">{usable.length} promo{usable.length === 1 ? "" : "s"} on now · {joined.length} joined</p>
          {joined.length > 0 && <ul>{joined.map((t) => {
            const p = ledger.promos.find((x) => x.id === t.promo);
            return p && <li key={t.promo}><span><button type="button" className="link" onClick={() => setOpen(p.id)}>{p.title}</button></span><span className="muted">{t.status}</span></li>;
          })}</ul>}
        </div>;
      })}
    </div>}
    <Drawer open={editing !== undefined} title={editing ? "Edit card" : "Add a card"} onClose={() => setEditing(undefined)}>
      {editing !== undefined && <CardForm key={editing?.id ?? "new"} ledger={ledger} card={editing} onDone={() => setEditing(undefined)} />}
    </Drawer>
    <PromoPanel ledger={ledger} promoId={open} onClose={() => setOpen(null)} />
  </section>;
}

function CardForm({ ledger, card, onDone }: { ledger: Ledger; card: CardT | null; onDone: () => void }) {
  const [armed, setArmed] = useState(false);
  const missing = RCBC_CARDS.filter((p) => !ledger.cards.some((c) => c.name === p.name));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = { bank: "rcbc" as const, name: String(form.get("name") ?? "").trim(), network: String(form.get("network")) as Network, note: String(form.get("note") ?? "").trim() };
    if (!card) { if (mutate({ type: "addCard", id: newId(), fields })) onDone(); return; }
    const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => card[k as keyof CardT] !== v));
    if (Object.keys(changes).length === 0 || mutate({ type: "updateCard", id: card.id, changes })) onDone();
  }
  return <>
    {!card && missing.length > 0 && <section>
      <h3>RCBC cards <span className="muted">tap to add</span></h3>
      <div className="form"><div className="actions">
        {missing.map((p) => <button key={p.name} type="button" onClick={() => mutate({ type: "addCard", id: newId(), fields: { bank: "rcbc", name: p.name, network: p.network, note: "" } })}>
          {p.name.replace(/^RCBC /, "")}</button>)}
      </div></div>
    </section>}
    <section>
      {!card && <h3>Or any card</h3>}
      <form className="form" onSubmit={save}>
        <label>Name <input name="name" required maxLength={160} defaultValue={card?.name} {...focusHere(!!card)} placeholder="RCBC Flex Visa" /></label>
        <label>Network <select name="network" defaultValue={card?.network ?? "visa"}>
          {NETWORKS.map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
        </select></label>
        <label>Note <input name="note" maxLength={500} defaultValue={card?.note} placeholder="Whose, which supplementary, its limit…" /></label>
        <div className="actions">
          {card && <button type="button" className="danger" onClick={() => { if (!armed) return setArmed(true); if (mutate({ type: "deleteCard", id: card.id })) onDone(); }}>
            {armed ? "Click again to remove" : "Remove card"}</button>}
          <button type="button" onClick={onDone}>{card ? "Cancel" : "Done"}</button>
          <button type="submit" className="primary push">{card ? "Save" : "Add card"}</button>
        </div>
      </form>
    </section>
  </>;
}
