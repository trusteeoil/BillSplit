# 🏠 BillSplit

Household expense tracker for two — split bills, track spending, and settle up.

**Live app:** https://trusteeoil.github.io/BillSplit/

## Stack

- Plain HTML, CSS, and JavaScript
- Turso database accessed through its SQL-over-HTTP API
- GitHub Pages hosting
- No build step and no application server

## First-time setup

1. Create an empty Turso database.
2. Create a **database auth token** for that database. Do not use a Turso Platform API token.
3. Open BillSplit and enter the database URL and token.
4. BillSplit verifies the connection and creates its tables automatically.
5. Create or select your person.
6. Repeat the connection and person selection once on the other person's device.

The connection and selected person are stored in that browser's `localStorage`. They are not included in this repository. Anyone with access to that browser profile can retrieve the database token, so this direct-browser design is intended for a small trusted household.

## Files

- `index.html` — Turso connection setup and person selection
- `app.html` — Full expense application
- `turso.js` — Turso HTTP client, local settings, schema, and database adapter

## Database tables

- `people`
- `bills`
- `recurring_bills`
- `history`

IDs are generated in the browser with `crypto.randomUUID()`. History snapshots are stored as JSON text because Turso is SQLite-based.

## Settings

Choose **Database & person settings** from the sidebar to:

- Change or test the database URL and token
- Select a different person
- Create another person
- Forget the saved connection on the current device

Forgetting a connection only clears this browser. It does not delete anything from Turso.

## Deployment

Publish `index.html`, `app.html`, and `turso.js` together at the repository root. GitHub Pages can continue serving the project directly from the `main` branch.

## Existing Supabase data

The new schema is intended for a fresh Turso database. Existing records can be imported separately from CSV or JSON exports of `people`, `bills`, `recurring_bills`, and `history`.
