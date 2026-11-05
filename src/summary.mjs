import { quarterOf, quarterRange } from "./store.mjs";

export const VALUE_EDUCATION_POINTER =
  "Value education (not tax advice): estimated values, when logged, are " +
  "'what a thrift-store item in this condition might sell for', the same way " +
  "the IRS suggests supporting records (see IRS Pub 561/Pub 1771 for how fair " +
  "market value is generally documented). We teach the idea in plain English; " +
  "we never calculate a deduction, never claim tax effects, and never replace " +
  "a tax professional. Keep receipts, itemized lists, and photos here locally.";

export const PHOTOS_POINTER =
  "Photos stay on this computer only. Set your local photos folder with " +
  "set_photos_folder and drop shots into that place; this app records the " +
  "reminder note, never the images themselves. No cloud, no accounts.";

export function summarize(rows, { year, quarter } = {}) {
  let donationCount = 0;
  let bagCount = 0;
  let boxCount = 0;
  let individualItemCount = 0;
  let dollarsTotal = 0;
  let estimatedValueTotal = 0;
  const charities = new Map();

  for (const d of rows) {
    donationCount += 1;
    const c = charities.get(d.charity) ?? { drops: 0 };
    c.drops += 1;
    charities.set(d.charity, c);
    if (d.kind === "items") {
      bagCount += d.items?.bags ?? 0;
      boxCount += d.items?.boxes ?? 0;
      individualItemCount += d.items?.individualItems ?? 0;
    }
    if (d.kind === "dollars") {
      dollarsTotal += d.dollars ?? 0;
    }
    estimatedValueTotal += d.estimatedValue ?? 0;
  }

  return {
    year,
    quarter,
    dateRange: year && quarter ? quarterRange(year, quarter) : null,
    donationCount,
    bagCount,
    boxCount,
    individualItemCount,
    dollarsTotal: Math.round(dollarsTotal * 100) / 100,
    estimatedValueTotal: Math.round(estimatedValueTotal * 100) / 100,
    charities: [...charities.entries()]
      .map(([name, c]) => ({ charity: name, drops: c.drops }))
      .sort((a, b) => b.drops - a.drops || a.charity.localeCompare(b.charity)),
  };
}

export function renderPrintableSummary(rows, { year, quarter } = {}) {
  const t = summarize(rows, { year, quarter });
  const lines = [];
  const titleBits = ["Donation Summary"];

  if (year) titleBits.push(`Year ${year}`);
  if (quarter) titleBits.push(`Quarter ${quarter}`);
  if (t.dateRange) {
    titleBits.push(`(${t.dateRange.start} up to, not including, ${t.dateRange.endExclusive})`);
  }

  lines.push("=".repeat(64));
  lines.push(titleBits.join(" "));
  lines.push("");
  lines.push("For your personal records binder. Educational use only;");
  lines.push("not tax advice. See IRS Pub 526/561 and a tax pro for tax questions.");
  lines.push("");
  lines.push(`Donations in period : ${t.donationCount}`);
  lines.push(`Bags of items       : ${t.bagCount}`);
  lines.push(`Boxes of items      : ${t.boxCount}`);
  lines.push(`Individual items    : ${t.individualItemCount}`);
  lines.push(`Dollars given       : $${t.dollarsTotal.toFixed(2)}`);
  lines.push(
    `Educational est. value total (only where logged): $${t.estimatedValueTotal.toFixed(2)}`
  );
  lines.push("");
  lines.push("By charity:");
  if (t.charities.length === 0) {
    lines.push("  (none yet)");
  } else {
    for (const c of t.charities) {
      lines.push(`  ${c.charity} — ${c.drops} drop(s)`);
    }
  }
  lines.push("");
  lines.push("Detail:");
  if (rows.length === 0) {
    lines.push("  (no donations in this selection)");
  } else {
    for (const d of rows) {
      const what =
        d.kind === "dollars" ? `$${(d.dollars ?? 0).toFixed(2)} cash/check` : describeItems(d);
      let line = `Q${quarterOf(d.date)} · ${d.date} · ${d.charity} · ${what}`;
      if (d.condition || d.notes) {
        line += `\n    need to know: ${[d.condition, d.notes].filter(Boolean).join("; ")}`;
      }
      if (d.estimatedValue != null) {
        line += `\n    educational value estimate: $${d.estimatedValue.toFixed(2)} (not tax advice)`;
      }
      lines.push(line);
    }
  }
  lines.push("");
  lines.push("Photos reminder: " + PHOTOS_POINTER);
  lines.push("Value education reminder: " + VALUE_EDUCATION_POINTER);
  lines.push("=".repeat(64));
  return lines.join("\n");
}

function describeItems(d) {
  const parts = [];
  if (d.items?.bags) parts.push(`${d.items.bags} bag(s)`);
  if (d.items?.boxes) parts.push(`${d.items.boxes} box(es)`);
  if (d.items?.individualItems) parts.push(`${d.items.individualItems} individual item(s)`);
  return parts.join(" + ") + (d.itemDescription ? ` — ${d.itemDescription}` : "");
}
