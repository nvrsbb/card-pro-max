import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionRole } from "@/lib/session";

/** Who's logged in, so the sidebar can show admin pages. */
export async function GET() {
  return Response.json({ role: sessionRole((await cookies()).get(SESSION_COOKIE)?.value) });
}
