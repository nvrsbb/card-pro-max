"use client";

// Settings: Light, Dark or Match device, for this browser only.
import { useSyncExternalStore } from "react";
import { BAR_COLOR, readTheme, THEME_KEY, THEMES, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", device: "Match device" };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const current = () => readTheme(document.documentElement.getAttribute("data-theme"));

/** The browser bar: the chosen mode's colour, or back to following the device (the layout's media tags). */
function syncThemeBar(theme: Theme = current()) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media") ?? "";
    const color = BAR_COLOR[theme === "device" ? (media.includes("dark") ? "dark" : "light") : theme];
    if (m.getAttribute("content") !== color) m.setAttribute("content", color);
  });
}

/**
 * Keeps the bar on the chosen colour (AppFrame, for as long as the app is open): every page change renders the layout's
 * theme-color tags again with the device's colours, sometimes after the page itself has drawn.
 */
export function watchThemeBar(): () => void {
  syncThemeBar();
  const observer = new MutationObserver(() => syncThemeBar());
  observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
  return () => observer.disconnect();
}

function choose(theme: Theme) {
  const root = document.documentElement;
  if (theme === "device") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  syncThemeBar(theme);
  try {
    if (theme === "device") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch { /* a private window: it holds until the page closes */ }
  listeners.forEach((l) => l());
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, current, () => "device" as Theme);
  return <div className="segmented" role="group" aria-label="Light or dark">
    {THEMES.map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => choose(t)}>{LABEL[t]}</button>)}
  </div>;
}
