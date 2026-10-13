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

## SaaS organization foundation (single-organization test bootstrap)

Terminology: an **Organization** (also called a tenant) subscribes to this
application; its **Customers** are the people/companies it serves. Keep
`dbo.Customers` for that business customer directory, not SaaS license buyers.

Apply [database/organizations-foundation-schema.sql](database/organizations-foundation-schema.sql)
after all existing business migrations. This bootstrap is restricted to
`centralHubTest`. It creates Contoso and the user record `dcrobb29@gmail.com`,
with an Owner membership and a test-only Trial subscription. No password,
verified identity, payment-provider subscription, purchased license, trial
expiry policy, or authentication session is fabricated.

Foundation tables:

- `Organizations`: subscribing companies.
- `Users`: global user records; `UserIdentities`: future verified issuer/subject
  links. Never grant access or auto-link identities merely because email matches.
- `OrganizationMemberships` and `MembershipAccessRoles`: roles belong to a
  membership, not globally to a user. `AccessRoles` is organization-owned:
  identical role names in two organizations can have entirely different grants.
  `Permissions` defines application capabilities; `AccessRolePermissions` stores
  explicit grants per organization role. Seed names are Owner, Admin,
  ProjectManager, Finance, Field, and Viewer. Only Contoso's initial Owner receives
  explicit bootstrap grants; other names confer no permissions on their own.
  Enforcement is not implemented yet. Existing `Roles` remains employee job
  titles, not access roles. A Vice President title never implies read/write.
- `SubscriptionPlans` and `OrganizationSubscriptions`: platform subscriptions,
  separate from invoices organizations issue to their customers. Seat limits
  and subscription status are metadata only until entitlement checks exist.
- `OrganizationEmployeeUsers`: optional same-organization employee/login links;
  employees do not automatically become application users.

All 31 existing business tables receive a required `OrganizationID`, assigned
to Contoso. Original values and relationships are preserved; row counts and
checksums are checked in the migration transaction. Ownership is immutable.
Organization-aware counterparts to existing foreign keys reject
cross-organization relationships. The migration is rerunnable and does not
overwrite existing membership/plan/status records.

**This is not a multi-tenant-ready or authenticated deployment.** Existing
queries still operate in the original single-company context. Explicitly named
`DF_*_BootstrapOrganization` defaults temporarily keep existing inserts assigned
to Contoso. Do not onboard a second organization or deploy this to public SaaS
until the following rollout is complete:

1. Choose/configure an identity provider and validate real sign-in sessions.
2. Resolve active membership on the server; never trust a browser organization
   ID alone. Enforce membership roles and subscription/seat policies.
3. Replace all bootstrap defaults with required organization context. Update
   every API, server-rendered read, mutation, export/PDF and background job.
4. Implement SQL row-level filter/block policies and safe per-request connection
   context handling for the shared `mssql` pool (no session-context leakage).
5. Scope business uniqueness rules (invoice numbers, catalogs, etc.) per
   organization where appropriate. Existing uniqueness rules remain unchanged.
6. Test read, write, export, concurrency and entitlement isolation using two
   organizations before enabling additional subscriptions.

Verification (Windows Authentication; no persistent fixture data):
`sqlcmd -S localhost -E -C -d centralHubTest -b -i database\organizations-foundation.verify.sql`.
It checks Contoso ownership, distinct membership roles, cross-organization
relationship rejection, and immutable ownership. These relationship checks
are not claims of row-level access isolation.

## Customer directory and invoice details

Apply [database/customers-schema.sql](database/customers-schema.sql) after the
project-finances and project-status schemas. It creates `dbo.Customers`, adds
nullable customer foreign keys to projects and invoices, and widens invoice
contact/address fields without changing existing invoice amounts or ownership.
The migration is transactional and rerunnable. Existing customer names are not
automatically merged into the directory or linked by name.

Use **Finance > Customers** to add/edit contacts, optional company names, email,
phone, billing addresses, and shipping addresses. The first/contact name is
required; a company is not. Search covers contact and address fields. Archiving
hides a customer from new assignments while retaining project/invoice links;
use **Show archived** to edit or restore archived customers.

Expanded project cards have a **Billing customer** selector. Completed projects
remain read-only and must be reopened before changing that association.
In Finance invoice create/edit forms, selecting a saved customer copies the
contact and address details into the invoice. These editable fields are a
historical snapshot: directory changes do not rewrite issued/imported invoices.
Selecting a project for a new invoice defaults to its active billing customer
when no customer has already been selected.
Opening an existing invoice does not reload current customer details; use
**Load current customer details** explicitly when needed. Unlinking retains the
invoice's copied details, and unlinked/manual invoices remain supported.
Generated project invoices copy the project's active billing customer's details.
Estimates retain their existing customer-name field for now.

Rollback: [database/customers-rollback.sql](database/customers-rollback.sql).
It refuses to remove a populated directory and retains widened invoice columns
to avoid truncating saved contact/address details.

Run `node --test app/lib/customer-fields.test.mjs`; database checks use
`RUN_DB_TESTS=1` with `node --test app/lib/customers.integration.test.mjs` and
roll back their fixtures.

## Project completion and billing

Apply [database/project-billing-schema.sql](database/project-billing-schema.sql)
after the customer, estimate, project-status, and recurring-planning schemas.
The migration adds project/occurrence scope snapshots, a billing-method lock,
issued-invoice metadata, and allocation records backed by the existing Finance
Invoices table. It is transactional and rerunnable, and does not guess
allocations for existing Finance invoices. Invoice amount storage is widened
without converting historical values. Rollback:
[database/project-billing-rollback.sql](database/project-billing-rollback.sql);
rollback refuses once completion/billing snapshots exist.

Each project header has an **Invoice** button. Expanded cards also have
**Track scope / occurrence completion & billing**. Both open the same modal
with Completion, Invoice, and Invoice history tabs.

- Scope status is Upcoming, In Progress, or Complete. One-time job In Progress
  corresponds to its existing Active status. Completing a one-time job
  completes its scopes. Completing a recurring occurrence completes only that
  occurrence's scopes; the agreement remains Active. Scope changes never
  automatically complete their parent. Corrections retain invoice history.
- Approved-estimate scopes are snapshotted when new estimates are won.
  Existing jobs are initialized on first use. Ungrouped lines get an
  **Ungrouped work** scope. Scope sell values include line freight/tax/markup;
  the accepted quote total is allocated proportionally, preserving every cent.
  Job-wide markup/rounding therefore appears in the scope shares. Snapshots
  are not rewritten if the estimate is later edited.
- Recurring quote totals are prices **per occurrence**, not series-wide caps.
  Opening billing for an Active recurring agreement creates missing planner
  occurrences throughout its bounded recurrence term using existing stable
  ServiceVisit IDs. Each occurrence gets fresh scope values and its own billed
  balance. Extra manual occurrences are supported. Moves retain balances;
  original invoiced occurrence dates are saved with allocations. Skipped visits
  cannot be billed; billed visits cannot be skipped or reassigned to another job.
  Completion tracking does not erase planner assignments/capacity.
- First invoice confirmation locks Dollar amount, Percentage, or Scopes for
  the whole job/series. Scopes supports parent job/occurrence or individual
  scopes, in full or by percentage, but never parent and children together.
  Percentages use the **original** value; Full uses the remaining balance.
  Parent charges are allocated proportionally across remaining scope balances,
  so previously billed scopes cannot be charged again.
- Completed, unbilled scopes are preselected. Fixed-dollar and contract-percent
  modes suggest the value of completed, unbilled scopes at parent level.
  Without an override, parent charges allocate only to completed scopes; entered
  amounts and original-contract percentages cannot exceed those eligible balances.
  Managers may deselect/adjust before issuance; confirmation is billing approval.
  Enter a unique external invoice number (up to 10 characters), an invoice date
  (defaults to today), and a due date. Choose an active Billing customer first.
- Older Finance invoices assigned to the job must be explicitly allocated
  before new invoices can be issued. Select the existing invoice in the modal
  and allocate exactly its recorded amount across the correct scopes/occurrences.
  No second Finance row is created. Invalid/negative historical invoice amounts
  require correction in Finance before allocation; no recurring visit is guessed.
- Enable **Include incomplete work** for manager-approved advance billing
  (for example, invoicing the entire month's services on the 15th). The toggle
  resets selections to completed work, then enables explicit selection of
  Upcoming/In Progress scopes or occurrences. It never changes actual completion,
  increases the contract limit, or allows rebilling when the work is completed.
  A reason in **Internal Notes** is required if any allocated work is incomplete.
  Issuance preserves that reason, the approval flag, and each allocation's
  completion status at issuance in immutable internal history. Old invoices and
  legacy reconciliations have unknown historical completion, not guessed values.
- Estimates, invoices, and project notes use shared plain-text notes fields,
  validation (4,000 characters per section), display styling, and customer-only
  PDF rendering. **Internal Notes** never appear on a customer PDF; **Customer
  Notes** appear even on total-only invoices. Both invoice note sections remain
  editable in Finance without rewriting an original advance-billing reason.
  This supports scheduling/completion and billing as separate stages of the
  eventual lead/estimate -> approval/job -> scheduling/completion -> billing ->
  punch list/documents -> recap -> archival lifecycle. Later stages and the
  field completion UI are not implemented by this change.
- Issuance creates the Finance invoice and allocations in one transaction.
  Project locks serialize issuance and idempotent request IDs make retries safe.
  Database constraints/triggers enforce remaining scope and job/occurrence balances. Issued amounts,
  ownership, numbers/dates, method, and allocations cannot be edited or deleted;
  contact/address snapshots and paid date remain editable in Finance, including
  for completed jobs. Legacy, unallocated completed-job invoices retain their
  previous read-only behavior.
- Show scope amounts or only the final total on the customer PDF. Open a PDF
  from Invoice history; internal allocation details remain available regardless
  of customer presentation. Export reads only saved invoice data and never
  generates recurring visits or initializes billing snapshots. Estimate cost
  line items are not exposed on invoices.
  Credit notes, cancellations, change orders, and the mobile field interface
  are not part of this initial implementation.

Focused tests:
`node --test app/lib/project-billing-pricing.test.mjs app/lib/project-invoice-pdf.test.mjs`.
Database integration tests use `RUN_DB_TESTS=1` with
`node --test app/lib/project-billing.integration.test.mjs`; fixtures are rolled back.
When combining database integration files, use `node --test --test-concurrency=1`
to avoid competing rollback-only fixtures locking each other's test data.

## Field operations planner

Apply [database/field-operations-planning-schema.sql](database/field-operations-planning-schema.sql)
after the project workflow, personnel, and equipment schemas. The planner uses
dated `ServiceVisits`, adds multiple task rows per visit, and stores employee or
equipment assignments on each task. Task and assignment removal is soft, so the
application only needs SELECT/INSERT/UPDATE permissions.

The weekly board lists only Active projects and recurring jobs, plus all org-chart
employees; overhead filtering is not applied. Upcoming jobs remain in Project
Management for preparation, and Complete jobs are not assignable.
The Jobs panel defaults to draggable job cards. Its upper-right toggle switches
to job/date dropdowns and a Schedule button, hiding the draggable pool; switching
back hides the selectors. Selection values are retained while toggling, and the
mode stays selected when navigating weeks (a page reload defaults to drag/drop).
Scheduled visits and resource assignments can still be dragged in either mode.
The seven-day board remains the primary scheduling view. A single show/hide
**Weekly availability** panel (shown on initial load, visibility retained while
navigating weeks) switches between Employees and Equipment.

### Task assignment modal

Apply [database/field-operations-assignment-hours.sql](database/field-operations-assignment-hours.sql)
after the planning schema (rollback:
[database/field-operations-assignment-hours-rollback.sql](database/field-operations-assignment-hours-rollback.sql)).
It adds `HoursMode`/`CustomHours` to task assignments and `EstimateLineItemID`
to tasks. Existing assignments keep their task's planned hours (shown as Custom).

Visit cards list each task with its hours left. The **Assign crew & equipment**
button opens a modal where employees or equipment are dragged (or selected and
added) into task zones, moved between tasks, or removed. Changes save immediately.
Each assignment has an hours mode:

- **Full Day** 8h, **Half Day** 4h, **Custom** an entered value (0-24h).
- **Split Evenly** (default for new drops) shares the task's remaining hours
  among its flexible assignees and recalculates as people are added or removed.
- **Full Job** takes the remaining hours; it is disabled when more than 8h remain.
  Full Job and Split assignees in the same task share the remainder evenly.

Fixed modes are subtracted first. Over-allocation is allowed and flagged in red.
Resources with 10h or more booked on the visit's date are grayed out in the modal.
Equipment hours are tracked separately and never reduce labor remaining.

Each approved-estimate `Labor` line measured in `HR` becomes a task on Scheduled
visits of Active jobs (estimated hours = quantity). For non-recurring jobs the
remaining hours count down across all of the job's visits; recurring jobs track
each visit separately. Estimate tasks cannot be edited or deleted in the planner.
Jobs without HR labor lines use an editable General work task, and extra manual
tasks can be added in the modal. An untouched 0h General work placeholder is
retired once estimate tasks exist.

Capacity uses 8h per weekday and 40h per Monday-Sunday week. Weekend assignments
reduce the weekly balance but are shown as weekend work rather than extra normal
capacity. All saved employee task assignments on visible Active-job visits count
using their resolved hours; equipment capacity is shown separately.
Daily and weekly overages remain explicit and do not block scheduling. The bars
show assigned / 8h, not exact times or actual hours worked. Failed schedule loads
or refreshes display availability as unavailable rather than suggesting free time.
Run calculations with `node --test app/lib/field-capacity.test.mjs`.

Recurring estimates require a valid start date, end date, and frequency. Acceptance
creates an Upcoming job without planner visits. Once set to Active, opening a
planner week creates dated visits and a General work task for occurrences in that
week, bounded by the job's start and end dates. Weekly and biweekly intervals
stay anchored to the start date. Monthly, quarterly, semiannual, and annual visits
use calendar months, clamping to the last day of shorter months without shifting
later occurrences. Estimate labor is
the sum of approved estimate line quantities whose type is `Labor` and unit is
`HR` (case-insensitive). Assigned hours do not change the approved estimate
total. Reassigning a resource between tasks moves that assignment. The same employee or equipment may be assigned to multiple tasks
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

### Project and estimate list controls

Status toggles sit beside the Projects / Recurring tabs. Projects support All,
Upcoming, Active, and Completed; estimates support All, Not approved, and
Approved. Approved means Won; Not approved includes Draft and Lost estimates.
Counts reflect the selected engagement type before search/column filters.
Filters & sort opens a shared modal for status and quoted-total/name ordering;
changes apply immediately. Estimate modal sorting and table-header sorting use
the same state. Reset clears the selected list's filters and sorting, including
estimate search/column filters. Status selection carries across engagement tabs;
estimate search and sorting remain independent per tab. Missing project totals
sort last in either direction. Amount-range controls can extend the modal without
adding another toolbar or table header.

Cost lines use a compact spreadsheet-style layout within each expandable scope,
with one shared header for estimated/remaining quantities and estimated/actual/
remaining costs. The header stays visible while scrolling long scopes; narrow
screens scroll horizontally to preserve column alignment. Items with no actual
costs have a circled plus on the left that opens the cost-entry form directly.
Items with costs keep their expandable chevron (focus the row and press
Enter/Space for keyboard access) to view, edit, or remove allocations. A circled
plus below the last actual-cost row adds another cost; unexpected costs use the
same bottom add control. Add controls are disabled for completed jobs. Long descriptions
wrap rather than being truncated, and quantity-unit warnings remain visible.

### Split vendor bills (exception)

The actual-cost form uses **Find supplier bill**, a searchable modal with 20
results per page rather than a long dropdown. Search bill number, ID, vendor,
date, or assigned job. It includes fully/partially unallocated bills even when
attached to another job, explaining why those are not selectable and allowing
explicit split mode (unless completion locks the bill). Search/paging never
reattaches a bill. Fully allocated bills are excluded except the bill on the cost
row being edited, whose original allocation is added back to its available balance.
Escape closes the bill picker without closing the underlying cost form.

Single-job billing is the default. For a monthly rental or combined vendor bill,
enable **Split across jobs** in the Bills table or the selected supplier bill in
the actual-cost form. This is an immediate bill-level setting, independent of
saving/cancelling the cost form. Enabling it clears the bill's single project
assignment but preserves existing cost rows. The bill becomes selectable in other
jobs. Enter each job's actual quantity, price, freight, and tax manually; equipment
days do not automatically determine a proration.

In split mode each project's costs, paid/unpaid costs, profit, and remaining budget
include **only its active allocations**, not the whole bill. Line/scope actuals
still use their allocated rows. The combined allocations cannot exceed the bill
total. Unallocated split balances remain visible in Finances and are not charged
to any job. Removing a split allocation removes that amount from its job's actuals.
Single-job bills retain the existing full-bill accounting.

Disable split mode only when allocations belong to at most one job. That job
becomes the sole bill owner and receives the full bill cost again; a bill with no
allocations becomes unassigned. Bills with allocations in completed jobs cannot
change mode, amount, payment date, or other bill fields without reopening those
jobs. Other non-completed jobs may still allocate the unused split balance.
Base-job and pending change-order costs within one job can use existing estimate
lines and Unexpected / Out-of-scope rows without enabling cross-job splitting;
formal change-order tracking is not implemented yet.

For an existing database, apply these scripts **in this order, in one transaction**
with `SET XACT_ABORT ON` using an admin connection:
1. [database/split-bills-schema.sql](database/split-bills-schema.sql)
2. [database/project-bill-costs-schema.sql](database/project-bill-costs-schema.sql)
3. [database/project-status-schema.sql](database/project-status-schema.sql)

For a fresh database apply the original finance/workflow/cost schemas first, then
the three scripts above. Reapply this split migration after rerunning the original
project-finances schema, which contains the pre-split version of the summary view.
Existing bills default to single-job mode; none are automatically split.

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

Import vendor bills in **Finances > Bills**, then add actual costs in **Projects & Jobs**.
Select an unassigned bill or one already attached to the job. Saving an allocation
attaches an unassigned bill to the job in the same transaction; cancelling or a
failed save does not attach it. Bills attached to another job cannot be selected
or reassigned by this workflow unless explicitly changed to split mode. The same bill remains selectable for multiple
cost lines within its job, subject to its remaining balance. Removing an allocation,
or editing it to use a different bill, automatically clears the old single-job
bill's project assignment when no active allocations remain anywhere on that bill.
This happens in the same transaction and removes the full bill total from the old
job's financials; the bill becomes **Unassigned** and can attach to another job
without split mode. Bills with remaining allocations stay attached. Split bills
keep their split setting and count only their remaining allocations. Completed
jobs must be reopened before removing or moving their allocations.
Existing zero-allocation assignments are not bulk-cleared: bills may have been
assigned directly in Finances without any allocation rows. For those bills, edit
the bill in **Finances > Bills** and set **Project** to **Unassigned** before
selecting it in another job. Manual project assignment remains available.
Add actual-cost rows beneath accepted
estimate lines or under **Unexpected / Out-of-scope costs**. Each row requires a
bill, description, cost date, quantity, unit, actual unit cost, freight amount, and
manually entered tax amount. Scopes and estimate lines are collapsed by default.
**Unexpected / Out-of-scope costs** is also a collapsed accordion on every job,
even before any unexpected costs are recorded. Its parent shows the actual-cost
total and row count; expand it to see billed rows and **Add an unexpected cost**.
This is an actual-cost container, not an added estimate scope: it has no assigned
revenue or estimated cost and does not change the accepted estimate or customer
price. Unexpected costs still count toward job actuals and can be reallocated later.
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

For single-job bills, project actual cost is the **full total of project-assigned bills**, paid or unpaid,
not that total plus its allocations. Unallocated bill balances therefore affect
the project budget immediately but do not affect individual line/scope actuals.
Split bills instead contribute only the job's allocations. Unexpected costs have no estimated budget and may be edited/reallocated later.
Outgoing customer invoices remain separate project-level billed/paid/unpaid
revenue. No invoice parsing, automatic cost allocation, or change-order approval
workflow is included.

Bill totals, allocated totals, and unallocated balances are visible in both
Projects & Jobs and Finances. Partial allocation is allowed; allocations exceeding
the bill total are rejected transactionally. Only bills assigned to the same
project (or unassigned bills attached on Save) and lines from its accepted revision can be selected. Editing/reallocating
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
