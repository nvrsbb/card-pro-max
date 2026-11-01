import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// Each bank is checked on its own: here RCBC's site is down and EastWest's answers (made-up pages, a local ledger).
const LIST = `<div class="card promo-card">
  <div class="card-img"><a href="/promos/sample-savings"><img src="/sites/default/files/sample.jpg"></a></div>
  <div class="card-content"><a href="/promos/sample-savings"><h3>20% savings at Sample Cafe</h3></a>
    <p>November 1, 2026 to December 31, 2099</p><div class="excerpt"><p>Enjoy 20% savings.</p></div></div>
  <div class="card-footer"><div class="pills-categories"><span class="pill-category pill-credit-cards">Credit Cards</span></div></div>
</div>
<div class="card promo-card">
  <div class="card-content"><a href="/promos/long-gone"><h3>10% savings at Old Cafe</h3></a>
    <p>January 1 to 31, 2020</p><div class="excerpt"><p>Over.</p></div></div>
  <div class="card-footer"><div class="pills-categories"><span class="pill-category pill-credit-cards">Credit Cards</span></div></div>
</div>`;
const DETAIL = `<section class="single-promo"><div class="promo-mechanics-wrap"><h2>Promo Mechanics</h2>
  <div class="field field--name-body field--type-text-with-summary field--item"><p>Minimum spend of Php 1,000.</p></div>
</div></section>`;

test("one bank failing doesn't stop the others; promos the list shows as ended are left out", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "card-pro-max-"));
  const env = { ...process.env };
  delete process.env.LEDGER_REPO;
  process.env.LEDGER_DIR = dir;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.startsWith("https://rcbccredit.com")) return new Response("down", { status: 503 });
    if (url === "https://www.eastwestbanker.com/promos") return new Response(LIST);
    if (url.startsWith("https://www.eastwestbanker.com/promos/")) return new Response(DETAIL);
    return new Response("not found", { status: 404 });
  });
  t.after(async () => { process.env = env; await rm(dir, { recursive: true, force: true }); });

  const { importAll } = await import("./import.ts");
  const [rcbc, eastwest] = await importAll("script");
  assert.equal(rcbc.bank, "rcbc");
  assert.match(rcbc.error ?? "", /answered 503/);
  assert.deepEqual(eastwest, { bank: "eastwest", result: { added: 1, updated: 0, gone: 0, removed: 0, read: 1, failed: 0 } });
  const saved = JSON.parse(await readFile(path.join(dir, "promos/eastwest.json"), "utf8"));
  assert.deepEqual(saved.map((p: { id: string; ends: string; kind: string; details: string }) => [p.id, p.ends, p.kind, p.details]),
    [["eastwest:sample-savings", "2099-12-31", "discount", "Minimum spend of Php 1,000."]]);
});
