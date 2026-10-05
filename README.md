This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

npm run dev

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Unit presets

Apply [database/units-of-measurement-schema.sql](database/units-of-measurement-schema.sql)
to the database configured by `DB_NAME` (for example, `centralHubTest`). Like the
other scripts in `database`, this migration is run manually in SQL Server. It is
safe to rerun: it preserves an existing `dbo.UnitsOfMeasurement` table and all
its rows, and grants `applicationLogin` read-only access when that principal exists.
It does not seed, change, or delete presets.

Maintain presets in SQL Server using `[Unit Name]` (`nchar(20)`) and
`[Unit Abbreviation]` (`nchar(10)`). Include an `EA` abbreviation for the default
Each unit. Estimate line dropdowns display abbreviations only; names are option
descriptions. Fixed-width padding is trimmed, and saving uses the preset's exact
casing, including for matching units from existing estimates, materials, and
scope templates. Every saved line must have a preset unit. An unmatched imported
unit stays visible until the estimator chooses a preset; historical data is not
bulk-updated. Blank presets or conflicting abbreviation casing cause an explicit
configuration error rather than selecting an arbitrary spelling.

Refresh the Sales page after changing presets. If `EA` is absent, new lines
require a manual selection. If the table is empty, saving is disabled with a
message explaining how to configure it. Customer preset management is not exposed.

Run focused preset tests with `node --test app/lib/unit-presets.test.mjs`
(Node.js 22.18+).

## Internal and customer estimate/project notes

Apply [database/estimate-notes-schema.sql](database/estimate-notes-schema.sql)
to the configured SQL Server database before deploying the notes feature.
The rerunnable migration adds nullable `InternalNotes` and `CustomerNotes`
(`nvarchar(4000)`) columns to `dbo.Estimates` and `dbo.Projects`. Existing
legacy `Notes` columns are renamed to `InternalNotes`, preserving their text
without exposing it to customers. Customer notes start empty.

Both notes fields are optional plain text, up to 4,000 characters each, and can be
edited with the estimate. Blank notes are stored as `NULL`. When an estimate
is marked won, its current notes are copied to the new project in the same
transaction. Both sections are visible in the internal estimate scope and
expanded project card. Only customer notes appear on the customer PDF, including
when line items or totals are hidden. Internal notes never appear on the PDF.
Existing projects retain their own notes; no estimate-to-project backfill is run.

Run notes and PDF visibility tests with
`node --test app/lib/estimate-notes.test.mjs app/lib/estimate-pdf.test.mjs`
(Node.js 22.18+).

## Field operations planner

Apply [database/field-operations-planning-schema.sql](database/field-operations-planning-schema.sql)
after the project workflow, personnel, and equipment schemas. The planner uses
dated `ServiceVisits`, adds multiple task rows per visit, and stores employee or
equipment assignments on each task. Task and assignment removal is soft, so the
application only needs SELECT/INSERT/UPDATE permissions.

The weekly board lists only Active projects and recurring jobs, plus all org-chart
employees; overhead filtering is not applied. Upcoming jobs remain in Project
Management for preparation, and Complete jobs are not assignable.
Recurring estimates require a valid start date, end date, and frequency. Acceptance
creates an Upcoming job without planner visits. Once set to Active, opening a
planner week creates dated visits and a General work task for occurrences in that
week, bounded by the job's start and end dates. Weekly and biweekly intervals
stay anchored to the start date. Monthly, quarterly, semiannual, and annual visits
use calendar months, clamping to the last day of shorter months without shifting
later occurrences. Estimate labor is
the sum of approved estimate line quantities whose type is `Labor` and unit is
`HR` (case-insensitive). Planned hours are entered per task and do not change
the approved estimate total. Reassigning a resource between tasks moves that
assignment. The same employee or equipment may be assigned to multiple tasks
on a date; conflicts are not blocked. Removing a visit marks it Skipped and
deactivates its tasks and assignments. Equipment is loaded from `dbo.Equipment`.

Apply [database/recurring-field-planning-schema.sql](database/recurring-field-planning-schema.sql)
after the engagement and field-planning schemas before deploying recurring
scheduling. It gives existing recurring estimates and jobs without end dates an
end date three calendar months after their start. Legacy records without a start
date must be corrected before acceptance; they are not automatically scheduled.
Opening a planner week fills missing occurrences only for Active approved jobs.
Previously manual visits on default dates are reused, including skipped/completed
visits. Original occurrence dates are unique and retained when visits move or are
removed, so refreshes never recreate them. Drag a scheduled title or use its date
selector to move just that visit within the same Monday-Sunday week, retaining
tasks, hours, and assignments. Extra manual visits remain supported. Editing an
approved job's recurrence or extending its end date is a future feature.

To run the migration in SQL Server Management Studio, connect using a
schema-owner/admin account (Windows Authentication works in the local setup),
select the application database in the database dropdown, open the SQL file with
**File > Open > File**, then click **Execute** (F5). Verify the Messages tab shows
no errors. The script can be rerun safely; already populated end dates are not
changed. The application login deliberately does not have schema-alter permissions.

Run planner date and labor calculations with
`node --test app/lib/field-operations-dates.test.mjs app/lib/recurring-dates.test.mjs`.
Run database integration tests after applying the migration with
`$env:RUN_DB_TESTS='1'; node --test app/lib/recurring-schedule.integration.test.mjs`
in PowerShell (Node.js 22.18+). These exercise actual approval, duplicate prevention,
move/skip persistence, task/resource retention, legacy visit adoption, and unchanged
one-time approval. All fixture data is rolled back at the end.

## Bill-backed project actuals

### Job status and completion

Apply [database/project-status-schema.sql](database/project-status-schema.sql)
after the other project, estimate, finance, and planner schemas, using an admin
connection. Run it in a transaction with `SET XACT_ABORT ON`; unknown legacy
statuses stop the migration for review. It reuses `Projects.ProjectStatus` rather
than creating a second status column, maps Planning to Upcoming and Completed to
Complete, changes the default to Upcoming, and allows Upcoming/Active/Complete.
Rerun this migration after adding any of its optional job-data tables to install
their completion guards.

The Project Management status selector works for both one-time and recurring
jobs. Complete freezes job data while leaving it readable: no new, edited,
removed, or reassigned bill/invoice/cost rows, payment-date changes, planner visits,
tasks, resource assignments, or edits to the accepted estimate baseline.
Database triggers enforce the lock even for direct API/import writes and check
both the original and new project ownership. The selector can explicitly reopen a
Complete job to Active; it cannot move directly from Complete to Upcoming.
Reopening changes only status, not historical data. Correct unpaid bills/invoices
before completion or reopen to record later payments.

Only Active jobs appear in the weekly planner's job pool, selection dropdown,
and scheduled board. Upcoming and Complete jobs do not generate default visits.
Existing visits and assignments are preserved but hidden from the weekly planner
while the job is not Active; returning to Active restores them without duplicating
or resetting moved/skipped occurrences. Completing a job does not erase its schedule
or financial history. Cost and finance controls are disabled for Complete jobs.
Rerun the status migration to install Active-only guards on visits, tasks, and
resource assignments. These reject stale planner writes for non-Active jobs,
including moving assignments out of an Upcoming job.
Project budgets still use the accepted estimate, and the lock does not change
financial totals.

Run the transactional status integration tests with
`$env:RUN_DB_TESTS='1'; node --test app\lib\project-status.integration.test.mjs`.

Apply [database/project-bill-costs-schema.sql](database/project-bill-costs-schema.sql)
after the project-finances, project-workflow, estimate-scopes, and estimate-pricing
schemas using a schema-owner/admin connection. The app login receives only
SELECT/INSERT/UPDATE on `ProjectBillCosts`. The script is rerunnable and leaves
existing estimates, bills, and the older unlinked `ProjectActualCosts` table
untouched. The older table is not included in this new bill-backed workflow.

In **Finances > Bills**, assign a bill to its project, then select **Allocate costs**
to open that project in **Projects & Jobs**. Add actual-cost rows beneath accepted
estimate lines or under **Unexpected / Out-of-scope costs**. Each row requires a
bill, description, cost date, quantity, unit, actual unit cost, freight amount, and
manually entered tax amount. Scopes and estimate lines are collapsed by default.
Expand a project, then a scope (such as 2" Waterline), then a work item to reach
its actual costs. Scope parents show actual cost and remaining budget; nested
accordions expand independently without toggling their ancestors. Click the line
parent row (or focus it and press Enter/Space) to reveal only its actual-cost rows
and **Add actual cost** button. Each line expands independently without toggling
the enclosing project. The parent shows actual cost, remaining cost budget, and
remaining matching-unit quantity. **Estimate reference** opens the original
baseline in a modal without expanding the line. **Show financial details** toggles
estimated project/scope totals and revenue inline; these are hidden by default.
This view is for supplier-billed materials, subcontracts, and rentals, not in-house
labor/equipment. Labor/equipment estimate lines remain available until a sourcing
classification distinguishes subcontract/rental work from in-house resources.
Quantity and unit cost support four decimal places;
freight and tax support two. The total is rounded quantity × unit cost, plus freight
and tax. Actual prices are never copied from the estimate. Users must apportion
bill-level freight/tax across partial rows rather than repeat them on each row.
The job's tax percentage is shown only as a reference for actuals.

Baseline cost uses the accepted estimate's existing pricing rules: base cost plus
freight, then estimated tax on that subtotal, excluding customer markup. The
accepted estimate is never changed. Line/scope actuals sum allocations; negative
remaining budgets indicate overruns. Quantity comparison includes only matching
units, case-insensitively, and warns about other units without excluding their
costs. Recurring budgets are shown as quoted, not multiplied by occurrences.

Project actual cost is the **full total of project-assigned bills**, paid or unpaid,
not that total plus its allocations. Unallocated bill balances therefore affect
the project budget immediately but do not affect individual line/scope actuals.
Unexpected costs have no estimated budget and may be edited/reallocated later.
Outgoing customer invoices remain separate project-level billed/paid/unpaid
revenue. No invoice parsing, automatic cost allocation, or change-order approval
workflow is included.

Bill totals, allocated totals, and unallocated balances are visible in both
Projects & Jobs and Finances. Partial allocation is allowed; allocations exceeding
the bill total are rejected transactionally. Only bills assigned to the same
project and lines from its accepted revision can be selected. Editing/reallocating
a row preserves its identity; removing an allocation is soft removal and restores
bill allocation capacity, but does not delete or reduce the source bill cost.
Bills with allocation history cannot be deleted. Database protection prevents
changing a bill's project while allocations are active or reducing its total below
active allocations, including changes through import/finance workflows.

Run targeted calculation and database tests in PowerShell:

```powershell
$env:RUN_DB_TESTS = '1'
node --test app\lib\project-cost-pricing.test.mjs app\lib\project-costs.integration.test.mjs
```

Integration fixtures use a transaction and are rolled back after every test.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
