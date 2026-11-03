# Card Pro Max

Credit card promos worth chasing: what's on for the cards we hold, what we've joined, how far we are toward each
minimum spend, and the rewards still to come. Banks: **RCBC**, **EastWest**, **BPI** and **Metrobank**; built so more can follow.

- **Overview**: promos joined (soonest-ending first) with progress toward their minimum spend and a "behind pace"
  note, rewards earned but not yet credited, rewards credited this year, and promos for our cards ending this week.
- **Promos**: the catalog, on now for our cards by default; search, filter by bank, by kind (cashback, discount, 0% installment,
  freebie, points, raffle) or show new, upcoming, tracked or past. A promo opens in a side panel with its period,
  networks, our cards that fit, DTI permit and the bank's mechanics; mark it Watching / Joined / Earned / Credited /
  Skipped, with the card, minimum spend and reward (guessed from the mechanics to start with), and log spending toward it.
  Each row says its bank. **Check for new promos** reads every bank's promo page now, one after another, and says
  what changed at each (one bank's site being down doesn't stop the others); it's also checked every morning.
- **Spending**: everything spent toward a promo's minimum.
- **Cards**: every RCBC, EastWest, BPI and Metrobank card (filter by bank), each tagged by whose it is (Arvs, Ayette, both) or Not ours. Ours decide what Promos
  shows (all of ours, or one person's); a card that isn't ours shows what it would get. Add one by bank, type and
  network (RCBC, Flex, Visa: "RCBC Flex Visa").
- **Settings**: light or dark, who's who (each person and the login they use; their edits say "by" them), and where the data lives.
- **Tracker** (admin only): what to build next.

## Where the data lives

This repo is public and holds no personal data. Everything is plain files in a separate **private** repo (the
"ledger"); every edit in the app is one commit there, so its history is the audit log.

```
promos/rcbc.json     the catalog, one file per bank: every promo seen on rcbccredit.com/promos (and any added by hand)
promos/eastwest.json   … and every credit card promo on eastwestbanker.com/promos
promos/bpi.json        … and every credit card promo on bpi.com.ph/personal/rewards-and-promotions/promos
promos/metrobank.json  … and every credit card promo on metrobank.com.ph/promos
settings.json        {"people": [{"id", "name", "login"}]}   who we are, and which login (admin or member) each uses
cards.csv            id,bank,type,network,owners                 (owners: person ids, space-separated; none: not ours)
tracking.csv         promo,status,card,goal,reward,note,updated      (status: watching, joined, earned, credited, skipped)
spend/2026.csv       id,date,promo,card,amount,note,created          (one file per year)
tracker.json         the admin's feature tracker (once it's first edited)
```

Without `LEDGER_REPO` the app uses a local folder (`.ledger/`, or `LEDGER_DIR`) instead, for development.

### How promos come in

Each bank has a parser for its public promo list and each promo's page (pure functions, tested on samples):
`lib/rcbc.ts`, `lib/eastwest.ts`, `lib/bpi.ts` and `lib/metrobank.ts`. EastWest's list is one feed for every product, nine to a page, with years of
ended promos; the parser keeps the ones tagged for credit cards (or a network only, not debit), and the importer leaves
out those whose listed period has ended. BPI's list page shows only twelve promos, so its importer reads the JSON its
Load more button uses, every page of it; it keeps promos tagged "Credit cards" and leaves out those shown as expired
or past their "Valid until". A BPI promo's page usually states its period ("The promo runs from … to …"), else the
list's "Valid until" is used; many installment (FlexipayZero) offers have no end date. Networks are only set when the
promo names one ("BPI Visa Credit Card"); otherwise it's for any BPI card. Metrobank's list page is one Next.js page (about 12.5 MB) whose JSON
holds every promo it has ever run, about 2,700, each with its start and end dates and the cards it's for, each typed
Credit, Debit or Prepaid; the importer reads it whole (cut short, the check fails), keeps promos for a credit card that
haven't ended, and takes the networks the cards' names give ("Travel Signature Visa"). A promo's own page gives its
mechanics and DTI permit. `lib/import.ts` has an importer per bank and `importAll` checks them in turn,
each saved on its own; `mergeImport` in `lib/promos.ts` adds new promos, refreshes changed ones, re-reads
each page weekly (and when a still-listed promo is past its end date, as it was likely extended), and marks promos the
bank takes down as gone. Untracked promos are dropped 180 days after they end; tracked ones stay.

## Settings (environment variables, set in Vercel)

| Variable | Meaning |
|---|---|
| `LEDGER_REPO` | `owner/name` of the private ledger repo, e.g. `nvrsbb/card-pro-max-ledger` |
| `LEDGER_BRANCH` | Branch to read and write. Default `main` |
| `LEDGER_GITHUB_TOKEN` | Fine-grained token with access to **only** the ledger repo and **Contents: Read and write** |
| `DASHBOARD_PASSWORD` | The household password (the `member` login). The only thing protecting your data, so make it long |
| `ADMIN_PASSWORD` | The owner's own password: logs in as `admin`, which adds the Tracker |
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
npm run import:promos      # check every bank from the command line, into the configured ledger
npm run import:eastwest    # or one bank (import:rcbc, import:bpi, import:metrobank)
```

## Design

Same design system as [Budge](https://github.com/nvrsbb/budge) and ibkr: a sidebar (72px icon rail, widens on
hover/focus, pin button, mobile drawer), pages that fit one screen with long lists scrolling in their panel, helpers in
a right-side panel, and palette-builder's earth-tone colour tokens in light and dark (`app/globals.css`).
