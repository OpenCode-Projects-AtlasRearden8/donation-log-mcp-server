# donation-log-mcp-server

A **local MCP server for a tidy giving record**: log donation drops with date,
charity, item bags or dollars, your own condition notes, estimated-value
*education pointers* (never tax advice), a "photos-kept-here" folder note, and a
printable quarterly summary for your records binder.

- JSON storage with **path safety** and **auto-backup**
- **CSV export** for spreadsheets
- **No cloud. No accounts.** Everything stays on this computer.

Made by **Asdale Dynamics, LLC** — beginner-friendly, plain-English tools.
Distinct from `receipt-bucket-mcp-server`, which is for *business* receipts;
this one is for *personal giving records*.

> Education only — never tax advice. We never calculate a deduction, never
> claim a tax effect, and never replace a tax professional. See IRS
> Pub 526 / Pub 561 / Pub 1771 and a qualified tax professional with questions.

---

## Tools the server offers

| Tool | What it does |
| --- | --- |
| `log_donation` | Log one drop: date, charity, kind (`items` or `dollars`), bags/boxes/individual items or dollars, your own condition notes, personal notes, optional educational value estimate |
| `set_photos_folder` / `get_photos_folder_note` | Save/read a reminder note of where your donation photos live **locally** (photos are never stored or sent anywhere) |
| `list_donations` | List drops, optionally filtered by `year` and/or `quarter` (1-4) |
| `quarterly_summary` | Printable plain-text summary with totals for your records binder |
| `totals` | Quick numeric totals (counts, bags, boxes, items, dollars, value-estimate totals) |
| `export_csv` | Export all drops to a CSV **inside the data folder** (path-safety enforced) |
| `value_education_pointer` | Show the plain-English value-education reminder |

## Storage layout

```
data/
  donations.json        <- your record (the only file that matters; copy it to back it up)
  backups/              <- auto-backups of donations.json (kept, oldest trimmed)
  exports/              <- your CSV exports land here (if you ask for them)
```

- **Path safety**: export paths must be relative, stay inside `data/`, and end
  in `.csv`. Absolute paths (`/tmp/...`) and `..` escapes are rejected.
- **Auto-backup**: every save snapshots the previous `donations.json` into
  `data/backups/`; the newest 10 backups are kept.

---

## Smoke-test guide (5 minutes, no account needed)

Prereq: Node.js 18.17+ (Node 20 tested). No npm packages required — zero
dependencies.

### 1. Run the offline unit tests

```
npm test
```

Expected: all tests pass (totals, quarters, path safety, CSV, backups).

### 2. Handshake smoke test (initialize + tools/list)

Paste this whole block into your terminal:

```
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2024-11-05" } }
{ "jsonrpc": "2.0", "method": "notifications/initialized" }
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
{ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "log_donation", "arguments": { "date": "2026-02-14", "charity": "Neighborhood Food Pantry", "kind": "items", "items": { "bags": 2 }, "itemDescription": "Canned goods and pasta", "condition": "brand new, before buy", "notes": "drive-by drop on 2/14" } } }
{ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "log_donation", "arguments": { "date": "2026-05-02", "charity": "Neighborhood Food Pantry", "kind": "dollars", "dollars": 25, "estimatedValue": 25 } } }
{ "jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": { "name": "set_photos_folder", "arguments": { "photosFolderNote": "~/Pictures/donation-photos-2026" } } }
{ "jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": { "name": "quarterly_summary", "arguments": { "year": 2026, "quarter": 1 } } }
{ "jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": { "name": "export_csv", "arguments": { "exportPath": "exports/test-export.csv" } } }
```

Run it:

```
node src/server.mjs
```

…and paste the lines, or in one go:

```
printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2024-11-05" } }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }' \
  '{ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "log_donation", "arguments": { "date": "2026-02-14", "charity": "Neighborhood Food Pantry", "kind": "items", "items": { "bags": 2 }, "condition": "brand new, before buy" } } }' \
  '{ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "quarterly_summary", "arguments": { "year": 2026, "quarter": 1 } } }' \
  | node src/server.mjs
```

Expected: one JSON response line per request, including a printable summary
with `Bags of items : 2`, the value-education reminder (`never tax advice`),
and an `data/exports/test-export.csv` file you can open in any spreadsheet app.

### 3. Path-safety smoke test

This should fail politely (not write anywhere else):

```
printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": { "name": "export_csv", "arguments": { "exportPath": "../nope.csv" } } }' \
  | node src/server.mjs
```

Expected: an error result explaining the path must stay inside the data folder.

### 4. Hook it up to your MCP client

Add to your client's MCP config:

```json
{
  "mcpServers": {
    "donation-log": {
      "command": "node",
      "args": ["<full-path-to-this-folder>/src/server.mjs"]
    }
  }
}
```

Optional: set `DONATION_LOG_DATA_DIR` (relative to the current directory) to
choose where the data folder lives. It defaults to `data/` next to the source.

---

## Privacy

- Nothing leaves this computer. No network calls at runtime; no telemetry.
- No accounts, no API keys, no secrets. The value education is baked into the
  tool text.
- Photos are never stored by this server — `set_photos_folder` saves only your
  note pointing at a folder you manage.

## Not tax advice

This project is educational tooling. Estimated values are your own homework
("what a thrift-store item in this condition might sell for") written down for
your records. For anything tax-related, see IRS publications mentioned above
and talk to a qualified professional.

## License

MIT — see `LICENSE`. © **Copyright (c) 2026 Asdale Dynamics, LLC**

More from Asdale Dynamics: [dylanasdale.github.io](https://dylanasdale.github.io) — AI explained like a friend would: plain English, step by step, never condescending.
