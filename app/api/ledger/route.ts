import { cookies } from "next/headers";
import { EditError, isOp } from "@/lib/ledger";
import { SESSION_COOKIE, sessionRole } from "@/lib/session";
import { LedgerError, readLedger, saveOp } from "@/lib/store";

// Checked here too, not only in the proxy, so the ledger is never served without a login.
async function role() {
  return sessionRole((await cookies()).get(SESSION_COOKIE)?.value);
}

function failure(error: unknown) {
  if (error instanceof LedgerError) return Response.json({ error: error.message }, { status: 502 });
  if (error instanceof EditError) return Response.json({ error: error.message }, { status: 409 });
  console.error(error);
  return Response.json({ error: "Something went wrong reading the ledger." }, { status: 500 });
}

export async function GET() {
  if (!(await role())) return Response.json({ error: "Not logged in." }, { status: 401 });
  try { return Response.json(await readLedger()); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  // Who's logged in, from the signed cookie (never from the request body), so the commit can say who made it.
  const login = await role();
  if (!login) return Response.json({ error: "Not logged in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { op?: unknown } | null;
  if (!isOp(body?.op)) return Response.json({ error: "That edit isn't valid." }, { status: 400 });
  try { return Response.json({ ledger: await saveOp(body.op, login) }); }
  catch (error) { return failure(error); }
}
