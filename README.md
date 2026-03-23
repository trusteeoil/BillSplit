# 🏠 BillSplit

> Household expense tracker for two — split bills, track spending, and settle up.

**Live app:** https://trusteeoil.github.io/BillSplit/
**Repo:** https://github.com/trusteeoil/BillSplit

---

## What It Is

BillSplit is a private household expense tracker built for two people. It tracks shared bills across months, calculates who owes what based on how each bill is split, supports recurring expenses, and lets you archive each settlement period to history. The entire app is two HTML files with no build step.

---

## Features

- **Expense tracking** — Add, edit, and delete expenses with 14 category icons
- **Flexible splits** — 50/50, Full (other person owes 100%), or Custom % per bill
- **Recurring bills** — Save templates (mortgage, streaming, internet, etc.) and add them each month in one tap
- **Settle up** — Archive the running balance to history and reset to zero
- **Monthly history** — View past settlement periods with balance snapshots and bill breakdowns
- **Reports** — Monthly totals bar chart + per-month spending by category (collapsible, scaled to monthly total)
- **CSV export** — Download all expenses by year for tax records or budgeting
- **Person filter** — Tap a person in the sidebar to filter the ledger to their expenses
- **Mobile-first** — Hamburger sidebar, floating + button, bottom nav bar
- **PWA** — Add to iPhone home screen; Settle up and Check for updates in the sidebar

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | HTML, CSS, Vanilla JS (no framework, no build step) |
| Backend | Supabase (PostgreSQL + Auth + Row Level Security) |
| Hosting | GitHub Pages (static files from `main` branch) |
| Font | Nunito via Google Fonts |

---

## Project Structure

```
BillSplit/
├── index.html   # Login page — Supabase email/password auth
├── app.html     # Full application — all views, CSS, and JS in one file
├── HANDOFF.md   # Developer notes, known issues, deployment guide
└── README.md    # This file
```

---

## Database Schema

All tables live in Supabase with Row Level Security enabled. Access is gated by an `in_household()` helper that checks `household_members`. No unauthenticated reads or writes are possible.

| Table | Key Columns |
|---|---|
| `households` | `id`, `name` |
| `household_members` | `household_id`, `user_id` |
| `people` | `id`, `household_id`, `user_id`, `name`, `note`, `is_you` |
| `bills` | `id`, `household_id`, `date`, `month` (YYYY-MM), `name`, `category`, `amount`, `payer_person_id`, `split_pct`, `recur_id` |
| `recurring_bills` | `id`, `household_id`, `name`, `category`, `amount`, `payer_person_id`, `split_pct`, `frequency`, `day_of_month` |
| `history` | `id`, `household_id`, `month_key`, `month_label`, `balance`, `total`, `paid_summary` (JSONB), `bills_snapshot` (JSONB), `settled_on` |

### Required Migration (split_pct column)

If setting up a fresh Supabase project or the `split_pct` column is missing, run:

```sql
ALTER TABLE bills
  ADD COLUMN split_pct NUMERIC(5,2) NOT NULL DEFAULT 50;

ALTER TABLE recurring_bills
  ADD COLUMN split_pct NUMERIC(5,2) NOT NULL DEFAULT 50;
```

`DEFAULT 50` preserves all existing bills as 50/50 splits.

---

## How to Deploy

1. Open `index.html` and `app.html` — Supabase credentials (URL, publishable key, household ID, person IDs) are hardcoded near the top of each file
2. Push to the `main` branch on GitHub
3. GitHub Pages auto-deploys in ~60 seconds — no build step, no npm, no CI/CD required

> **Tip:** If the app breaks with "Invalid supabaseUrl", the credentials were lost during an edit. Retrieve them from the Supabase dashboard → Project Settings → API.

---

## Development Notes

All application logic is in `app.html`. Search by function name to find any implementation.

**Key globals:**
```js
bills[]          // All unsettled bills (across months)
people[]         // Household members
recurs[]         // Recurring bill templates
history[]        // Archived settlement periods
myPersonId       // Current logged-in user's person ID
activeView       // Current view: 'ledger' | 'recurring' | 'history' | 'people' | 'export' | 'reports'
selSplitPct      // Selected split % in the add modal (50 = 50/50, 100 = Full, other = custom)
filterPersonId   // Active person filter in the ledger (null = show all)
```

**Key functions:**
```js
render()         // Master re-render — call after any data change
calcBal()        // Returns { balance, paid{personId: amount}, total }
                 // balance > 0 = others owe you; balance < 0 = you owe others
loadBills()      // Fetches all unsettled bills from Supabase (no month filter)
confirmSettle()  // Archives all current bills to history, resets balance
renderReports()  // Groups bills by month, calculates category % of monthly total
```

**Split logic:**
```js
// split_pct = what % of the bill the non-payer owes back to the payer
// 50  → 50/50 split
// 100 → Full — other person owes everything (e.g. mortgage)
// 30  → Custom — other person owes 30%
const owe = amount * (split_pct / 100);
```

See `HANDOFF.md` for in-progress work and known issues.

---

## Known Limitations

- **Recurring bills don't auto-add** — Templates exist but must be manually added each month via the modal; no automatic monthly insertion
- **Add Person is incomplete** — The UI allows adding a person record but doesn't create a Supabase Auth account, so they can't log in
- **Credentials are hardcoded** — If an HTML file is corrupted or overwritten, credentials must be manually restored from the Supabase dashboard
