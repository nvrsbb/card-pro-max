"use client";

import { useActionState } from "react";
import { startAfresh } from "@/lib/login-client";
import { login } from "../actions";

type State = { wrong: boolean; going: boolean };

/** The password box. The right password loads the next page afresh, so nothing from the last login stays in memory. */
export function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(async (_: State, form: FormData): Promise<State> => {
    const result = await login(form);
    if ("wrong" in result) return { wrong: true, going: false };
    startAfresh(result.next);
    return { wrong: false, going: true };
  }, { wrong: false, going: false });
  const busy = pending || state.going;
  return <form className="login-form" action={action}>
    <input type="hidden" name="next" value={next} />
    <label className="sr-only" htmlFor="password">Password</label>
    <input id="password" name="password" type="password" placeholder="Password" autoComplete="current-password" autoFocus required />
    {state.wrong && !pending && <p className="down" role="alert">Wrong password.</p>}
    <button type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
  </form>;
}
