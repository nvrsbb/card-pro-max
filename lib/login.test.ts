import assert from "node:assert/strict";
import test from "node:test";
import { loginWatch, logOutAfter, mustForget } from "./login.ts";

test("data is dropped when a different login, or nobody, is logged in now", () => {
  assert.equal(mustForget("admin", "member"), true);
  assert.equal(mustForget("member", "admin"), true);
  assert.equal(mustForget("admin", null), true);
  assert.equal(mustForget("admin", "admin"), false);
  assert.equal(mustForget(null, "member"), false); // nothing held yet
});

test("switching from the owner's login to the household's in one tab forgets what the page held, once", () => {
  let forgotten = 0;
  const watch = loginWatch(() => { forgotten += 1; });
  watch.note("admin");
  watch.note("admin");
  assert.equal(forgotten, 0);
  watch.note("member");
  assert.equal(forgotten, 1);
  assert.equal(watch.held, "member");
  watch.note("member");
  assert.equal(forgotten, 1);
});

test("logging out forgets, and after a reset the next login starts clean", () => {
  let forgotten = 0;
  const watch = loginWatch(() => { forgotten += 1; });
  watch.note("member");
  watch.note(null);
  assert.equal(forgotten, 1);
  watch.note("admin");
  assert.equal(forgotten, 1);
  watch.reset();
  watch.note("member");
  assert.equal(forgotten, 1);
});

test("after a reload for the new login, the fresh page doesn't reload again", () => {
  let reloads = 0;
  const before = loginWatch(() => { reloads += 1; });
  before.note("admin");
  before.note("member"); // another tab logged in with the household password: this page reloads
  const after = loginWatch(() => { reloads += 1; }); // the reloaded page starts with nothing held
  after.note("member");
  after.note("member");
  assert.equal(reloads, 1);
});

test("log out waits for a save in flight, but never more than 2 seconds", async () => {
  const waited: number[] = [];
  let ended = 0;
  const end = async () => { ended += 1; return true; };
  // A save that never finishes (offline): logged out anyway once the wait is up.
  assert.equal(await logOutAfter(new Promise(() => {}), end, async (ms) => { waited.push(ms); }), true);
  assert.deepEqual([waited, ended], [[2000], 1]);
  // A save that finishes first: logged out straight after it, without waiting out the timer.
  const order: string[] = [];
  await logOutAfter(Promise.resolve().then(() => { order.push("saved"); }), async () => { order.push("logged out"); return true; }, () => new Promise(() => {}));
  assert.deepEqual(order, ["saved", "logged out"]);
});
