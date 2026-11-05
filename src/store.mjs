import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MAX_BACKUPS = 10;

export class ValidationError extends Error {}

export function safeJoinWithin(root, relativePath, label = "path") {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  if (path.isAbsolute(relativePath)) {
    throw new ValidationError(`${label} must be relative, not absolute`);
  }
  if (relativePath.includes("\0")) {
    throw new ValidationError(`${label} contains invalid characters`);
  }
  const resolved = path.resolve(root, relativePath);
  const rootResolved = path.resolve(root) + path.sep;
  if (resolved !== path.resolve(root) && !resolved.startsWith(rootResolved)) {
    throw new ValidationError(
      `${label} must stay inside the data folder (no ".." escapes)`
    );
  }
  return resolved;
}

export class DonationStore {
  #backupCounter = 1;

  constructor({ dataDir }) {
    this.dataDir = path.resolve(dataDir);
    this.file = path.join(this.dataDir, "donations.json");
    this.backupsDir = path.join(this.dataDir, "backups");
    fs.mkdirSync(this.backupsDir, { recursive: true });
    this.data = this.#load();
  }

  #load() {
    if (!fs.existsSync(this.file)) {
      return { version: 1, nextId: 1, photosFolderNote: "", donations: [] };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return {
        version: 1,
        nextId: Number.isInteger(parsed.nextId) ? parsed.nextId : 1,
        photosFolderNote:
          typeof parsed.photosFolderNote === "string"
            ? parsed.photosFolderNote
            : "",
        donations: Array.isArray(parsed.donations) ? parsed.donations : [],
      };
    } catch {
      return { version: 1, nextId: 1, photosFolderNote: "", donations: [] };
    }
  }

  #backup() {
    if (!fs.existsSync(this.file)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const copy = path.join(this.backupsDir, `donations-${stamp}-${this.#backupCounter++}.json`);
    fs.copyFileSync(this.file, copy);
    const backups = fs
      .readdirSync(this.backupsDir)
      .filter((f) => f.startsWith("donations-") && f.endsWith(".json"))
      .sort();
    while (backups.length > MAX_BACKUPS) {
      fs.unlinkSync(path.join(this.backupsDir, backups.shift()));
    }
  }

  #save() {
    this.#backup();
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.file);
  }

  setPhotosFolderNote(folderNote) {
    if (typeof folderNote !== "string") {
      throw new ValidationError("photosFolderNote must be a string");
    }
    if (folderNote.length > 500) {
      throw new ValidationError("photosFolderNote must be 500 characters or fewer");
    }
    this.data.photosFolderNote = folderNote.trim();
    this.#save();
    return this.data.photosFolderNote;
  }

  getPhotosFolderNote() {
    return this.data.photosFolderNote;
  }

  logDonation(input) {
    const entry = this.#validate(input);
    entry.id = this.data.nextId;
    this.data.nextId += 1;
    entry.loggedAt = new Date().toISOString();
    this.data.donations.push(entry);
    this.#save();
    return entry;
  }

  #validate(input) {
    const errs = [];
    const date = input?.date;
    const charity = input?.charity;

    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date !== ISOify(date)) {
      errs.push("date must be a valid calendar date in YYYY-MM-DD format");
    }

    if (typeof charity !== "string" || charity.trim() === "") {
      errs.push("charity must be a non-empty string");
    } else if (charity.length > 200) {
      errs.push("charity must be 200 characters or fewer");
    }

    const kind = input?.kind;
    if (kind !== "items" && kind !== "dollars") {
      errs.push('kind must be "items" or "dollars"');
    }

    let items = null;
    let dollars = null;

    if (kind === "items") {
      items = normalizeItems(input?.items);
      if (!items) {
        errs.push(
          "for kind \"items\", provide items as countable units, e.g. { bags: 2 } or { boxes: 1, individualItems: 5 } (each a positive whole number)"
        );
      }
      const desc = input?.itemDescription;
      if (desc !== undefined && typeof desc !== "string") {
        errs.push("itemDescription must be a string");
      } else if (typeof desc === "string" && desc.length > 500) {
        errs.push("itemDescription must be 500 characters or fewer");
      }
    }

    if (kind === "dollars") {
      const dollarsValue = input?.dollars;
      if (typeof dollarsValue !== "number" || !Number.isFinite(dollarsValue) || dollarsValue <= 0) {
        errs.push('for kind "dollars", dollars must be a positive number');
      } else {
        dollars = Math.round(dollarsValue * 100) / 100;
      }
    }

    const condition = input?.condition;
    if (condition !== undefined && condition !== null) {
      if (typeof condition !== "string") {
        errs.push("condition must be a string");
      } else if (condition.length > 500) {
        errs.push("condition must be 500 characters or fewer");
      }
    }

    const notes = input?.notes;
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== "string") {
        errs.push("notes must be a string");
      } else if (notes.length > 1000) {
        errs.push("notes must be 1000 characters or fewer");
      }
    }

    let estimatedValue = null;
    if (input?.estimatedValue !== undefined && input?.estimatedValue !== null) {
      const ev = input.estimatedValue;
      if (typeof ev !== "number" || !Number.isFinite(ev) || ev < 0) {
        errs.push("estimatedValue must be a non-negative number");
      } else {
        estimatedValue = Math.round(ev * 100) / 100;
      }
    }

    if (errs.length > 0) {
      throw new ValidationError(errs.join("; "));
    }

    const entry = {
      date,
      charity: charity.trim(),
      kind,
    };
    if (kind === "items") {
      entry.items = items;
    }
    if (kind === "dollars") {
      entry.dollars = dollars;
    }
    if (typeof input?.itemDescription === "string" && input.itemDescription.trim() !== "") {
      entry.itemDescription = input.itemDescription.trim();
    }
    if (typeof condition === "string" && condition.trim() !== "") {
      entry.condition = condition.trim();
    }
    if (typeof notes === "string" && notes.trim() !== "") {
      entry.notes = notes.trim();
    }
    if (estimatedValue !== null) {
      entry.estimatedValue = estimatedValue;
    }
    return entry;
  }

  listDonations({ year, quarter } = {}) {
    let rows = [...this.data.donations];
    if (year !== undefined || quarter !== undefined) {
      const q = quarter ?? 0;
      rows = rows.filter((d) => {
        const [y, m] = d.date.split("-").map(Number);
        const matchYear = year === undefined || y === year;
        const qi = Math.ceil(m / 3);
        const matchQuarter = quarter === undefined || qi === q;
        return matchYear && matchQuarter;
      });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  }

  totals(rows) {
    let donationCount = 0;
    let itemEntries = 0;
    let bagCount = 0;
    let boxCount = 0;
    let individualItemCount = 0;
    let dollarsEntries = 0;
    let dollarsTotal = 0;
    let estimatedValueTotal = 0;

    for (const d of rows) {
      donationCount += 1;
      if (d.kind === "items") {
        itemEntries += 1;
        bagCount += d.items?.bags ?? 0;
        boxCount += d.items?.boxes ?? 0;
        individualItemCount += d.items?.individualItems ?? 0;
      }
      if (d.kind === "dollars") {
        dollarsEntries += 1;
        dollarsTotal += d.dollars ?? 0;
      }
      estimatedValueTotal += d.estimatedValue ?? 0;
    }

    return {
      donationCount,
      itemEntries,
      bagCount,
      boxCount,
      individualItemCount,
      dollarsEntries,
      dollarsTotal: round2(dollarsTotal),
      estimatedValueEntries: rows.filter((d) => d.estimatedValue != null).length,
      estimatedValueTotal: round2(estimatedValueTotal),
    };
  }

  exportCsv(relativePath) {
    const target = safeJoinWithin(this.dataDir, relativePath, "exportPath");
    if (!target.endsWith(".csv")) {
      throw new ValidationError("exportPath must end with .csv");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const header = [
      "id",
      "date",
      "quarter",
      "charity",
      "kind",
      "bags",
      "boxes",
      "individual_items",
      "dollars",
      "estimated_value",
      "item_description",
      "condition",
      "notes",
      "logged_at",
    ].join(",");
    const lines = this.listDonations().map((d) =>
      [
        d.id,
        d.date,
        quarterOf(d.date),
        d.charity,
        d.kind,
        d.items?.bags ?? "",
        d.items?.boxes ?? "",
        d.items?.individualItems ?? "",
        d.dollars ?? "",
        d.estimatedValue ?? "",
        d.itemDescription ?? "",
        d.condition ?? "",
        d.notes ?? "",
        d.loggedAt ?? "",
      ]
        .map(csvField)
        .join(",")
    );
    fs.writeFileSync(target, [header, ...lines].join("\r\n") + "\r\n", "utf8");
    return { path: target, rowCount: this.data.donations.length };
  }
}

function ISOify(dateString) {
  const [y, m, d] = dateString.split("-").map((s) => s.slice(0, 4).padStart(2, "0"));
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const norm = (n) => String(n).padStart(4, "0").slice(-4);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${norm(dt.getUTCFullYear())}-${mm}-${dd}`;
}

function normalizeItems(items) {
  if (items === null || typeof items !== "object" || Array.isArray(items)) return null;
  const { bags, boxes, individualItems } = items;
  const positiveInt = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
  const out = {};
  for (const [key, value] of [
    ["bags", bags],
    ["boxes", boxes],
    ["individualItems", individualItems],
  ]) {
    if (value === undefined) continue;
    if (!positiveInt(value)) return null;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function quarterOf(date) {
  const m = Number(date.slice(5, 7));
  return Math.ceil(m / 3);
}

export function quarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endYear = quarter === 4 ? year + 1 : year;
  const endMonth = quarter === 4 ? 1 : startMonth + 3;
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
  return { start, endExclusive: end };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function csvField(value) {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
