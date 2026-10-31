"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { watchThemeBar } from "./theme-picker";
import { useLedgerStatus, type Login } from "@/lib/client";
import { hideValues } from "@/lib/format";
import { leave, noteLogin } from "@/lib/login-client";
import { appPageTitle, HIDE_VALUES_KEY, loadFlag, saveFlag, SIDEBAR_PIN_KEY, sidebarItems, type SidebarKind } from "@/lib/navigation";

function SidebarIcon({ kind }: { kind: SidebarKind }) {
  switch (kind) {
    case "overview":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="9" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="5" rx="1.5" /><rect x="13.5" y="11" width="7.5" height="10" rx="1.5" /><rect x="3" y="15" width="7.5" height="6" rx="1.5" /></svg>;
    case "promos":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.5" /></svg>;
    case "spending":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "cards":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" /></svg>;
    case "tracker":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="7" rx="1.5" /></svg>;
    case "settings":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
  }
}

function MenuIcon({ close }: { close: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{close ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>;
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Zm3 11v7" />{pinned && <path d="m5 5 14 14" />}</svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" />{hidden && <path d="m4 4 16 16" />}</svg>;
}

// The pin and the eye are only read once per page load; this tab changes them through state.
const subscribeNever = () => () => {};

type Leaving = "no" | "going" | "failed";

/** Where the ledger stands: loading, saving a commit, saved, or an error; or that Log out is under way. */
function StatusPill({ leaving }: { leaving: Leaving }) {
  const { loaded, source, saving, error } = useLedgerStatus();
  if (leaving === "going") return <span className="pill" role="status">Logging out…</span>;
  if (leaving === "failed") return <span className="pill bad" role="alert" title="The server couldn't be reached. Check the connection and tap Log out again.">Not logged out: try again</span>;
  if (error) return <span className="pill bad" role="alert" title={error}>{error}</span>;
  if (!loaded) return <span className="pill">Loading…</span>;
  if (saving) return <span className="pill" role="status">Saving…</span>;
  const label = source?.kind === "github" ? "Saved to GitHub" : "Saved locally";
  return source?.kind === "github"
    ? <a className="pill ok" href={source.historyUrl} target="_blank" rel="noreferrer" title={`History of ${source.repo}`}>{label}</a>
    : <span className="pill ok">{label}</span>;
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => watchThemeBar(), []);
  if (pathname === "/login") return <>{children}</>;
  return <Frame pathname={pathname}>{children}</Frame>;
}

function Frame({ children, pathname }: { children: ReactNode; pathname: string }) {
  const storedPinned = useSyncExternalStore(subscribeNever, () => loadFlag(window.localStorage, SIDEBAR_PIN_KEY), () => false);
  const [pinChoice, setPinned] = useState<boolean | null>(null);
  const pinned = pinChoice ?? storedPinned;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [leaving, setLeaving] = useState<Leaving>("no");
  const expanded = pinned || hovered || focused;
  const storedHidden = useSyncExternalStore(subscribeNever, () => loadFlag(window.localStorage, HIDE_VALUES_KEY), () => false);
  const [hiddenChoice, setHidden] = useState<boolean | null>(null);
  const hidden = hiddenChoice ?? storedHidden;
  hideValues(hidden);
  // Admin pages stay out of the sidebar until the server says this is the admin. Asked again when the tab comes back
  // into view: if the login changed meanwhile (in another tab), the page is reloaded (noteLogin).
  const [role, setRole] = useState<Login | null>(null);
  useEffect(() => {
    let live = true;
    const ask = () => fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((me: { role?: Login | null }) => {
      noteLogin(me.role ?? null);
      if (live) setRole(me.role ?? null);
    }).catch(() => {});
    const shown = () => { if (document.visibilityState === "visible") void ask(); };
    void ask();
    document.addEventListener("visibilitychange", shown);
    return () => { live = false; document.removeEventListener("visibilitychange", shown); };
  }, []);

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    saveFlag(window.localStorage, SIDEBAR_PIN_KEY, next);
  }

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    saveFlag(window.localStorage, HIDE_VALUES_KEY, next);
  }

  async function logOut() {
    if (leaving === "going") return;
    setLeaving("going");
    if (!(await leave())) setLeaving("failed");
  }

  return <div className="app-frame" data-hide-values={hidden} data-expanded={expanded} data-pinned={pinned} data-mobile-open={mobileOpen}>
    <header className="app-pagebar">
      <button className="icon-btn menu-toggle" type="button" aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileOpen} aria-controls="app-sidebar" onClick={() => setMobileOpen((open) => !open)}>
        <MenuIcon close={mobileOpen} />
      </button>
      <h1>{appPageTitle(pathname)}</h1>
      <button className="icon-btn" type="button" aria-pressed={hidden} onClick={toggleHidden}
        aria-label={hidden ? "Show amounts" : "Hide amounts"} title={hidden ? "Show amounts" : "Hide amounts"}>
        <EyeIcon hidden={hidden} />
      </button>
      <StatusPill leaving={leaving} />
    </header>
    {mobileOpen && <button type="button" className="sidebar-scrim" tabIndex={-1} aria-label="Close navigation menu" onClick={() => setMobileOpen(false)} />}
    <aside className="app-sidebar" id="app-sidebar" aria-label="Sidebar navigation"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <Link className="sidebar-brand" href="/" aria-label="Card Pro Max home" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark" aria-hidden="true" /><span className="label">Card Pro Max</span>
          </Link>
          <button className="icon-btn pin-toggle" type="button" aria-pressed={pinned} onClick={togglePin}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"} title={pinned ? "Unpin sidebar" : "Pin sidebar open"}>
            <PinIcon pinned={pinned} />
          </button>
        </div>
        <nav aria-label="Pages">
          {sidebarItems.filter((item) => !("adminOnly" in item) || role === "admin").map((item) => <Link key={item.href} href={item.href} title={item.label}
            aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMobileOpen(false)}>
            <SidebarIcon kind={item.kind} /><span className="label">{item.label}</span>
          </Link>)}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-btn" type="button" title={leaving === "going" ? "Logging out…" : "Log out"}
            disabled={leaving === "going"} aria-busy={leaving === "going"} onClick={() => void logOut()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" /></svg>
            <span className="label">{leaving === "going" ? "Logging out…" : "Log out"}</span>
          </button>
        </div>
      </div>
    </aside>
    <main className="app-content" key={String(hidden)}>{children}</main>
  </div>;
}
