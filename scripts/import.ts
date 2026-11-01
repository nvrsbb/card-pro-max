// Checks the banks' promo pages into the ledger from the command line, like the app's Check for new promos.
// Uses the same settings as the app: LEDGER_REPO + LEDGER_GITHUB_TOKEN, or a local folder (LEDGER_DIR, default .ledger).
//   node scripts/import.ts            every bank
//   node scripts/import.ts eastwest   one bank
import { importAll } from "../lib/import.ts";
import { BANKS, isBank } from "../lib/ledger.ts";

const asked = process.argv.slice(2);
const unknown = asked.filter((b) => !isBank(b));
if (unknown.length) throw new Error(`Unknown bank: ${unknown.join(", ")}. Banks: ${Object.keys(BANKS).join(", ")}.`);
const results = await importAll("script", asked.length ? asked.filter(isBank) : undefined);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.error)) process.exitCode = 1;
