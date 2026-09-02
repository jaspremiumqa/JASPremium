# Finance: Accountant Exports + Audit Trail

## Supabase migration

Run:

`supabase/sql/FINANCE-AUDIT-TRAIL.sql`

after the finance setup/mapping migrations.

## Exports

Financial Statements, Journal Entries, General Ledger and Trial Balance now have:

- **Export CSV** — exports the currently displayed/filtered table.
- **Print / Save PDF** — opens a clean print view. Choose **Save as PDF** in the browser print dialog.

Exports are recorded in the Finance Audit Trail as `EXPORT_CSV` or `PRINT_PDF`.

## Audit Trail

The Audit Trail records database changes for:

- Journal entries
- Journal entry lines
- Statement mappings
- Accounting periods
- Chart of Accounts
- Accountant CSV/PDF report exports

Each event includes timestamp, authenticated user/email when available, action, table, record ID and old/new values (where applicable).

Audit rows are database-generated and the client has no insert/update/delete permission on the audit table.

The CRM role editor exposes `Audit Trail → Read` so access can be granted to accountant roles as needed.
