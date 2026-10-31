"use client";

// One promo in the side panel: what the bank says, where we are with it, and the spending toward its minimum.
// Opened from every page that lists promos.
import { useState, type FormEvent } from "react";
import { BANKS, cardName, mutate, newId, STATUSES, STATUS_LABEL, type Ledger, type Promo, type Status } from "@/lib/client";
import { manilaToday, shortDate } from "@/lib/dates";
import { money, parseAmount } from "@/lib/format";
import { cardsFor, guessTerms, progress, spendOn, trackingOf } from "@/lib/promos";
import { allCards, holders, nameOf, ownedCards, ownerNames } from "@/lib/cards";
import { CardOptions, Drawer, Ends, focusHere, KindChip, Meter, networkNames, StatusChip } from "./components";

export function PromoPanel({ ledger, promoId, onClose, onEdit }: { ledger: Ledger; promoId: string | null; onClose: () => void; onEdit?: (promo: Promo) => void }) {
  const promo = promoId ? ledger.promos.find((p) => p.id === promoId) : undefined;
  return <Drawer open={!!promo} title={promo ? `${BANKS[promo.bank]} promo` : "Promo"} onClose={onClose} wide>
    {promo && <PromoBody key={promo.id} ledger={ledger} promo={promo} onEdit={onEdit} onDeleted={onClose} />}
  </Drawer>;
}

function PromoBody({ ledger, promo, onEdit, onDeleted }: { ledger: Ledger; promo: Promo; onEdit?: (promo: Promo) => void; onDeleted: () => void }) {
  const today = manilaToday();
  const tracking = trackingOf(ledger, promo.id);
  const ours = cardsFor(promo, ownedCards(ledger.cards));
  const anyOurs = ownedCards(ledger.cards).length > 0;
  const [armed, setArmed] = useState(false);
  return <>
    <section className="promo-head">
      {/* No picture: RCBC's images are same-site only (cross-origin-resource-policy), so browsers won't show them here. */}
      <h3>{promo.title}</h3>
      <div><KindChip kind={promo.kind} />{tracking && <StatusChip status={tracking.status} />}{promo.gone && <span className="chip">Taken down {shortDate(promo.gone, today)}</span>}</div>
      {promo.summary && <p className="muted">{promo.summary}</p>}
      <dl className="promo-facts">
        <dt>Period</dt><dd>{promo.period || (promo.starts || promo.ends ? `${shortDate(promo.starts, today) || "…"} – ${shortDate(promo.ends, today) || "…"}` : "Not stated")}</dd>
        <dt>Ends</dt><dd><Ends promo={promo} today={today} /></dd>
        <dt>Networks</dt><dd>{networkNames(promo.networks)}</dd>
        <dt>Our cards</dt><dd>{!anyOurs ? <span className="muted">Tag your cards on the Cards page</span> : ours.length ? ours.map((c) => `${cardName(c)} (${ownerNames(c, holders(ledger))})`).join(", ") : <span className="muted">None of our cards</span>}</dd>
        {promo.permit && <><dt>DTI permit</dt><dd>{promo.permit}</dd></>}
        {promo.url && <><dt>Source</dt><dd><a href={promo.url} target="_blank" rel="noreferrer">{promo.manual ? promo.url : `On ${BANKS[promo.bank]}'s site ↗`}</a></dd></>}
      </dl>
      {promo.manual && <div className="form"><div className="actions">
        {onEdit && <button type="button" onClick={() => onEdit(promo)}>Edit promo</button>}
        <button type="button" className="danger" onClick={() => {
          if (!armed) return setArmed(true); // a second click confirms
          if (mutate({ type: "deletePromo", id: promo.id })) onDeleted();
        }}>{armed ? "Click again: deletes it and its spending" : "Delete promo"}</button>
      </div></div>}
    </section>
    <TrackForm ledger={ledger} promo={promo} />
    {tracking && tracking.status !== "watching" && tracking.status !== "skipped" && <SpendSection ledger={ledger} promo={promo} />}
    {promo.details && <section>
      <h3>Mechanics <span className="muted">as {BANKS[promo.bank]} wrote them</span></h3>
      <div className="mechanics">{promo.details}</div>
    </section>}
  </>;
}

/** Where we are with the promo. Untracked, it starts from the minimum spend and reward the mechanics seem to say. */
function TrackForm({ ledger, promo }: { ledger: Ledger; promo: Promo }) {
  const tracking = trackingOf(ledger, promo.id);
  const guess = guessTerms(`${promo.summary}\n${promo.details}`);
  const ours = cardsFor(promo, ownedCards(ledger.cards));
  const [status, setStatus] = useState<Status>(tracking?.status ?? "joined");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const goal = parseAmount(String(form.get("goal") ?? "")) || 0;
    const reward = parseAmount(String(form.get("reward") ?? "")) || 0;
    if (goal < 0 || reward < 0) return setError("Amounts can't be below zero.");
    setError("");
    const ok = mutate({ type: "track", promo: promo.id, today: manilaToday(),
      fields: { status, card: String(form.get("card") ?? ""), goal, reward, note: String(form.get("note") ?? "").trim() } });
    setSaved(ok);
  }

  // Our cards the promo fits come first; then our others, in case the bank's networks list is off; then the rest
  // (to track a promo for a card we might get).
  const others = ownedCards(ledger.cards).filter((c) => !ours.includes(c));
  const rest = allCards(ledger).filter((c) => c.owners.length === 0);
  return <section>
    <h3>Where we are {tracking && <span className="muted">since {shortDate(tracking.updated)}</span>}</h3>
    <form className="form" onSubmit={save} onChange={() => setSaved(false)}>
      <div className="segmented" role="group" aria-label="Status">
        {STATUSES.map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setSaved(false); }}>{STATUS_LABEL[s]}</button>)}
      </div>
      <label>Card
        <select name="card" defaultValue={tracking?.card ?? (ours.length === 1 ? ours[0].id : "")}>
          <option value="">Not decided</option>
          {ours.length > 0 && <optgroup label="Ours that fit this promo">{ours.map((c) => <option key={c.id} value={c.id}>{cardName(c)}</option>)}</optgroup>}
          {others.length > 0 && <optgroup label="Our other cards">{others.map((c) => <option key={c.id} value={c.id}>{cardName(c)}</option>)}</optgroup>}
          {rest.length > 0 && <optgroup label="Not ours">{rest.map((c) => <option key={c.id} value={c.id}>{cardName(c)}</option>)}</optgroup>}
        </select>
      </label>
      <div className="row">
        <label>Minimum spend <input className="amount" name="goal" inputMode="decimal" defaultValue={tracking ? tracking.goal || "" : guess.goal || ""} placeholder="None" /></label>
        <label>Reward (₱ value) <input className="amount" name="reward" inputMode="decimal" defaultValue={tracking ? tracking.reward || "" : guess.reward || ""} placeholder="0" /></label>
      </div>
      {!tracking && (guess.goal > 0 || guess.reward > 0) && <p className="hint">Guessed from the mechanics: check them below.</p>}
      <label>Note <input name="note" maxLength={1000} defaultValue={tracking?.note ?? ""} placeholder="Registered by SMS on Oct 20, promo code…" /></label>
      {error && <p className="down" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary">{tracking ? "Save" : "Track this promo"}</button>
        {saved && <span className="up note" role="status">Saved ✓</span>}
        {tracking && <button type="button" className="push" onClick={() => mutate({ type: "untrack", promo: promo.id })}
          title="Forget what we said about it (its spending stays)">Stop tracking</button>}
      </div>
    </form>
  </section>;
}

/** Spending toward the minimum: how far, the rows, and a quick add. */
function SpendSection({ ledger, promo }: { ledger: Ledger; promo: Promo }) {
  const tracking = trackingOf(ledger, promo.id)!;
  const { spent, goal, left, share } = progress(ledger, promo.id);
  const rows = spendOn(ledger, promo.id).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const name = (id: string) => nameOf(ledger, id);
  const [error, setError] = useState("");

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const el = event.currentTarget;
    const form = new FormData(el);
    const amount = parseAmount(String(form.get("amount") ?? ""));
    if (!(amount > 0)) return setError("Type the amount spent.");
    setError("");
    if (mutate({ type: "addSpend", id: newId(), created: new Date().toISOString(),
      fields: { date: String(form.get("date")), promo: promo.id, card: String(form.get("card") ?? ""), amount, note: String(form.get("note") ?? "").trim() } })) {
      (el.elements.namedItem("amount") as HTMLInputElement).value = "";
      (el.elements.namedItem("note") as HTMLInputElement).value = "";
    }
  }

  return <section>
    <h3>Spending toward it <span className="muted">{money(spent)}{goal > 0 && ` of ${money(goal)}`}</span></h3>
    {share !== null && <><Meter share={share} /><p className="note muted">{left > 0 ? `${money(left)} to go` : "Minimum reached: mark it Earned once the bank confirms."}</p></>}
    {rows.length > 0 && <table className="spend-mini"><tbody>
      {rows.map((s) => <tr key={s.id}>
        <td>{shortDate(s.date)}</td>
        <td className="wrap">{s.note || <span className="muted">{name(s.card) || "—"}</span>}{s.note && s.card && <span className="sub">{name(s.card)}</span>}</td>
        <td className="num">{money(s.amount)}</td>
        <td><button type="button" className="icon-btn" aria-label="Delete this spending" title="Delete" onClick={() => mutate({ type: "deleteSpend", id: s.id })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></td>
      </tr>)}
    </tbody></table>}
    <form className="form" onSubmit={add}>
      <div className="row">
        <label>Amount <input className="amount" name="amount" inputMode="decimal" required {...focusHere(false)} /></label>
        <label>Date <input name="date" type="date" required defaultValue={manilaToday()} /></label>
      </div>
      <div className="row">
        <label>Card <select name="card" defaultValue={tracking.card}>
          <option value="">—</option>
          <CardOptions ledger={ledger} keep={tracking.card} />
        </select></label>
        <label>Note <input name="note" maxLength={500} placeholder="Where, what" /></label>
      </div>
      {error && <p className="down" role="alert">{error}</p>}
      <div className="actions"><button type="submit">Log spending</button></div>
    </form>
  </section>;
}
