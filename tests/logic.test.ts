import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyChange,
  createCalendar,
  initialState,
  parseDate,
  resolveItem,
  returnWindows,
  stateSchema,
} from "../lib/borrowback.ts";
test("ambiguous tripod stays ambiguous; unknown catalog item has no match", () => {
  assert.equal(resolveItem("the tripod").length, 2);
  assert.equal(resolveItem("silver tripod")[0].id, "tabletop-tripod");
  assert.deepEqual(resolveItem("laptop"), []);
});
test("relative dates use visible fixed clock and next-Friday ambiguity is not guessed", () => {
  assert.equal(parseDate("Friday"), "2026-09-11");
  assert.equal(parseDate("tomorrow"), "2026-09-10");
  assert.equal(parseDate("next Friday"), undefined);
  assert.equal(parseDate("2026-09-30"), undefined);
});
test("missing fields, unavailable items and duplicate confirmations do not overwrite a loan", () => {
  const s = initialState();
  const c = {
    kind: "loan" as const,
    baseRevision: 0,
    itemId: "tall-tripod" as const,
    borrower: "Alex",
    dueDate: "2026-09-11",
  };
  assert.throws(() => applyChange(s, { ...c, borrower: "" }));
  assert.throws(() => applyChange(s, { ...c, itemId: "projector" }));
  const next = applyChange(s, c);
  assert.equal(s.loans.length, 1);
  assert.equal(next.loans.length, 2);
  assert.throws(() => applyChange(next, c), /out of date/);
});
test("no overlap does not fabricate an appointment", () => {
  assert.equal(returnWindows("projector", "2026-09-11").slots.length, 0);
  const sat = returnWindows("projector", "2026-09-12");
  assert.deepEqual(
    sat.slots.map((s) => s.start),
    ["2026-09-12T16:00:00-05:00", "2026-09-12T16:30:00-05:00"],
  );
  assert.equal(sat.reservedFrom, 18);
});
test("planning, exporting and cancelling never mark received", () => {
  const s = initialState();
  const plan = returnWindows("projector", "2026-09-12").slots[0];
  const planned = applyChange(s, {
    kind: "plan",
    baseRevision: 0,
    itemId: "projector",
    plan,
  });
  assert.equal(planned.loans[0].returned, false);
  assert.ok(createCalendar(planned.loans[0]).includes("STATUS:TENTATIVE"));
  assert.equal(planned.loans[0].returned, false);
  const cancelled = applyChange(planned, {
    kind: "cancel",
    baseRevision: 1,
    itemId: "projector",
  });
  assert.equal(cancelled.loans[0].returned, false);
  assert.equal(cancelled.loans[0].plan, null);
});
test("a handoff after the due date and forged availability are rejected", () => {
  const s = initialState();
  assert.throws(
    () =>
      applyChange(s, {
        kind: "plan",
        baseRevision: 0,
        itemId: "projector",
        plan: returnWindows("projector", "2026-09-13").slots[0],
      }),
    /after the due date/,
  );
  assert.throws(
    () =>
      applyChange(s, {
        kind: "plan",
        baseRevision: 0,
        itemId: "projector",
        plan: {
          start: "2026-09-12T14:00:00-05:00",
          end: "2026-09-12T14:30:00-05:00",
          location: "Community room",
        },
      }),
    /does not match/,
  );
});
test("correcting the due date clears stale handoff and preserves before/after history", () => {
  let s = applyChange(initialState(), {
    kind: "plan",
    baseRevision: 0,
    itemId: "projector",
    plan: returnWindows("projector", "2026-09-12").slots[0],
  });
  s = applyChange(s, {
    kind: "date",
    baseRevision: 1,
    itemId: "projector",
    dueDate: "2026-09-13",
  });
  assert.equal(s.loans[0].plan, null);
  assert.match(s.history.at(-1)!.text, /September 12.*September 13/);
});
test("explicit receipt releases equipment and is not repeatable from a stale preview", () => {
  const c = {
    kind: "receive" as const,
    baseRevision: 0,
    itemId: "projector" as const,
  };
  const s = applyChange(initialState(), c);
  assert.equal(s.loans[0].returned, true);
  assert.throws(() => applyChange(s, c), /out of date/);
  assert.throws(
    () => applyChange(s, { ...c, baseRevision: 1 }),
    /no active loan/,
  );
  const relend = applyChange(s, {
    kind: "loan",
    baseRevision: 1,
    itemId: "projector",
    borrower: "Alex",
    dueDate: "2026-09-13",
  });
  assert.equal(relend.loans[0].returned, false);
});
test("ICS uses UTC, deterministic UID, CRLF and escaped text", () => {
  let s = initialState();
  s.loans[0].borrower = "A;B,C\nD";
  s = applyChange(s, {
    kind: "plan",
    baseRevision: 0,
    itemId: "projector",
    plan: returnWindows("projector", "2026-09-12").slots[0],
  });
  const ics = createCalendar(s.loans[0], "2026-09-09T12:00:00Z");
  assert.ok(ics.includes("DTSTART:20260912T210000Z\r\nDTEND:20260912T213000Z"));
  assert.ok(ics.replace(/\r\n /g, "").includes("A\\;B\\,C\\nD"));
  assert.ok(ics.includes("UID:projector-20260912T210000Z@borrowback.demo"));
  for (const row of ics.split("\r\n")) assert.ok(Buffer.byteLength(row) <= 75);
});
test("storage rejects corrupt duplicate inventory and invalid dates", () => {
  const s = initialState();
  assert.equal(
    stateSchema.safeParse({ ...s, loans: [...s.loans, ...s.loans] }).success,
    false,
  );
  assert.equal(stateSchema.safeParse({ ...s, revision: -1 }).success, false);
  assert.equal(
    stateSchema.safeParse({
      ...s,
      loans: [{ ...s.loans[0], dueDate: "2026-02-30" }],
    }).success,
    false,
  );
});
