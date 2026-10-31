import assert from "node:assert/strict";
import test from "node:test";
import { hideValues, money, parseAmount } from "./format.ts";

test("amounts in pesos, whole when they are, and hidden by the eye button", () => {
  assert.equal(money(10000), "₱10,000");
  assert.equal(money(1234.5), "₱1,234.50");
  assert.equal(money(-50), "−₱50");
  assert.equal(money(0.004), "₱0");
  hideValues(true);
  assert.equal(money(10000), "₱•••");
  hideValues(false);
});

test("typed amounts, with or without the peso sign and commas", () => {
  assert.equal(parseAmount("10,000"), 10000);
  assert.equal(parseAmount("₱ 2,500.50"), 2500.5);
  assert.equal(parseAmount("PHP 300"), 300);
  assert.ok(Number.isNaN(parseAmount("")));
  assert.ok(Number.isNaN(parseAmount("ten")));
});
