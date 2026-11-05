# STATUS.md — donation-log-mcp-server

Date: 2026-11-05
Owner: Asdale Dynamics, LLC

## What was built

A local-only MCP (Model Context Protocol) server that keeps a tidy personal
giving record. Plain Node.js, **zero npm dependencies** — nothing to install
beyond Node itself, no network access in the code.

**Tools provided over stdio JSON-RPC:**

| Tool | Purpose |
| --- | --- |
| `log_donation` | Log a drop: date, charity, kind (`items`/`dollars`), bags/boxes/individual items or dollars, your own condition notes, personal notes, optional educational value estimate (never tax advice) |
| `set_photos_folder` / `get_photos_folder_note` | Remember where donation photos are kept locally; the server never stores images |
| `list_donations` | List drops with optional `year`/`quarter` filter |
| `quarterly_summary` | Printable plain-text summary for a records binder (totals by quarter/year/all-time, by-charity lines, detail with condition notes) |
| `totals` | Quick numeric totals (donation count, bags, boxes, individual items, dollars, value-estimate totals) |
| `export_csv` | Export all drops to CSV inside the data folder |
| `value_education_pointer` | Plain-English reminder about what estimated value means (education only) |

**Storage & safety:**

- `data/donations.json` — plain JSON record (portable, copyable).
- **Auto-backup**: every save snapshots the previous file into `data/backups/`;
  newest 10 kept (names timestamped + serialized to avoid same-millisecond collisions — a real bug found and fixed during testing).
- **Path safety**: export paths must be relative, stay inside `data/`, end in
  `.csv`; absolute paths, `..` escapes, and NUL bytes are rejected.
  `DONATION_LOG_DATA_DIR` is validated the same way at startup.
- Atomic-ish save: writes to a temp file then renames.
- Validation: real calendar dates (rejects 2026-02-30), positive integers for
  counts, positive dollars, string length caps.

**Distinct from receipt-bucket-mcp-server**: this is for *personal giving
records*, not business receipts.

**Style**: education never tax advice — the server never calculates deductions
or claims tax effects; the printed summary and every value estimate come with
the plain-English reminder (IRS Pub 526/561/1771 referenced). No cloud, no
accounts, no telemetry; photos stay on the user's computer.

## How to run it

```
npm test                 # offline unit tests (Node 18.17+, zero deps)
node src/server.mjs      # server on stdio; paste JSON-RPC lines or wire into an MCP client
```

Full 5-minute smoke-test walkthrough (handshake, logging, quarterly summary,
CSV export, path-safety rejection) is in `README.md`.

## Verification results (all run in this folder, 2026-11-05)

- `npm test` — **21/21 pass**, 0 failures (`node --test`).
- Stdio smoke test (11 JSON-RPC messages piped into the server):
  - `initialize` → correct `serverInfo` + protocol echo: ok
  - `notifications/initialized` → correctly ignored: ok
  - `tools/list` → all 8 tools: ok
  - `log_donation` items + dollars → both saved with education pointers: ok
  - `set/get_photos_folder_note` → round-trip: ok
  - `quarterly_summary` 2026 Q1 → printable binder text with totals: ok
  - `export_csv` → wrote `data/exports/test-export.csv`, proper quoting
    (commas and embedded newline escaped correctly): ok
  - `export_csv` with `../nope.csv` → rejected with clear error, exit
    unchanged, nothing written outside `data/`: ok
  - `ping` → `{}`: ok
- `DONATION_LOG_DATA_DIR=custom-data` → data folder honored; `../bad` →
  rejected loudly at startup: ok
- Runtime test data was wiped after verification (`data/` is gitignored).

## Known gaps

- No pagination in `list_donations` (fine for personal scale; add if the record
  grows to thousands of entries).
- CSV export always includes all donations; per-quarter CSV needs a filter
  argument (the quarterly summary text covers the binder use for now).
- No server-level delete/edit tool yet (delete a line in
  `data/donations.json`, or via a future `delete_donation` tool).
- MCP server info mirrors the client's requested protocol version; spec-level
  compliance tested only against newline-delimited stdio (the common client
  transport), not other framings.
- No persistent read lock; assumes one process writing at a time (normal for a
  single-user local MCP server).

## License

MIT — `LICENSE`, exactly: Copyright (c) 2026 Asdale Dynamics, LLC
