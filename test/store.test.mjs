import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DonationStore,
  ValidationError,
  quarterOf,
  quarterRange,
  safeJoinWithin,
  MAX_BACKUPS,
} from "../src/store.mjs";

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "donation-log-"));
  return { store: new DonationStore({ dataDir: dir }), dir };
}

function itemsInput(date, charity, items, extra = {}) {
  return { date, charity, kind: "items", items, ...extra };
}

const DOLLAR_INPUT = (date, charity, dollars, extra = {}) => ({
  date,
  charity,
  kind: "dollars",
  dollars,
  ...extra,
});

test("quarterOf: months map to calendar quarters", () => {
  assert.equal(quarterOf("2026-01-01"), 1);
  assert.equal(quarterOf("2026-03-31"), 1);
  assert.equal(quarterOf("2026-04-01"), 2);
  assert.equal(quarterOf("2026-07-15"), 3);
  assert.equal(quarterOf("2026-10-05"), 4);
  assert.equal(quarterOf("1999-12-24"), 4);
});

test("quarterRange: start and exclusive end for each quarter", () => {
  assert.deepEqual(quarterRange(2026, 1), { start: "2026-01-01", endExclusive: "2026-04-01" });
  assert.deepEqual(quarterRange(2026, 2), { start: "2026-04-01", endExclusive: "2026-07-01" });
  assert.deepEqual(quarterRange(2026, 3), { start: "2026-07-01", endExclusive: "2026-10-01" });
  assert.deepEqual(quarterRange(2026, 4), { start: "2026-10-01", endExclusive: "2027-01-01" });
});

test("listDonations filters by quarter only within that quarter (no bleed-over)", () => {
  const t = tempStore();
  t.store.logDonation(itemsInput("2026-02-10", "Local Shelter", { bags: 1 }));
  t.store.logDonation(itemsInput("2026-05-03", "Hospital Closet", { bags: 1 }));
  t.store.logDonation(itemsInput("2026-08-11", "Church Pantry", { boxes: 1 }));
  t.store.logDonation(itemsInput("2025-05-09", "Old Year", { bags: 1 }));
  const q2 = t.store.listDonations({ year: 2026, quarter: 2 });
  assert.deepEqual(
    q2.map((d) => d.charity),
    ["Hospital Closet"]
  );
  const sameDayNextQuarter = t.store.listDonations({ year: 2026, quarter: 3 });
  assert.equal(sameDayNextQuarter.length, 1);
});

test("totals add up across item and dollars entries", () => {
  const t = tempStore();
  t.store.logDonation(itemsInput("2026-01-05", "Charity A", { bags: 2 }));
  t.store.logDonation(
    itemsInput("2026-01-20", "Charity B", { boxes: 1, individualItems: 5 }, {
      estimatedValue: 12.5,
    })
  );
  t.store.logDonation(DOLLAR_INPUT("2026-01-25", "Charity A", 25.105, { estimatedValue: 0 }));
  const totals = t.store.totals(t.store.listDonations({ year: 2026 }));
  assert.equal(totals.donationCount, 3);
  assert.equal(totals.itemEntries, 2);
  assert.equal(totals.bagCount, 2);
  assert.equal(totals.boxCount, 1);
  assert.equal(totals.individualItemCount, 5);
  assert.equal(totals.dollarsEntries, 1);
  assert.equal(totals.dollarsTotal, 25.11);
  assert.equal(totals.estimatedValueTotal, 12.5);
});

test("totals for a quarter only count that quarter", () => {
  const t = tempStore();
  t.store.logDonation(itemsInput("2026-01-05", "Charity A", { bags: 1 }));
  t.store.logDonation(DOLLAR_INPUT("2026-04-20", "Charity B", 40));
  const q1 = t.store.totals(t.store.listDonations({ year: 2026, quarter: 1 }));
  assert.equal(q1.dollarsTotal, 0);
  assert.equal(q1.bagCount, 1);
  const q2 = t.store.totals(t.store.listDonations({ year: 2026, quarter: 2 }));
  assert.equal(q2.dollarsTotal, 40);
  assert.equal(q2.bagCount, 0);
});

test("validation rejects bad dates", () => {
  const t = tempStore();
  for (const bad of ["2026-13-01", "2026-02-30", "03-2026", "not a date"]) {
    assert.throws(
      () => t.store.logDonation(DOLLAR_INPUT(bad, "Charity", 10)),
      ValidationError
    );
  }
  assert.throws(
    () => t.store.logDonation(DOLLAR_INPUT("2026-2-30", "Charity", 10)),
    ValidationError
  );
});

test("validation rejects invalid input", () => {
  const t = tempStore();
  assert.throws(() => t.store.logDonation({ date: "2026-01-01", charity: "", kind: "dollars", dollars: 5 }), ValidationError);
  assert.throws(() => t.store.logDonation({ date: "2026-01-01", charity: "C", kind: "candy" }), ValidationError);
  assert.throws(() => t.store.logDonation({ date: "2026-01-01", charity: "C", kind: "dollars", dollars: -1 }), ValidationError);
  assert.throws(() => t.store.logDonation({ date: "2026-01-01", charity: "C", kind: "dollars", dollars: 0 }), ValidationError);
  assert.throws(() => t.store.logDonation(itemsInput("2026-01-01", "C", {})), ValidationError);
  assert.throws(() => t.store.logDonation(itemsInput("2026-01-01", "C", { bags: 1.5 })), ValidationError);
  assert.throws(() => t.store.logDonation(itemsInput("2026-01-01", "C", { bags: 0 })), ValidationError);
  assert.throws(() => t.store.logDonation({ date: "2026-01-01", charity: "C", kind: "dollars", dollars: 1, notes: 9 }), ValidationError);
  assert.throws(() => t.store.logDonation({ date: "2026-01-01", charity: "C", kind: "dollars", dollars: 1, estimatedValue: -3 }), ValidationError);
});

test("empty quarter returns zeroed totals and printable handles it", () => {
  const t = tempStore();
  const rows = t.store.listDonations({ year: 2030, quarter: 3 });
  assert.equal(rows.length, 0);
  const totals = t.store.totals(rows);
  assert.equal(totals.donationCount, 0);
  assert.equal(totals.estimatedValueTotal, 0);
});

test("photo folder note round-trips", () => {
  const t = tempStore();
  assert.equal(t.store.getPhotosFolderNote(), "");
  t.store.setPhotosFolderNote("~/Documents/donation-photos");
  assert.equal(t.store.getPhotosFolderNote(), "~/Documents/donation-photos");
  assert.throws(() => t.store.setPhotosFolderNote(42), ValidationError);
});

test("path safety: rejects absolute, escaping, and NUL paths; allows safe relative", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "donation-log-"));
  assert.throws(() => safeJoinWithin(dir, "/etc/passwd"), ValidationError);
  assert.throws(() => safeJoinWithin(dir, "../escape.csv"), ValidationError);
  assert.throws(() => safeJoinWithin(dir, "a/../../escape.csv"), ValidationError);
  assert.throws(() => safeJoinWithin(dir, "bad\0nul.csv"), ValidationError);
  assert.throws(() => safeJoinWithin(dir, ""), ValidationError);
  const ok = safeJoinWithin(dir, "exports/q1.csv");
  assert.ok(ok.startsWith(path.resolve(dir) + path.sep));
});

test("export_csv writes escaped CSV inside data dir only", () => {
  const t = tempStore();
  t.store.logDonation(
    itemsInput("2026-03-01", 'Charity, "Goofy" Name', { bags: 2 }, {
      itemDescription: "Kids winter clothes, size 5",
      condition: "gently used",
      notes: "line1\nline2",
      estimatedValue: 25.5,
    })
  );
  assert.throws(() => t.store.exportCsv("../bad.csv"), ValidationError);
  assert.throws(() => t.store.exportCsv("/tmp/bad.csv"), ValidationError);
  assert.throws(() => t.store.exportCsv("no-extension"), ValidationError);
  const res = t.store.exportCsv("exports/test.csv");
  assert.equal(res.rowCount, 1);
  const csv = fs.readFileSync(res.path, "utf8").split("\r\n");
  assert.equal(csv[0].split(",").length, 14);
  assert.ok(csv.some((line) => line.includes('"Charity, ""Goofy"" Name"')));
  assert.ok(csv.some((line) => line.includes('"line1\nline2"')));
});

test("auto-backup: backups accumulate up to MAX_BACKUPS and cap works", () => {
  const { store, dir } = tempStore();
  for (let i = 0; i < MAX_BACKUPS + 3; i++) {
    store.logDonation(DOLLAR_INPUT("2026-01-15", "Charity A", 10 + i));
  }
  const backupsDir = path.join(dir, "backups");
  const backups = fs.readdirSync(backupsDir);
  assert.equal(backups.length, MAX_BACKUPS);
  const data = JSON.parse(fs.readFileSync(path.join(dir, "donations.json"), "utf8"));
  assert.equal(data.donations.length, MAX_BACKUPS + 3);
  assert.equal(data.donations.at(-1).dollars, 10 + MAX_BACKUPS + 2);
});

test("store persists across reloads (JSON file storage)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "donation-log-"));
  const a = new DonationStore({ dataDir: dir });
  a.logDonation(itemsInput("2026-01-05", "Persist Charity", { bags: 1 }, { condition: "mint-ish" }));
  const b = new DonationStore({ dataDir: dir });
  const rows = b.listDonations();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].charity, "Persist Charity");
  assert.equal(rows[0].condition, "mint-ish");
  assert.equal(b.getPhotosFolderNote(), "");
  b.setPhotosFolderNote(" ethical folder ");
  const c = new DonationStore({ dataDir: dir });
  assert.equal(c.getPhotosFolderNote(), "ethical folder");
});

test("totals handles unknown-magnitude entries and rounding", () => {
  const t = tempStore();
  t.store.logDonation(DOLLAR_INPUT("2026-01-05", "Charity", 0.007, { estimatedValue: 0.006 }));
  const totals = t.store.totals(t.store.listDonations());
  assert.equal(totals.dollarsTotal, 0.01);
  assert.equal(totals.estimatedValueTotal, 0.01);
});
