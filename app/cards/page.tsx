"use client";

// Cards: every card, tagged by whose it is (or not ours). Ours decide which promos show; the others show what we'd get.
import { useState, type FormEvent } from "react";
import { BANKS, cardId, cardName, mutate, NETWORKS, NETWORK_LABEL, type Bank, type Card as CardT, type Ledger, type Network, useLedger } from "@/lib/client";
import { allCards, BANK_CARDS, holders, ownedCards, tagOp } from "@/lib/cards";
import { manilaToday } from "@/lib/dates";
import { cardsFor, isOn } from "@/lib/promos";
import { Drawer, focusHere } from "../components";
import { PromoPanel } from "../promo-panel";

// Types as each bank names them, offered as you type; any other is fine too.
const typesOf = (bank: Bank) => [...new Set(BANK_CARDS.filter((c) => c.bank === bank).map((c) => c.type))].sort();

export default function CardsPage() {
  const ledger = useLedger();
  const [whose, setWhose] = useState("all"); // all, ours, a person's id, or none (not ours)
  const [bank, setBank] = useState<Bank | "">("");
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<CardT | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!ledger) return <section className="page"><p className="muted">Loading…</p></section>;
  const today = manilaToday();
  const on = ledger.promos.filter((p) => isOn(p, today));
  const people = holders(ledger);
  const cards = allCards(ledger).filter((c) => !bank || c.bank === bank).filter((c) => whose === "all" || (whose === "ours" ? c.owners.length > 0 : whose === "none" ? c.owners.length === 0 : c.owners.includes(whose)));
  const tag = (card: CardT, person: string) => {
    const owners = card.owners.includes(person) ? card.owners.filter((o) => o !== person) : [...card.owners, person];
    mutate(tagOp(ledger, card, people.map((x) => x.id).filter((id) => owners.includes(id))));
  };

  return <section className="page">
    <div className="page-head">
      <div className="filters">
        <div className="segmented" role="group" aria-label="Whose cards">
          {[["all", "All"], ["ours", "Ours"], ...(people.length > 1 ? people.map((x) => [x.id, x.name]) : []), ["none", "Not ours"]].map(([id, label]) =>
            <button key={id} type="button" aria-pressed={whose === id} onClick={() => setWhose(id)}>{label}</button>)}
        </div>
        <select aria-label="Bank" value={bank} onChange={(e) => setBank(e.target.value as Bank | "")}>
          <option value="">All banks</option>
          {(Object.keys(BANKS) as Bank[]).map((b) => <option key={b} value={b}>{BANKS[b]}</option>)}
        </select>
      </div>
      <div className="head-actions"><button type="button" className="primary" onClick={() => setAdding(true)}>Add card</button></div>
    </div>
    <div className="workspace">
      <div className="panel">
        <div className="panel-head"><h2>Cards <span className="muted">{ownedCards(allCards(ledger)).length} ours · tap a name under Whose to tag it; none is not ours</span></h2></div>
        {cards.length === 0 ? <div className="empty"><p>No cards here.</p></div> : <div className="scroll">
          <table className="rows">
            <thead><tr><th>Card</th><th>Whose</th><th className="num hide-sm">On now</th><th className="num hide-sm">Joined</th></tr></thead>
            <tbody>{cards.map((c) => {
              const usable = on.filter((p) => cardsFor(p, [c]).length > 0).length;
              const joined = ledger.tracking.filter((t) => t.card === c.id && (t.status === "joined" || t.status === "earned")).length;
              return <tr key={c.id}>
                <td className="title-cell">
                  <button type="button" className="link" onClick={() => setShown(c)}>{cardName(c)}</button>
                  <span className="sub">{usable} promo{usable === 1 ? "" : "s"} on now{joined ? ` · ${joined} joined` : ""}</span>
                </td>
                <td><span className="tags" role="group" aria-label={`Whose ${cardName(c)} is`}>
                  {people.map((x) => <button key={x.id} type="button" className="tag" aria-pressed={c.owners.includes(x.id)} onClick={() => tag(c, x.id)}>{x.name}</button>)}
                  {c.owners.length === 0 && <span className="chip">Not ours</span>}
                </span></td>
                <td className="num hide-sm">{usable}</td>
                <td className="num hide-sm">{joined || <span className="muted">—</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </div>
    </div>
    <Drawer open={adding} title="Add a card" onClose={() => setAdding(false)}>
      {adding && <CardForm ledger={ledger} bank={bank || "rcbc"} onDone={() => setAdding(false)} />}
    </Drawer>
    <Drawer open={!!shown} title={shown ? cardName(shown) : "Card"} onClose={() => setShown(null)}>
      {shown && <CardPromos ledger={ledger} card={shown} onOpen={(id) => { setShown(null); setOpen(id); }} />}
    </Drawer>
    <PromoPanel ledger={ledger} promoId={open} onClose={() => setOpen(null)} />
  </section>;
}

/** Just what makes a card: bank, type and network, and whose it is. One already listed is tagged instead. */
function CardForm({ ledger, bank: first, onDone }: { ledger: Ledger; bank: Bank; onDone: () => void }) {
  const people = holders(ledger);
  const [bank, setBank] = useState(first);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bank = String(form.get("bank")) as Bank;
    const type = String(form.get("type") ?? "").trim().replace(/\s+/g, " ");
    const network = String(form.get("network")) as Network;
    const owners = people.map((x) => x.id).filter((id) => form.get(`owner-${id}`));
    const id = cardId(bank, type, network);
    const known = allCards(ledger).find((c) => c.id === id);
    if (mutate(tagOp(ledger, known ?? { id, bank, type, network, owners: [] }, owners))) onDone();
  }
  return <form className="form" onSubmit={save}>
    <div className="row">
      <label>Bank <select name="bank" value={bank} onChange={(e) => setBank(e.target.value as Bank)}>
        {Object.entries(BANKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Network <select name="network" defaultValue="visa">
        {NETWORKS.map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
      </select></label>
    </div>
    <label>Type <input name="type" required maxLength={60} list="card-types" placeholder="Flex, Gold, Platinum…" {...focusHere()} /></label>
    <datalist id="card-types">{typesOf(bank).map((t) => <option key={t} value={t} />)}</datalist>
    <fieldset><legend>Whose (none: not ours)</legend>
      {people.map((x) => <label key={x.id} className="check"><input type="checkbox" name={`owner-${x.id}`} defaultChecked /> {x.name}</label>)}
    </fieldset>
    <div className="actions">
      <button type="button" onClick={onDone}>Cancel</button>
      <button type="submit" className="primary push">Add card</button>
    </div>
  </form>;
}

/** The promos on now that a card can use, soonest-ending first. */
function CardPromos({ ledger, card, onOpen }: { ledger: Ledger; card: CardT; onOpen: (id: string) => void }) {
  const today = manilaToday();
  const list = ledger.promos.filter((p) => isOn(p, today) && cardsFor(p, [card]).length > 0)
    .sort((a, b) => (a.ends || "9999").localeCompare(b.ends || "9999"));
  return <section>
    <h3>On now for this card <span className="muted">{list.length}</span></h3>
    {list.length === 0 ? <p className="muted">Nothing on now.</p> : <ul className="goal-list">
      {list.map((p) => <li key={p.id}><div className="goal-top"><button type="button" className="link" onClick={() => onOpen(p.id)}>{p.title}</button></div></li>)}
    </ul>}
  </section>;
}
