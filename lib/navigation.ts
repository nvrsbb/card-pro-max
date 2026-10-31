export const sidebarItems = [
  { href: "/", label: "Overview", kind: "overview" },
  { href: "/promos", label: "Promos", kind: "promos" },
  { href: "/spending", label: "Spending", kind: "spending" },
  { href: "/cards", label: "Cards", kind: "cards" },
  { href: "/settings", label: "Settings", kind: "settings" },
  { href: "/tracker", label: "Tracker", kind: "tracker", adminOnly: true },
] as const;

export type SidebarKind = (typeof sidebarItems)[number]["kind"];

export function appPageTitle(pathname: string): string {
  if (pathname === "/tracker") return "Feature tracker";
  return sidebarItems.find((item) => item.href === pathname)?.label ?? "Card Pro Max";
}

export const SIDEBAR_PIN_KEY = "cpm:sidebar-pinned:v1";
export const HIDE_VALUES_KEY = "cpm:hide-values:v1";

/** A yes/no remembered in this browser; false when storage can't be read (a private window). */
export function loadFlag(storage: Pick<Storage, "getItem">, key: string): boolean {
  try { return storage.getItem(key) === "1"; }
  catch { return false; }
}

export function saveFlag(storage: Pick<Storage, "setItem">, key: string, on: boolean): void {
  try { storage.setItem(key, on ? "1" : "0"); }
  catch { /* remembered until the page closes */ }
}
