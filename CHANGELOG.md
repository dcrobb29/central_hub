# Version notes

## Versioning policy

- Current application version: **0.2.0** (pre-MVP; approved for deployment with
  verification follow-up). Formal tracking adopted on 2026-10-24 with the historical
  `0.1.0` baseline. This is not a claim of MVP readiness or deployment.
- Use `MAJOR.MINOR.PATCH`. While pre-MVP, use `0.X.Y`: increment the minor
  number for a substantial feature milestone or incompatible workflow/schema
  change, and the patch number for compatible fixes and small improvements.
  For example, the next fix release could be `0.1.1`, and a substantial feature
  milestone could be `0.2.0`. Commit count does not determine version numbers.
- Reserve `1.0.0` for an explicitly approved MVP release. Version numbers do
  not certify security or completeness.
- Record changes under **Unreleased** while implementation or verification is
  pending. At release preparation, assign the version and date, summarize the
  changes, list required database migrations and verification status, and update
  `package.json` and both root version entries in `package-lock.json` together.
- After approval and verification, a matching Git tag such as `v0.1.1` can
  identify the exact release commit. Tags and deployments require explicit
  direction; none were created as part of establishing these notes.
- Code deployment does not apply SQL migrations. Record local and Azure
  migration results separately; do not treat automated tests as live deployment
  verification.

## 0.2.0 - Prepared 2026-10-24

**Release prepared:** 2026-11-03.
**Status:** implementation, automated checks, and both database migrations complete.
On 2026-11-03, the user approved proceeding with their commit/push and deferring
the two-organization sample-data check to Azure after deployment because only one
local test user is available. Live SQL concurrency and that cross-organization
check are not yet verified. Other manual checks without explicit results remain
unconfirmed. Commit/push/deployment completion is not asserted by these notes.

### Financial precision and safe storage

- Restrict manually entered currency amounts and unit costs to two decimal
  places without silently rounding invalid entries.
- Allow tax percentages from 0 through 100 inclusive with up to four decimal
  places. Normalize leading financial zeros on blur and block scientific
  notation in financial controls.
- Keep quantity precision separate from currency precision and preserve
  intermediate calculations and server-resolved contract deduction prices.
- Accept correctly grouped US currency pastes such as `$1,234.56`, normalizing
  them to `1234.56`; reject malformed grouping and excess precision.
- Enforce safe numeric/storage limits before writes, including calculated line
  and document totals. Actual-cost allocations must fit the existing
  ten-character bill amount column.
- Distinguish required blank inputs from explicit zero. Preserve zero unit
  prices, signed bill/invoice credits, positive quantities and actual-cost
  totals, and existing markup limits; do not impose a new blanket markup cap.
- Validate six-decimal template factors before insertion. Block an application
  whose generated component quantity cannot fit four decimal places, identify
  the component, and avoid partial insertion or silent rounding.

### Consistent contact, date, and API validation

- Format and validate US phone numbers and five-digit/ZIP+4 postal codes across
  applicable customer, finance, profile, and settings forms.
- Automatically remove the ZIP separator at five or fewer digits and restore
  it when a sixth digit is entered.
- Expand bill company names from 10 to 150 characters. Existing customer name
  limits remain 100 per first/last name and 150 per company. Expand estimate
  customer-name snapshots to 201 characters so a valid full individual name
  also fits estimates and change documents.
- Reject invalid calendar dates and due dates before bill/invoice issue dates
  on both create and edit. Backdated issue dates and paid dates before issue
  dates remain allowed.
- Reject invalid request types, non-integer/overflowing IDs, invalid emails,
  and out-of-range hours/sequences rather than coercing or truncating them.
  Shared settings validation also covers unsaved invoice PDF previews.
- Preserve existing optional invoice template defaults when fields are blank;
  optional letterhead fields can still be cleared.
- Cover create/edit and existing single-row import-form paths with shared
  parsers. No active bulk CSV/XLSX record-import endpoint was found in this pass;
  this does not certify future import paths.

### Entry feedback and duplicate awareness

- Show inline precision/contact errors and notes character counters. Keep
  decimal errors within their input's grid cell, including narrow layouts.
- Top-align estimate line controls so an inline error grows below its input
  without vertically shifting neighboring fields.
- Decimal entry controls use text inputs with decimal keyboard hints rather
  than native number spinners. On 2026-11-03, the user approved leaving increment
  arrows out pending tester feedback.
- Offer US state/DC/territory/military options, preserving an existing legacy
  state value visibly until the user changes it.
- Warn, without blocking, about likely duplicate customers, material names,
  and company-plus-bill-number combinations in the current organization.
  Existing database uniqueness rules remain in force.
- Align personnel/member/settings field limits and validate custom hour drafts
  without silently resetting invalid entries.

### Sample-data bill collisions (added 2026-11-03)

- Replace fixed `SMP-B01`/`SMP-B02` internal bill IDs with random ten-character
  IDs checked against all bills under transaction-held update/range locks.
  Retry candidate collisions rather than overwriting existing bills.
- Serialize sample inclusion/removal using a transaction-owned SQL application
  lock shared across organizations and app instances. Recheck tracking after
  acquiring the lock so repeated/concurrent inclusion creates only one set.
  A lock timeout returns an explicit retry error.
- Preserve generated bill IDs in cost allocations and cleanup tracking.
  Existing tracked sample bills, including legacy IDs, remain removable.
- No additional migration or production data cleanup is required. Existing
  records are not renamed or deleted by this fix.
- Mocked non-database tests cover multiple organizations, existing/colliding IDs,
  concurrent/repeated requests, cost links, cleanup, and failure rollback.
  Live SQL lock behavior and browser lifecycle checks remain pending.

### Migrations and release verification

- [bill-company-name-length.sql](database/bill-company-name-length.sql):
  **user-confirmed complete locally and in Azure**, each reporting
  `COL_LENGTH(N'dbo.Bills', N'Company Name') = 300` and `@@TRANCOUNT = 0`.
- [estimate-customer-name-length.sql](database/estimate-customer-name-length.sql):
  **user-confirmed complete locally and in Azure on 2026-10-26**; both returned
  `CustomerNameBytes = 402`, `OpenTransactions = 0`.
  Both scripts widen columns without rewriting stored names.
- Automated non-database coverage: **223 passed, one existing skip, no failures
  (224 total)**. Type-check and production build passed. Targeted lint has no
  errors and three existing warnings (profile image, project-cost memo
  dependency, unused estimate icon). Database integration/sample-data tests
  were not run by the assistant.
- User already confirmed leading-zero normalization, three-decimal quantities,
  four-decimal tax, rejection above 100, phone/ZIP digit counts, and the
  ZIP-separator deletion/reinsertion correction.
- Remaining authenticated checks are listed in
  [README.md](README.md#release-020-manual-acceptance). The two-organization
  sample-data check is explicitly deferred to Azure after deployment; other
  checks without reported results remain unconfirmed.
  unauthenticated browser access is not a substitute for save/reopen/PDF tests.

### Documentation

- Establish formal `0.1.0` baseline tracking, this changelog, and the release
  numbering policy; prepare `0.2.0` metadata and combined validation release notes.

## 0.1.0 - Historical development baseline

**Tracking adopted:** 2026-10-24.
**Committed baseline:** `24de699` (2026-10-22).

The following is a retrospective summary of commit messages, not a list of
previously numbered releases, a code audit, or confirmation that every feature
is complete/deployed. The package already declared `0.1.0`; older commits were
not assigned invented version numbers.

### 2026-10-20 through 2026-10-22: preferences and hardening

- Added Light/Dark and custom appearance work, followed by signed-out appearance
  isolation (`9555045`, `24de699`).
- Added registration allowlisting (`25a989b`) and SQL health checks (`53c26d3`).
- Applied security-review fixes and tracked follow-up work (`71284f7`,
  `ba85b96`, `7bfcc15`). This does not mean all security concerns are resolved;
  see [SECURITY-FOLLOW-UP.md](SECURITY-FOLLOW-UP.md).
- Added customer search/create selection for estimates (`5e7f974`).
- Separated material/scope libraries by organization and made personnel titles
  organization-specific (`e33ca6a`, `b3cb47a`), with migration follow-up
  (`f55e264`).

### 2026-10-16 through 2026-10-19: hosting, identity, and storage

- Added Azure deployment workflow/configuration and deployment fixes
  (`97f84de`, `8812c6b`, `85e77c3`).
- Worked on reducing attack surfaces, removing hardcoded test credentials, and
  cross-organization isolation (`b619892`, `82656e9`, `bfe00f8`).
- Added Azure Blob Storage integration and read-only deployment image-cache
  fixes (`0abc104`, `b3e1739`).
- Worked on signup email confirmation, password verification, abuse protection,
  and CAPTCHA (`13e2565`, `9f3c911`, `363a1ca`).

### 2026-10-12 through 2026-10-15: project and billing workflows

- Added customer invoice emailing and organization profiles (`1ab9db2`).
- Worked on percentage/scope billing, weekly field planning, profiles, and
  subscription statuses (`98e80f5`).
- Added a project portal and initialized change orders/alternates (`3f57183`,
  `8098961`).
- Consolidated layout and styling across application areas (`7b30532`,
  `673f38e`, `00b925c`).

### 2026-10-01 through 2026-10-08: estimating and operations foundations

- Developed estimates, material catalog, scope templates, project/recurring
  distinctions, PDF output, and estimate-to-project handoff (`c248ea7`,
  `d20e37b`, `6748c1c`, `aff1cb5`).
- Added field-operations scaffolding, actual-versus-estimated costs, and project
  statuses (`d8f70c7`, `7dc229f`, `9756ebe`).
- Refined filtering, sorting, and layout consistency (`ba9d1a7`, `a300637`).

### 2026-09-25 through 2026-09-30: initial foundations

- Created the Next.js application (`2d1a521`).
- Began finance and file-management features, document viewers, folder
  structure, and application scaffolding (`f87ad59`, `7428b34`, `1c68838`).
