import assert from "node:assert/strict";
import test from "node:test";
import { appPageTitle, loadFlag, saveFlag, SIDEBAR_PIN_KEY } from "./navigation.ts";

test("page titles come from the sidebar", () => {
  assert.equal(appPageTitle("/promos"), "Promos");
  assert.equal(appPageTitle("/tracker"), "Feature tracker");
  assert.equal(appPageTitle("/nowhere"), "Card Pro Max");
});

test("the pin is remembered, and storage that throws reads as unpinned", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  saveFlag(storage, SIDEBAR_PIN_KEY, true);
  assert.equal(loadFlag(storage, SIDEBAR_PIN_KEY), true);
  assert.equal(loadFlag({ getItem: () => { throw new Error("blocked"); } }, SIDEBAR_PIN_KEY), false);
  assert.doesNotThrow(() => saveFlag({ setItem: () => { throw new Error("blocked"); } }, SIDEBAR_PIN_KEY, true));
});
