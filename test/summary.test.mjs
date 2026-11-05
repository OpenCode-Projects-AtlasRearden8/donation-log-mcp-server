import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, renderPrintableSummary, VALUE_EDUCATION_POINTER } from "../src/summary.mjs";

const rows = [
  { id: 1, date: "2026-01-05", charity: "Charity A", kind: "items", items: { bags: 2, individualItems: 4 }, condition: "gently used", notes: "kids clothes" },
  { id: 2, date: "2026-04-10", charity: "Charity B", kind: "dollars", dollars: 20, estimatedValue: null },
  { id: 3, date: "2026-05-22", charity: "Charity B", kind: "items", items: { boxes: 1 }, estimatedValue: 35.5 },
  { id: 4, date: "2026-11-30", charity: "Charity C", kind: "dollars", dollars: 5.05 },
];

test("summarize: all-time totals", () => {
  const s = summarize(rows);
  assert.equal(s.donationCount, 4);
  assert.equal(s.bagCount, 2);
  assert.equal(s.individualItemCount, 4);
  assert.equal(s.boxCount, 1);
  assert.equal(s.dollarsTotal, 25.05);
  assert.equal(s.estimatedValueTotal, 35.5);
  assert.deepEqual(s.charities.map((c) => c.charity), ["Charity B", "Charity A", "Charity C"]);
  assert.equal(s.charities[0].drops, 2);
});

test("summarize: Q1 2026", () => {
  const s = summarize(
    rows.filter((r) => r.date >= "2026-01-01" && r.date < "2026-04-01"),
    { year: 2026, quarter: 1 }
  );
  assert.equal(s.donationCount, 1);
  assert.equal(s.dollarsTotal, 0);
  assert.equal(s.bagCount, 2);
  assert.equal(s.dateRange.start, "2026-01-01");
  assert.equal(s.dateRange.endExclusive, "2026-04-01");
});

test("summarize: Q4 2026", () => {
  const s = summarize(
    rows.filter((r) => r.date >= "2026-10-01" && r.date < "2027-01-01"),
    { year: 2026, quarter: 4 }
  );
  assert.equal(s.donationCount, 1);
  assert.equal(s.dollarsTotal, 5.05);
  assert.equal(s.dateRange.endExclusive, "2027-01-01");
});

test("summarize: empty selection zeroed", () => {
  const s = summarize([], { year: 2099, quarter: 2 });
  assert.equal(s.donationCount, 0);
  assert.equal(s.dollarsTotal, 0);
  assert.equal(s.charities.length, 0);
});

test("printable summary includes the boundaries and non-advice framing", () => {
  const q2 = rows.filter((r) => r.date >= "2026-04-01" && r.date < "2026-07-01");
  const text = renderPrintableSummary(q2, { year: 2026, quarter: 2 });
  assert.ok(text.includes("Quarter 2"));
  assert.ok(text.includes("(2026-04-01"));
  assert.ok(text.includes("no tax advice") || text.includes("not tax advice"));
  assert.ok(!/deduction of \$\d/.test(text));
  assert.ok(text.includes("Charity B"));
  assert.ok(text.includes("$20.00"));
  assert.ok(text.includes("Q2 · 2026-05-22 · Charity B · 1 box(es)"));
  assert.ok(text.includes("Photos stay on this computer only"));
});

test("printable summary empty period", () => {
  const text = renderPrintableSummary([], { year: 2099, quarter: 3 });
  assert.ok(text.includes("(none yet)"));
  assert.ok(text.includes("no donations in this selection"));
});

test("value education pointer never promises tax numbers", () => {
  assert.ok(VALUE_EDUCATION_POINTER.includes("not tax advice"));
  assert.ok(VALUE_EDUCATION_POINTER.includes("never calculate a deduction") || VALUE_EDUCATION_POINTER.includes("never calculate"));
});
