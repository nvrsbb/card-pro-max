import { Suspense } from "react";
import { authConfigured } from "@/lib/session";
import { PasswordForm } from "./login-form";

type Params = PageProps<"/login">["searchParams"];

// Reads the query and the server's settings per request, inside Suspense so the shell can be prerendered.
async function LoginForm({ searchParams }: { searchParams: Params }) {
  const { next } = await searchParams;
  if (!authConfigured()) return <p className="muted">
    Login isn&apos;t set up. Set <code>DASHBOARD_PASSWORD</code> and <code>SESSION_SECRET</code> on the server, then reload.
  </p>;
  return <PasswordForm next={typeof next === "string" ? next : "/"} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return <main className="login-page">
    <section>
      <h1>Card Pro Max</h1>
      <Suspense fallback={<p className="muted">Loading…</p>}><LoginForm searchParams={searchParams} /></Suspense>
    </section>
  </main>;
}
