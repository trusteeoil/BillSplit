# 🏠 BillSplit

Household expense tracker for two — split bills, track spending, and settle up.

**Live app:** https://trusteeoil.github.io/BillSplit/

## What it does

- Tracks shared expenses and who paid each one
- Supports 50/50, full, and custom percentage splits
- Calculates the balance from the selected person's perspective
- Stores reusable recurring-bill templates
- Archives expenses and balance details when a period is settled
- Shows spending reports by month and category
- Exports expenses by year as CSV
- Imports a two-person Splitwise group export, including settlement history
- Works on desktop and mobile with no installation or application server

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

There are no BillSplit usernames or passwords. The Turso URL and token connect the household to its database, while the locally selected person determines what “you paid,” “you owe,” and “others owe you” mean on that device.

## Everyday use

After setup, opening the site goes directly to the ledger. Expenses, recurring templates, people, and settlement history are read from and written to the shared Turso database. Changes made on one device are available to the other device the next time it loads or refreshes the relevant data.

The percentage stored on each expense is the amount the non-payer owes the payer:

- `50` means an even 50/50 split
- `100` means the other person owes the full expense
- A custom value such as `30` means the other person owes 30%

Settling up copies the current expenses into a history snapshot and clears the active ledger. Recurring templates are not inserted automatically; BillSplit prompts when templates appear due and lets the user add them.

## Importing from Splitwise

Choose **Import** directly below **Export** in the left sidebar, then select the CSV exported from a two-person Splitwise group. Review the preview and choose how BillSplit should handle old expenses:

- **Use completed Splitwise settlements** (recommended) detects when the running Splitwise balance returned to zero. Completed periods become history, partial payments carry into the next period, and expenses after the last completed settlement remain outstanding.
- **Treat all completed months as settled** archives every calendar month before the current month. This is useful when the export does not contain dependable payment history.
- **Import every expense as outstanding** places all imported expenses in the active ledger.

The importer supports USD exports with exactly two people. It creates either person if their name is not already in BillSplit, preserves custom split percentages, skips Splitwise's final balance summary row, and assigns stable IDs so importing the same export again does not duplicate expenses. Payment rows determine settlement boundaries but are not themselves added as expenses.

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

Choose **Settings** from the sidebar to:

- See which person is active on the current device
- Switch to a different person
- Add or edit people
- Change and test the database URL and token
- Forget the saved connection on the current device

Forgetting a connection only clears this browser. It does not delete anything from Turso.

Selecting a person returns to the app using that person's perspective. Adding or editing a person stays within Settings so more changes can be made. Person records are shared through Turso, but each browser remembers its own selected person.

Settings is divided into three tabs:

- **People** — switch, add, or edit household members
- **Connection** — change, test, or forget the Turso connection on this device
- **Share** — copy a private setup link for another household device

The share link Base64-encodes the Turso URL and database token inside a URL `#` fragment. The fragment is handled by the browser and is not sent to GitHub Pages. When opened, BillSplit removes the fragment from the address bar, tests and saves the connection, and opens the person picker.

Base64 is not encryption. Anyone who receives the complete share link can decode the token and access the database, so the link should only be sent privately to a trusted household member.

## Deployment

Publish `index.html`, `app.html`, and `turso.js` together at the repository root. GitHub Pages can continue serving the project directly from the `main` branch.

No Turso credentials belong in these files. Each device enters them through the setup screen after deployment.

## Existing Supabase data

The new schema is intended for a fresh Turso database. Existing records can be imported separately from CSV or JSON exports of `people`, `bills`, `recurring_bills`, and `history`.
