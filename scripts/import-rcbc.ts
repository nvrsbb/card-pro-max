// Checks RCBC's promo page into the ledger from the command line, like the app's Check for new promos.
// Uses the same settings as the app: LEDGER_REPO + LEDGER_GITHUB_TOKEN, or a local folder (LEDGER_DIR, default .ledger).
//   node scripts/import-rcbc.ts
import { importRcbc } from "../lib/import.ts";

console.log(await importRcbc("script"));
