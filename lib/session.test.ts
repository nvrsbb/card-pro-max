import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

process.env.DASHBOARD_PASSWORD = "household";
process.env.ADMIN_PASSWORD = "owner";
process.env.SESSION_SECRET = "test-secret";
const { checkPassword, newSession, safeNext, sessionRole } = await import("./session.ts");

test("each password logs in with its own role", () => {
  assert.equal(checkPassword("owner"), "admin");
  assert.equal(checkPassword("household"), "member");
  assert.equal(checkPassword("guess"), null);
});

test("sessions carry their role, and the role can't be changed without the secret", () => {
  assert.equal(sessionRole(newSession("admin")), "admin");
  const member = newSession("member");
  assert.equal(sessionRole(member), "member");
  assert.equal(sessionRole(member.replace(/^member/, "admin")), null);
  assert.equal(sessionRole(undefined), null);
});

test("expired sessions are refused", () => {
  const payload = `admin.${Date.now() - 1}`;
  assert.equal(sessionRole(`${payload}.${createHmac("sha256", "test-secret").update(payload).digest("base64url")}`), null);
});

test("after logging in, only a path on this site: none that a browser would read as another site", () => {
  assert.equal(safeNext("/promos?q=klook"), "/promos?q=klook");
  for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "\t//evil.com", "https://evil.com", "evil.com", "", null]) {
    assert.equal(safeNext(bad), "/", String(bad));
  }
  assert.equal(safeNext("/promos#x"), "/promos#x");
});
