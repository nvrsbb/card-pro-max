Card Pro Max tracks credit card promos: each bank's catalog (RCBC and EastWest), which ones we've joined, spending toward each
minimum, and rewards earned and credited. Everything below applies to every session, including cloud sessions (they
don't see the owner's Mac, so this file is the whole briefing).

## Who it's for

- The household is Arvs (the owner, GitHub `nvrsbb`, the admin login) and Ayette (the member login), in the Philippines; the currency is PHP and dates are Manila time (UTC+8,
  `manilaToday` in `lib/dates.ts`). Use they/them unless told otherwise.
- The owner thinks from first principles: explain trade-offs plainly, recommend one option, keep replies short and concrete.

## Working agreements (as in ~/Programs/budge)

- **This repo is public.** No personal data, card numbers, amounts or secrets in it, ever: those live in the private
  ledger repo (`LEDGER_REPO`) and Vercel's environment variables. Never print or commit secrets.
- **Ship by pushing to `main`**; Vercel deploys it. Commit messages end with the Co-Authored-By line from the session's
  attribution reminder. A cloud session that can only push a `claude/*` branch opens a pull request instead.
- Before pushing: `npm test`, `npx next typegen && npx tsc --noEmit -p .` and `npx eslint .` all clean (GitHub Actions
  runs the same). Add a test for every new `Op` or rule in `lib/`.
- Three project agents in `.claude/agents/`, like Budge's: **RED** reviews a change, **BLUE** builds one tracker card as
  one PR, **GOLD** scouts the pages with made-up data. None of them touches the real ledger.
- **Log every finished request in the Tracker as Done** (`tracker.json` in the ledger repo; ops in `lib/tracker.ts`).
- Check UI changes in a browser: `LEDGER_DIR=<scratch folder> npx next dev -p 3127` (no password in development),
  `npm run import:promos` with the same `LEDGER_DIR` for a real catalog, made-up cards and spending. Never test against the real ledger.
- Ask before anything hard to undo: deleting data, rewriting ledger history, changing what the member login can see.

## Data

- `lib/ledger.ts` is pure and shared by browser, server and tests: types, files (`fromFiles`/`toFiles`) and every edit as
  an `Op`. A new kind of edit = a new case in `applyOp`, `describeOp` (the commit message, never with amounts) and
  `isOp` (validation), plus a test. Changing a file's columns: make `fromFiles` read both formats, deploy, then migrate the ledger.
- `lib/store.ts` reads and writes the ledger through the GitHub API (one commit per edit, retried if the branch moved),
  or a local folder in development. `lib/client.ts` is the browser's copy: `mutate(op)` shows an edit at once and saves in order.
- People (`settings.json` `people`: id, name, login) live in the ledger, never in this repo. Commits end "(by Name)" (`whoIs`).
- Cards (`lib/cards.ts`): a card is bank + type + network (`cardId`, `cardName`: "RCBC Flex Visa") with `owners` (person ids;
  none: not ours). `RCBC_CARDS` and `EASTWEST_CARDS` (together `BANK_CARDS`) are the banks' lists, shown untagged until someone tags one (`tagOp` adds it then).
  "Our cards" is always `ownedCards`, never `ledger.cards` as a whole.
- Banks: `BANKS` in `lib/ledger.ts` (RCBC, EastWest). Each bank has a pure parser (`lib/rcbc.ts`, `lib/eastwest.ts`:
  `parseList`, `parseDetail`, tested on synthetic HTML shaped like the real pages, never copied pages) and an entry in
  `IMPORTERS` (`lib/import.ts`: how to read its list, a promo's page, and its address). `importAll` checks every bank in
  turn, each saved on its own, and reports per bank; `/api/import`, `/api/cron` and `npm run import:promos` use it.
  `mergeImport` (`lib/promos.ts`) is bank-agnostic. A new bank = a parser + tests, an `IMPORTERS` entry, a `BANKS`
  entry and its cards in `lib/cards.ts` (`BANK_CARDS`).
- EastWest's list (eastwestbanker.com/promos) is server-rendered Drupal: every product in one feed, 9 a page, ended
  promos kept for years. Only credit card promos are kept (the "Credit Cards" pill, or a network-only pill without
  debit/prepaid), and the importer drops those whose listed period has ended. Its promo pages don't repeat the period,
  so it comes from the list card, else the summary or mechanics. Some installment offers have no end date at all.
- RCBC's images are same-site only (`cross-origin-resource-policy`), so the app doesn't show them.
- `guessTerms` only starts the Track form; the owner confirms minimum spend and reward. Mechanics vary (tiers, foreign currency).
- Every route except `/login` and `/api/cron` needs the signed session cookie (`proxy.ts`, checked again in each route).
  `/api/cron` needs `CRON_SECRET`. Admin-only routes (`/tracker`, `/api/tracker`) answer 404 to members.

## Design rules (the owner's, shared with Budge, ibkr and cc-manager)

- Sidebar pages (`sidebarItems` in `lib/navigation.ts`) wrapped in `<section className="page">`; content uses the full
  width and fits about one screen, long lists scroll inside their `.panel` (`.scroll`, sticky headers). Works at phone width.
- Each page has one message. Forms and reference material open in the right-side `Drawer` (`app/components.tsx`) from a
  page-header button: the main action filled accent, others plain. A promo always opens in `PromoPanel`. No centred modals.
- Colours only from the tokens on `:root` in `app/globals.css` (palette-builder's earth-tone set, light and dark), never
  raw hex elsewhere; no inline styles. Promo kinds use `--kind-*` (from `--group-*`).
- Every amount on screen goes through `money()` (`lib/format.ts`) so the eye button hides it; typed amounts use `input.amount`.
- Words: plain and friendly, no jargon.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
