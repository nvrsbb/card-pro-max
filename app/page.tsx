"use client";

// Overview: the promos we're in, how far each is, the rewards still to come, and what's ending soon for our cards.
import Link from "next/link";
import { useState } from "react";
import { useLedger, type Ledger, type Promo } from "@/lib/client";
import { nameOf, ownedCards } from "@/lib/cards";
import { daysBetween, manilaToday } from "@/lib/dates";
import { money } from "@/lib/format";
import { byEnding, cardsFor, daysLeft, isNew, isOn, progress, rewardTotals, trackingOf } from "@/lib/promos";
import { Card, Ends, KindChip, Meter } from "./components";
import { PromoPanel } from "./promo-panel";

/** How many days ahead counts as ending soon. */
const SOON_DAYS = 7;

export default function Overview() {
  const ledger = useLedger();
  const [open, setOpen] = useState<string | null>(null);
  if (!ledger) return <section className="page"><p className="muted">Loading…</p></section>;
  const today = manilaToday();
  const promo = (id: string) => ledger.promos.find((p) => p.id === id);
  const of = (status: string) => ledger.tracking.filter((t) => t.status === status).map((t) => promo(t.promo)).filter((p): p is Promo => !!p).sort(byEnding);
  const joined = of("joined");
  const earned = of("earned");
  const ours = ownedCards(ledger.cards);
  const forUs = ledger.promos.filter((p) => isOn(p, today) && (ours.length === 0 || cardsFor(p, ours).length > 0));
  const fresh = forUs.filter((p) => isNew(p, ledger.promos, today));
  const soon = forUs.filter((p) => { const left = daysLeft(p, today); return left !== null && left <= SOON_DAYS && (trackingOf(ledger, p.id)?.status ?? "watching") === "watching"; }).sort(byEnding);
  const { credited, waiting } = rewardTotals(ledger, today.slice(0, 4));
  const reached = joined.filter((p) => (progress(ledger, p.id).share ?? 0) >= 1).length;
  const expected = joined.reduce((n, p) => n + (trackingOf(ledger, p.id)?.reward ?? 0), 0);

  return <section className="page">
    <div className="cards">
      <Card label="Joined" value={String(joined.length)} hint={joined.length ? `${reached} reached the minimum · ${money(expected)} in rewards` : "Track a promo from Promos"} />
      <Card label="Earned, still to be credited" value={money(waiting)} hint={`${earned.length} promo${earned.length === 1 ? "" : "s"}`} />
      <Card label={`Credited in ${today.slice(0, 4)}`} value={money(credited)} />
      <Card label={ours.length ? "On now for our cards" : "On now"} value={String(forUs.length)} hint={fresh.length ? `${fresh.length} new this week` : undefined} />
    </div>
    <GettingStarted ledger={ledger} />
    <div className="workspace split">
      <div className="panel">
        <div className="panel-head"><h2>Joined <span className="muted">soonest-ending first</span></h2><Link href="/spending">Spending →</Link></div>
        {joined.length === 0 ? <div className="empty"><p>No promos joined yet.</p><p>Open one on <Link href="/promos">Promos</Link> and mark it Joined.</p></div> : <div className="scroll">
          <ul className="goal-list">{joined.map((p) => {
            const t = trackingOf(ledger, p.id)!;
            const { spent, goal, left, share } = progress(ledger, p.id);
            const days = daysLeft(p, today);
            // Behind: the minimum isn't met, and what's left of it per day is more than was spent per day so far.
            const ran = p.starts ? Math.max(daysBetween(p.starts, today), 1) : 0;
            const behind = share !== null && share < 1 && days !== null && ran > 0 && days >= 0 && left / Math.max(days, 1) > spent / ran;
            return <li key={p.id}>
              <div className="goal-top">
                <button type="button" className="link" onClick={() => setOpen(p.id)}>{p.title}</button>
                <Ends promo={p} today={today} />
              </div>
              {share !== null && <Meter share={share} />}
              <div className="goal-meta">
                <KindChip kind={p.kind} />
                {share !== null ? <span>{money(spent)} of {money(goal)}{left > 0 ? ` · ${money(left)} to go` : " · minimum reached ✓"}</span> : spent > 0 && <span>{money(spent)} spent</span>}
                {behind && <span className="ends soon">behind pace</span>}
                {t.reward > 0 && <span>reward {money(t.reward)}</span>}
                {t.card && <span>{nameOf(ledger, t.card)}</span>}
              </div>
            </li>;
          })}</ul>
        </div>}
      </div>
      <div className="stack-col">
        <div className="panel">
          <div className="panel-head"><h2>Waiting for the reward <span className="muted">{earned.length}</span></h2></div>
          {earned.length === 0 ? <p className="muted note">When a joined promo&apos;s terms are met, mark it Earned; it waits here until the bank credits it.</p> : <div className="scroll">
            <ul className="goal-list">{earned.map((p) => {
              const t = trackingOf(ledger, p.id)!;
              return <li key={p.id}><div className="goal-top">
                <button type="button" className="link" onClick={() => setOpen(p.id)}>{p.title}</button>
                <span className="num">{money(t.reward)}</span>
              </div>{t.note && <div className="goal-meta">{t.note}</div>}</li>;
            })}</ul>
          </div>}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Ending this week <span className="muted">not joined</span></h2><Link href="/promos">All promos →</Link></div>
          {soon.length === 0 ? <p className="muted note">Nothing for our cards ends in the next {SOON_DAYS} days.</p> : <div className="scroll">
            <ul className="goal-list">{soon.map((p) => <li key={p.id}><div className="goal-top">
              <button type="button" className="link" onClick={() => setOpen(p.id)}>{p.title}</button>
              <Ends promo={p} today={today} />
            </div></li>)}</ul>
          </div>}
        </div>
      </div>
    </div>
    <PromoPanel ledger={ledger} promoId={open} onClose={() => setOpen(null)} />
  </section>;
}

/** Until there are cards and promos: the two steps that make the rest work. */
function GettingStarted({ ledger }: { ledger: Ledger }) {
  const ours = ownedCards(ledger.cards).length;
  if (ours > 0 && ledger.promos.length > 0) return null;
  return <div className="panel">
    <div className="panel-head"><h2>Getting started</h2></div>
    <ol className="note getting-started">
      <li className={ledger.promos.length ? "muted" : ""}>{ledger.promos.length ? "✓ Promos are in." : <>On <Link href="/promos">Promos</Link>, tap <b>Check for new promos</b> to bring in everything on RCBC&apos;s site.</>}</li>
      <li className={ours ? "muted" : ""}>{ours ? "✓ Cards are in." : <>On <Link href="/cards">Cards</Link>, tag the cards you each hold, so Promos shows only what they can use.</>}</li>
    </ol>
  </div>;
}
