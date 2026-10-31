import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, readCsv, toCsv } from "./csv.ts";

test("round-trips commas, quotes and newlines", () => {
  const rows = [["a,b", 'say "hi"', "line\nbreak", ""]];
  assert.deepEqual(parseCsv(toCsv(["w", "x", "y", "z"], rows)).slice(1), rows);
});

test("reads CRLF files and ignores blank lines", () => {
  assert.deepEqual(readCsv("id,name\r\n1,Food\r\n\r\n2,Rent\r\n"), [{ id: "1", name: "Food" }, { id: "2", name: "Rent" }]);
});

test("missing cells read as empty", () => {
  assert.deepEqual(readCsv("a,b,c\n1\n"), [{ a: "1", b: "", c: "" }]);
});
