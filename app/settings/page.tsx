"use client";

// Settings: light or dark for this browser, and where the data lives.
import { useLedger, useLedgerStatus } from "@/lib/client";
import { ownedCards } from "@/lib/cards";
import { ThemePicker } from "../theme-picker";

export default function SettingsPage() {
  const ledger = useLedger();
  const { source } = useLedgerStatus();
  return <section className="page">
    <div className="workspace thirds top">
      <div className="panel">
        <div className="panel-head"><h2>Look</h2></div>
        <dl className="settings-list">
          <div><dt>Light or dark</dt><dd><ThemePicker /></dd></div>
        </dl>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>Who&apos;s who</h2></div>
        <dl className="settings-list">
          {!ledger ? <div><dd>Loading…</dd></div> : ledger.people.length === 0 ? <div><dd>Nobody named yet: add people to <code>settings.json</code> in the ledger (see its README). Until then cards are just Ours or Not ours.</dd></div>
            : ledger.people.map((x) => <div key={x.id}><dt>{x.name}</dt><dd>Logs in with the {x.login === "admin" ? "admin password (also sees the Tracker)" : "household password"}; their edits say &quot;by {x.name}&quot;.</dd></div>)}
        </dl>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>Where the data lives</h2></div>
        <dl className="settings-list">
          <div><dt>Ledger</dt><dd>{!source ? "Loading…" : source.kind === "github"
            ? <>The private repo <a href={source.url} target="_blank" rel="noreferrer">{source.repo}</a>: every edit is one commit, so its history is the record of every change.</>
            : <>The local folder <code>{source.dir}</code> (development).</>}</dd></div>
          <div><dt>Promos</dt><dd>{ledger ? `${ledger.promos.length} in the catalog, from RCBC's promo page; checked every morning and whenever you tap Check for new promos.` : "Loading…"}</dd></div>
          <div><dt>Ours</dt><dd>{ledger ? `${ownedCards(ledger.cards).length} cards, ${ledger.tracking.length} promos tracked, ${ledger.spend.length} spending entries.` : "Loading…"}</dd></div>
        </dl>
      </div>
    </div>
  </section>;
}
