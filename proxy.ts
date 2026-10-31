import { NextResponse, type NextRequest } from "next/server";
import { sessionRole, SESSION_COOKIE } from "@/lib/session";

const ADMIN_ONLY = /^\/(api\/)?tracker(\/|$)/;

// Every page and API call needs a login, except the login page itself, the logo and the daily check (which has its
// own secret, app/api/cron). Admin pages answer 404 to everyone else, so they don't reveal that they exist.
export function proxy(request: NextRequest) {
  const role = sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;
  if (role && ADMIN_ONLY.test(pathname) && role !== "admin") {
    return pathname.startsWith("/api/") ? NextResponse.json({ error: "Not found." }, { status: 404 }) : new NextResponse("Not found", { status: 404 });
  }
  if (role) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico|icons/).*)"],
};
