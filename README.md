# Card Pro Max

Credit card promos worth chasing: what's on for the cards we hold, what we've joined, how far we are toward each
minimum spend, and the rewards still to come. Starting with **RCBC**; built so more banks can follow.

- **Overview**: promos joined (soonest-ending first) with progress toward their minimum spend and a "behind pace"
  note, rewards earned but not yet credited, rewards credited this year, and promos for our cards ending this week.
- **Promos**: the catalog, on now for our cards by default; search, filter by kind (cashback, discount, 0% installment,
  freebie, points, raffle) or show new, upcoming, tracked or past. A promo opens in a side panel with its period,
  networks, our cards that fit, DTI permit and the bank's mechanics; mark it Watching / Joined / Earned / Credited /
  Skipped, with the card, minimum spend and reward (guessed from the mechanics to start with), and log spending toward it.
  **Check for new promos** reads RCBC's promo page now; it's also checked every morning.
- **Spending**: everything spent toward a promo's minimum.
- **Cards**: the cards we hold (one tap for RCBC's premium cards), each with the promos it can use.
- **Settings**: light or dark, and where the data lives.
- **Tracker** (admin only): what to build next.

## Where the data lives

This repo is public and holds no personal data. Everything is plain files in a separate **private** repo (the
"ledger"); every edit in the app is one commit there, so its history is the audit log.

```
promos/rcbc.json     the catalog: every promo seen on rcbccredit.com/promos (and any added by hand)
cards.csv            id,bank,name,network,note
tracking.csv         promo,status,card,goal,reward,note,updated      (status: watching, joined, earned, credited, skipped)
spend/2026.csv       id,date,promo,card,amount,note,created          (one file per year)
tracker.json         the admin's feature tracker (once it's first edited)
```

Without `LEDGER_REPO` the app uses a local folder (`.ledger/`, or `LEDGER_DIR`) instead, for development.

### How promos come in

`lib/rcbc.ts` reads RCBC's public promo list and each promo's page (pure functions, tested on samples);
`lib/import.ts` fetches them; `mergeImport` in `lib/promos.ts` adds new promos, refreshes changed ones, re-reads
each page weekly (and when a still-listed promo is past its end date, as it was likely extended), and marks promos the
bank takes down as gone. Untracked promos are dropped 180 days after they end; tracked ones stay.

## Settings (environment variables, set in Vercel)

| Variable | Meaning |
|---|---|
| `LEDGER_REPO` | `owner/name` of the private ledger repo, e.g. `nvrsbb/card-pro-max-ledger` |
| `LEDGER_BRANCH` | Branch to read and write. Default `main` |
| `LEDGER_GITHUB_TOKEN` | Fine-grained token with access to **only** the ledger repo and **Contents: Read and write** |
| `DASHBOARD_PASSWORD` | The login password. The only thing protecting your data, so make it long |
| `ADMIN_PASSWORD` | Optional. The owner's own password: logs in as admin, which adds the Tracker |
| `SESSION_SECRET` | Random string that signs the login cookie (`openssl rand -hex 32`) |
| `CRON_SECRET` | Random string; Vercel sends it with the daily check (`vercel.json` crons). Without it the daily check is off |

In production the site needs `DASHBOARD_PASSWORD` and `SESSION_SECRET`, or the login page says it isn't set up.
In development, leaving `DASHBOARD_PASSWORD` unset skips the login.

## Run it

```bash
npm install
npm run dev                # http://localhost:3000, data in .ledger/
npm test                   # parser, ledger and promo rules
npx tsc --noEmit -p . && npx eslint .
npm run import:rcbc        # check RCBC from the command line, into the configured ledger
```

## Design

Same design system as [Budge](https://github.com/nvrsbb/budge) and ibkr: a sidebar (72px icon rail, widens on
hover/focus, pin button, mobile drawer), pages that fit one screen with long lists scrolling in their panel, helpers in
a right-side panel, and palette-builder's earth-tone colour tokens in light and dark (`app/globals.css`).
