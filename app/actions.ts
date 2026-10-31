"use server";

import { cookies } from "next/headers";
import { checkPassword, newSession, safeNext, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

/**
 * Logs in, answering where to go next (or that the password was wrong). The browser then loads that page afresh
 * (app/login/login-form.tsx), so nothing the last login loaded stays in memory.
 */
export async function login(form: FormData): Promise<{ next: string } | { wrong: true }> {
  const next = safeNext(form.get("next"));
  const role = checkPassword(String(form.get("password") ?? ""));
  if (!role) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return { wrong: true };
  }
  (await cookies()).set(SESSION_COOKIE, newSession(role), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400,
  });
  return { next };
}
