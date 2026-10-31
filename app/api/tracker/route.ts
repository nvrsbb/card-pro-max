import { cookies } from "next/headers";
import { SESSION_COOKIE, isAdmin } from "@/lib/session";
import { LedgerError, loadTracker, saveTrackerOp } from "@/lib/store";
import { isTrackerOp } from "@/lib/tracker";

// Admin only. Checked here too, not only in the proxy; anyone else gets 404 so the tracker's existence isn't revealed.
async function admin() {
  return isAdmin((await cookies()).get(SESSION_COOKIE)?.value);
}

const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

function failure(error: unknown) {
  if (error instanceof LedgerError) return Response.json({ error: error.message }, { status: 502 });
  console.error(error);
  return Response.json({ error: "Something went wrong with the tracker." }, { status: 500 });
}

export async function GET() {
  if (!(await admin())) return notFound();
  try { return Response.json(await loadTracker()); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!(await admin())) return notFound();
  const body = (await request.json().catch(() => null)) as { op?: unknown } | null;
  if (!isTrackerOp(body?.op)) return Response.json({ error: "That edit isn't valid." }, { status: 400 });
  try { return Response.json(await saveTrackerOp(body.op, "admin")); } // only the admin gets here
  catch (error) { return failure(error); }
}
