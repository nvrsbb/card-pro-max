// Light or dark: chosen in Settings and remembered per browser, or matching the device (the default).
// Applied before the first paint by THEME_SCRIPT in the page's <head>, so there's no flash of the other one.

export type Theme = "light" | "dark" | "device";
export const THEMES: Theme[] = ["light", "dark", "device"];
export const THEME_KEY = "cpm:theme:v1";

/** What's stored, as a theme: anything else (nothing yet, an old value) matches the device. */
export const readTheme = (value: string | null | undefined): Theme => (value === "light" || value === "dark" ? value : "device");

/**
 * The browser bar's colour for each mode: --page in app/globals.css (a test keeps them the same). Raw values, as in
 * layout.tsx's viewport: the bar can't read CSS tokens.
 */
export const BAR_COLOR = { light: "#f4ece0", dark: "#051214" } as const;

/**
 * Runs in <head> before anything paints: puts the saved theme on <html data-theme>, and once the page's meta tags are
 * in, points both theme-color tags at that mode's colour. Matching the device leaves both as the layout set them.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t!=="light"&&t!=="dark")return;`
  + `var d=document,c=${JSON.stringify(BAR_COLOR)}[t];d.documentElement.setAttribute("data-theme",t);`
  + `d.addEventListener("DOMContentLoaded",function(){d.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})})}catch(e){}})()`;
