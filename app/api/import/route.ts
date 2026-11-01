import { cookies } from "next/headers";
import { importAll } from "@/lib/import";
import { SESSION_COOKIE, sessionRole } from "@/lib/session";
import { LedgerError, readLedger } from "@/lib/store";

// Reading every new promo's page can take a while on the first check.
export const maxDuration = 300;

/**
 * "Check for new promos": reads every bank's list now, one after another, and answers with the updated ledger and
 * what changed at each bank (or why one couldn't be checked).
 */
export async function POST() {
  const login = sessionRole((await cookies()).get(SESSION_COOKIE)?.value);
  if (!login) return Response.json({ error: "Not logged in." }, { status: 401 });
  try {
    const checks = await importAll(login);
    return Response.json({ checks, ...(await readLedger()) });
  } catch (error) {
    if (error instanceof LedgerError) return Response.json({ error: error.message }, { status: 502 });
    console.error(error);
    return Response.json({ error: "Something went wrong checking for promos." }, { status: 500 });
  }
}
