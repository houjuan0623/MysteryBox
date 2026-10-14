import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultWindow,
  windowQuery,
  formatTimestamp,
} from "../lib/date-window.mjs";

test("default window is seven UTC calendar days across month boundaries", () => {
  assert.deepEqual(defaultWindow(new Date("2026-03-02T23:30:00-08:00")), {
    from: "2026-02-25",
    to: "2026-03-03",
  });
});
test("selected dates include both complete UTC calendar days", () => {
  const query = new URLSearchParams(
    windowQuery({ from: "2026-10-01", to: "2026-10-14" }),
  );
  assert.equal(query.get("from"), "2026-10-01T00:00:00.000Z");
  assert.equal(query.get("to"), "2026-10-15T00:00:00.000Z");
});
test("date validation rejects invalid dates, reversed and excessive windows", () => {
  for (const window of [
    { from: "2026-02-30", to: "2026-03-02" },
    { from: "2026-10-14", to: "2026-10-01" },
    { from: "2025-01-01", to: "2026-10-14" },
    { from: "", to: "" },
  ])
    assert.throws(() => windowQuery(window));
});
test("missing and invalid timestamps do not invent sign-in activity", () => {
  assert.equal(formatTimestamp(null), "Never");
  assert.equal(formatTimestamp("bad"), "Unavailable");
  assert.match(formatTimestamp("2026-10-14T00:01:00Z"), /00:01/);
});

test("exactly 31 days is accepted, 32 days is rejected", () => {
  assert.doesNotThrow(() =>
    windowQuery({ from: "2026-10-01", to: "2026-10-31" }),
  );
  assert.throws(() => windowQuery({ from: "2026-10-01", to: "2026-11-01" }));
});
