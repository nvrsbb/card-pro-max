import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BAR_COLOR, readTheme, THEME_KEY, THEME_SCRIPT } from "./theme.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const block = (start: string) => {
  const from = css.indexOf(start);
  assert.ok(from >= 0, start);
  const open = css.indexOf("{", from + start.length - 1);
  return css.slice(open + 1, css.indexOf("}", open)).replace(/\/\*.*?\*\//g, "").replace(/\s+/g, " ").trim();
};

test("Dark chosen in Settings is exactly the device's dark mode, and the bar colours are each mode's --page", () => {
  const device = block(':root:not([data-theme="light"]) {');
  const chosen = block(':root[data-theme="dark"] {');
  assert.equal(chosen, device);
  assert.match(device, /--page: #[0-9a-f]{6}/);
  assert.match(device, new RegExp(`--page: ${BAR_COLOR.dark};`));
  assert.match(block(":root {"), new RegExp(`--page: ${BAR_COLOR.light};`));
});

test("the saved theme is light, dark, or else the device's", () => {
  assert.equal(readTheme("dark"), "dark");
  assert.equal(readTheme("light"), "light");
  for (const v of [null, undefined, "", "blue"]) assert.equal(readTheme(v), "device");
});

test("the before-paint script sets data-theme from storage, and does nothing when storage throws", () => {
  const run = (stored: string | null, throws = false) => {
    const attrs: Record<string, string> = {};
    const listeners: (() => void)[] = [];
    const metas = [{ content: "", setAttribute(_: string, v: string) { this.content = v; } }];
    const localStorage = { getItem: (k: string) => { if (throws) throw new Error("blocked"); return k === THEME_KEY ? stored : null; } };
    const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
      addEventListener: (_: string, f: () => void) => listeners.push(f), querySelectorAll: () => metas };
    new Function("localStorage", "document", THEME_SCRIPT)(localStorage, document);
    listeners.forEach((f) => f());
    return { theme: attrs["data-theme"], bar: metas[0].content };
  };
  assert.deepEqual(run("dark"), { theme: "dark", bar: BAR_COLOR.dark });
  assert.deepEqual(run("light"), { theme: "light", bar: BAR_COLOR.light });
  assert.deepEqual(run(null), { theme: undefined, bar: "" });
  assert.deepEqual(run("dark", true), { theme: undefined, bar: "" });
});
