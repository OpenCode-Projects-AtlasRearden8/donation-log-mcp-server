#!/usr/bin/env node
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DonationStore,
  ValidationError,
  safeJoinWithin,
} from "./store.mjs";
import {
  renderPrintableSummary,
  summarize,
  VALUE_EDUCATION_POINTER,
  PHOTOS_POINTER,
} from "./summary.mjs";

const SERVER_NAME = "donation-log-mcp-server";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(here, "..", "data");
const dataDir = process.env.DONATION_LOG_DATA_DIR
  ? safeJoinWithin(process.cwd(), process.env.DONATION_LOG_DATA_DIR, "DONATION_LOG_DATA_DIR")
  : defaultDataDir;
fs.mkdirSync(dataDir, { recursive: true });

const store = new DonationStore({ dataDir });

const inputSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Donation date, YYYY-MM-DD" },
    charity: { type: "string", description: "Where you donated" },
    kind: {
      type: "string",
      enum: ["items", "dollars"],
      description: "Physical items dropped off, or dollars given",
    },
    items: {
      type: "object",
      description:
        'For kind "items": counts, e.g. {"bags": 2} or {"boxes": 1, "individualItems": 5}',
      properties: {
        bags: { type: "integer", minimum: 1 },
        boxes: { type: "integer", minimum: 1 },
        individualItems: { type: "integer", minimum: 1 },
      },
    },
    itemDescription: { type: "string", description: "What was in the bags/boxes" },
    dollars: { type: "number", exclusiveMinimum: 0, description: 'Amount given (kind "dollars")' },
    condition: {
      type: "string",
      description: "Your own condition notes, e.g. 'gently used, all buttons intact'",
    },
    notes: { type: "string", description: "Any personal notes for your records" },
    estimatedValue: {
      type: "number",
      minimum: 0,
      description: "Optional educational value estimate (your own homework, not tax advice)",
    },
  },
  required: ["date", "charity", "kind"],
};

const TOOLS = [
  {
    name: "log_donation",
    title: "Log a donation drop",
    description:
      "Record one donation drop with date, charity, item bags/boxes or dollars, your own " +
      "condition notes, optional personal notes, and an optional educational value estimate " +
      "(never tax advice).",
    inputSchema,
  },
  {
    name: "set_photos_folder",
    title: "Set local photos folder note",
    description:
      "Save a reminder note of which local folder the donation photos live in. Photos are " +
      "never stored or sent anywhere by this server; this only remembers your note.",
    inputSchema: {
      type: "object",
      properties: {
        photosFolderNote: {
          type: "string",
          description: "e.g. 'C:/Users/me/Pictures/donations-2026' or '~/Documents/donation-photos'",
          maxLength: 500,
        },
      },
      required: ["photosFolderNote"],
    },
  },
  {
    name: "get_photos_folder_note",
    title: "Get photos folder note",
    description: "Read back the saved local-photos-folder reminder note.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_donations",
    title: "List donations",
    description:
      "List logged donations, optionally filtered by year and/or quarter (1-4).",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer" },
        quarter: { type: "integer", minimum: 1, maximum: 4 },
      },
    },
  },
  {
    name: "quarterly_summary",
    title: "Printable quarterly summary",
    description:
      "Render a printable, plain-text quarterly (or all-time/yearly) summary with totals for " +
      "your records binder. Educational totals only, never tax advice.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer" },
        quarter: { type: "integer", minimum: 1, maximum: 4 },
      },
    },
  },
  {
    name: "totals",
    title: "Totals",
    description:
      "Quick numeric totals (donation count, bags, boxes, items, dollars, educational value " +
      "estimate totals) with the same optional year/quarter filter.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer" },
        quarter: { type: "integer", minimum: 1, maximum: 4 },
      },
    },
  },
  {
    name: "export_csv",
    title: "Export to CSV",
    description:
      "Export every logged donation to a CSV file inside the data folder. Path-safety rules " +
      "apply: relative paths only, must stay inside the data folder, must end with .csv.",
    inputSchema: {
      type: "object",
      properties: {
        exportPath: {
          type: "string",
          description: "Relative path inside the data folder, e.g. 'exports/q1-2026.csv'",
        },
      },
      required: ["exportPath"],
    },
  },
  {
    name: "value_education_pointer",
    title: "Value education pointer",
    description:
      "Show the plain-English reminder about how estimated value is meant to be used " +
      "(education only, never tax advice).",
    inputSchema: { type: "object", properties: {} },
  },
];

function toolHandlers() {
  return {
    log_donation(args) {
      const entry = store.logDonation(args ?? {});
      const lines = [
        `Logged donation #${entry.id} — ${entry.date} — ${entry.charity}`,
        entry.kind === "dollars"
          ? `Dollars given: $${(entry.dollars ?? 0).toFixed(2)}`
          : `Items: ${renderCounts(entry.items)}`,
        VALUE_EDUCATION_POINTER,
        PHOTOS_POINTER,
      ];
      return { text: lines.filter(Boolean).join("\n") };
    },
    set_photos_folder(args) {
      if (typeof args?.photosFolderNote !== "string") {
        throw new ValidationError("photosFolderNote must be a string");
      }
      const saved = store.setPhotosFolderNote(args.photosFolderNote);
      return { text: `Photos folder note saved (kept on this computer only):\n  ${saved}` };
    },
    get_photos_folder_note() {
      const note = store.getPhotosFolderNote();
      return {
        text: note
          ? `Photos folder note:\n  ${note}\n${PHOTOS_POINTER}`
          : `No photos folder note saved yet. Use set_photos_folder.\n${PHOTOS_POINTER}`,
      };
    },
    list_donations(args) {
      const rows = store.listDonations(args ?? {});
      return {
        text:
          rows.length === 0
            ? "No donations found for that filter."
            : rows
                .map((d) => {
                  const what =
                    d.kind === "dollars"
                      ? `$${(d.dollars ?? 0).toFixed(2)}`
                      : renderCounts(d.items);
                  const extras = [
                    d.itemDescription,
                    d.condition ? `condition: ${d.condition}` : null,
                    d.notes ? `notes: ${d.notes}` : null,
                    d.estimatedValue != null
                      ? `educational estimate: $${d.estimatedValue.toFixed(2)} (not tax advice)`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  return `#${d.id} ${d.date} Q${Math.ceil(Number(d.date.slice(5, 7)) / 3)} · ${d.charity} · ${d.kind}: ${what}${extras ? " · " + extras : ""}`;
                })
                .join("\n"),
      };
    },
    quarterly_summary(args) {
      const { year, quarter } = args ?? {};
      if (quarter !== undefined && year === undefined) {
        throw new ValidationError("quarter requires a year too");
      }
      const rows = store.listDonations({ year, quarter });
      return { text: renderPrintableSummary(rows, { year, quarter }) };
    },
    totals(args) {
      const { year, quarter } = args ?? {};
      const rows = store.listDonations({ year, quarter });
      return { text: JSON.stringify(summarize(rows, { year, quarter }), null, 2) };
    },
    export_csv(args) {
      const result = store.exportCsv(args?.exportPath);
      return {
        text: `Exported ${result.rowCount} donation(s) to: ${result.path}\n(CSV stays local in the data folder.)`,
      };
    },
    value_education_pointer() {
      return { text: VALUE_EDUCATION_POINTER + "\n\n" + PHOTOS_POINTER };
    },
  };
}

function renderCounts(items) {
  const parts = [];
  if (items?.bags) parts.push(`${items.bags} bag(s)`);
  if (items?.boxes) parts.push(`${items.boxes} box(es)`);
  if (items?.individualItems) parts.push(`${items.individualItems} individual item(s)`);
  return parts.join(" + ") || "(no counts recorded)";
}

function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

const handlers = toolHandlers();

function handleCall(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion ?? PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    };
  }
  if (request.method === "ping") {
    return {};
  }
  if (request.method === "tools/list") {
    return { tools: TOOLS };
  }
  if (request.method === "tools/call") {
    const name = request.params?.name;
    if (!handlers[name]) {
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
    }
    const { text } = handlers[name](request.params?.arguments);
    return textResult(text);
  }
  throw Object.assign(new Error(`Method not found: ${request.method}`), { code: -32601 });
}

function handleMessage(message) {
  if (message && typeof message === "object" && "method" in message) {
    if (message.id === undefined || message.id === null) {
      return null;
    }
    try {
      const result = handleCall(message);
      return { jsonrpc: "2.0", id: message.id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error:
          err && err.code
            ? { code: err.code, message: err.message }
            : {
                code: err instanceof ValidationError ? -32602 : -32000,
                message: err instanceof Error ? err.message : String(err),
              },
      };
    }
  }
  if (message && typeof message === "object" && "id" in message && "error" in message) {
    return null;
  }
  return null;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      }) + "\n"
    );
    return;
  }
  const response = handleMessage(message);
  if (response) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }
});
rl.on("close", () => process.exit(0));
