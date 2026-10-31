import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Logs out. Asked with `keepalive` (lib/login-client.ts), so it still reaches the server if the app is closed or put
 * away right after Log out is tapped.
 */
export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
