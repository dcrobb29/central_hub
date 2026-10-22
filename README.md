This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

npm run dev

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Azure App Service deployment

### Organization-specific personnel roles

Apply [organization-role-uniqueness.sql](database/organization-role-uniqueness.sql)
separately to local and Azure databases after `dbo.Roles.OrganizationID` exists.
It replaces the global role-name uniqueness index with uniqueness on
`(OrganizationID, RoleName)`, preserving role IDs and employee assignments.
Companies may use identical role names without sharing roles; duplicates inside
one organization remain rejected under the database's existing collation.
The personnel API already scopes role lists, creation, and employee role selection
to the authenticated organization. These are personnel job titles, not access-control roles.

On a test database with two existing organizations, run
[organization-role-uniqueness.verify.sql](database/organization-role-uniqueness.verify.sql).
It verifies both uniqueness cases using temporary test roles and rolls back all
inserts. Then verify each organization's Personnel list and sample-data insertion
in the browser. SQL migrations are not run automatically by code deployment.

### User appearance preferences

Appearance changes are local until deployed. Apply
`database/user-appearance-preferences.sql` to the intended local database before
testing, and separately to Azure only when releasing. The migration creates a
user-keyed JSON preference table and grants the existing `overhead_app` principal
read/insert/update access; review that grant if your local principal differs.
No organization settings, existing users, or signup configuration are changed.

Open the profile menu → **Profile → Visualizations** to choose slots A/B from Light, Dark,
Custom, High-contrast Light/Dark, or Color-vision-friendly. The header toggle
switches between those slots and persists the active slot. Initially the OS
chooses Light/Dark; the Follow system checkbox opts back into that behavior.
One custom palette has four validated hexadecimal inputs (page, panel, accent,
text); shared CSS tokens derive borders, muted text, selected and hover states.
Save persists to the authenticated user's ID; Cancel restores the saved theme.
Reset previews defaults until Save. Existing users without a preference row
receive defaults; database errors are visible, not silently saved locally.

Signed-out pages use the last browser-cached appearance or the OS default.
Only appearance values are cached; no identity or credentials are included.
Signing into a different account loads that account's own preferences rather
than adopting the previous account's cache. A pre-hydration script applies the
cache before first paint. This is an inline script; a future strict CSP must
authorize it with a nonce/hash rather than enabling arbitrary inline scripts.

Low contrast is warned about, not blocked. Reset/Cancel remain readable even
with an unusable palette. Accessibility presets are starting points, not a
claim of universal accessibility; status labels and chart relationships remain
non-color cues. Semantic danger/warning/success colors remain independent.
PDFs, invoice email templates, invoice accent settings, logos, and uploaded
images retain their own colors. Preferences load across devices on sign-in or
page reload; simultaneous edits use last successful save, not live syncing.

Validation:
`node --experimental-strip-types --test app\lib\appearance.test.mjs app\lib\appearance-route.test.mjs`.
Use two accounts to verify independent saves and reloads. Also check OS changes,
both slots, Custom preview/Cancel/Save/Reset, signed-out reload, low-contrast
warnings, chart controls, and narrow screens.

[The Overhead workflow](.github/workflows/master_overhead.yml) builds on Ubuntu
with Node 24 using `npm ci` and `npm run build`. It packages the production
`.next` directory, dependencies (including the Next.js executable), public
assets, package manifests, and Next configuration into `deployment.zip`.
Passing one ZIP between jobs preserves hidden build files and executable
entries that loose-file artifact uploads can omit. Build cache, local
environment files, and uploaded business files are not packaged.

Deployment uses the existing Azure OIDC identity and starts Next.js with
`node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port $PORT`.
Invoking the real CLI avoids `.bin/next` links being dereferenced into copied
files during packaging, which breaks the CLI's relative imports (for example,
`../server/require-hook`). The runtime must not rebuild
this prebuilt artifact: keep App Service `SCM_DO_BUILD_DURING_DEPLOYMENT`
disabled/unset. Runtime secrets belong in App Service environment variables,
not the ZIP. Configure durable uploaded-file storage as described below.

A successful workflow is not a runtime health check. Confirm Next.js reports
ready in App Service Log stream and test the default hostname after deployment.
`next: not found` indicates missing runtime dependencies/executable resolution;
a missing production build indicates missing `.next` output.

### SQL connection reliability

`app/lib/db.ts` shares one SQL connection pool per module instance. Concurrent
initialization/recovery requests share one connection attempt. Failed initial
connections are not cached; a disconnected or unhealthy cached pool is closed
and replaced on the next `getPool()` call. The driver retains its default
connection validation and replacement of broken individual connections.
Connection, pool acquisition, and query waits each have a 15-second timeout
(not a single end-to-end request deadline). The pool allows up to 10
connections and retires idle connections after 30 seconds.

Recovery never replays a business query or transaction: an interrupted write
may have committed, so automatic replay could duplicate changes. A failing
request can still return an error; later requests can reconnect without an app
restart. Pool error listeners record only error name, code, and numeric error
number, never error messages, connection strings, SQL text, or credentials.
Connection success logs include duration and whether the pool was replaced.
These logs do not constitute configured alerts or a proven Azure outage fix.

Run the mocked pool lifecycle tests:

```powershell
node --experimental-strip-types --test app\lib\db.test.mjs
```

After deployment, verify normal login, then login after an idle period. Test
database unavailability and restoration only in a separate nonproduction slot
and database: confirm an error during the outage, then successful requests
without restarting the app after connectivity returns. Also test simultaneous
requests and inspect pool recovery/error codes. Do not stop the live database,
change production firewall rules, or invalidate credentials to induce a test.
Azure SQL Resource Health, serverless auto-pause/resume (if configured), network
access, and resource saturation still require operational investigation.

Image optimization remains enabled, but `images.maximumDiskCacheSize: 0` in
`next.config.ts` disables its filesystem cache because run-from-package mounts
the deployment read-only. This avoids image-cache directory initialization and
write failures under `.next/cache`; it does not change uploaded-file storage.
Without a disk cache, optimized images may need reprocessing after cache misses.
Do not enable disk caching without providing a supported writable cache backend.
Run `node --experimental-strip-types --test app\lib\image-cache.test.mjs` to check
the installed Next.js image cache against this configuration. After deployment,
refresh the home page and verify its tile images render without new image-cache
errors in App Service Log stream.

### Private Azure Blob Storage

Both the Files explorer and project attachments use a private blob container when
`AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_STORAGE_CONTAINER_NAME` are set. For the
current App Service, configure `overheadfilesstorage` and `application-files`.
Enable Overhead's **system-assigned managed identity** and assign **Storage Blob
Data Contributor** at that container's scope. Allow time for RBAC propagation.
Keep anonymous blob access disabled; no account key, connection string, or
public/SAS download URL is required. The app uses `ManagedIdentityCredential`
on App Service and proxies content through its existing authorized endpoints.
The storage firewall must also allow the app's traffic; RBAC does not bypass it.

Files are stored under `files/organizations/<OrganizationID>/`; project content
uses `project-attachments/organizations/<OrganizationID>/<opaque storage key>`.
Paths and attachment metadata remain checked against the signed-in organization.
Empty explorer folders use zero-byte blobs ending in `/`. Uploads use conditional
creation and cannot overwrite an existing blob. Project video downloads retain
byte-range support. Archiving an attachment still retains the underlying blob.
Neither backend adds a Files delete operation.

Without either setting, local development retains its existing filesystem paths.
Local Blob development can use `az login` with an appropriate container data role
through `DefaultAzureCredential`; setting both variables opts into Blob Storage.
Partial/invalid configuration fails explicitly, and App Service refuses local
fallback when its storage settings are absent. Storage authorization/outage
errors are surfaced, not treated as empty folders or successful local uploads.

This is a storage-backend switch, **not an automatic migration**: existing local
files are not copied or served as a fallback. Before enabling Blob Storage on an
installation containing uploads, back them up and migrate each organization's
explorer files to its prefix. Project attachment objects must be copied to their
organization prefix using the unchanged SQL `StorageKey`; retain SQL metadata.
Do not copy unassigned legacy shared files without first determining ownership.
Back up SQL and blob data together; soft delete is not a complete backup policy.
Malware scanning, quotas, and lifecycle/retention policy remain follow-up work.

Run the focused storage regressions:

```powershell
node --experimental-strip-types --test app\lib\blob-storage.test.mjs app\lib\access-boundaries.test.mjs app\lib\project-attachment-policy.test.mjs
```

Blob tests mock the Azure SDK; they verify tenant keys, conditional uploads,
empty folders, previews, permissions, byte ranges, SQL-failure cleanup, and
explicit storage failures, but do not prove live Azure connectivity or RBAC.
After deployment, use synthetic files to verify owner upload/download, rejection
of cross-organization reads, viewer write denial, and persistence after an App
Service restart. Check both Files and project attachments before real uploads.

### Persistent account signup and email verification

Public persistent signup is disabled unless the App Service setting
`ACCOUNT_SIGNUP_ENABLED` is exactly `true`. Before deploying a version that
uses this flow, apply
[database/account-registration-schema.sql](database/account-registration-schema.sql)
in SSMS to `overhead-testdb`. The migration creates pending-verification and
shared SQL rate-limit tables and grants the existing `overhead_app` database
principal access. If the application principal differs, stop and review the
grant target before running the script. The login endpoint also uses the shared
rate-limit table, so the schema migration must precede deployment.

Before deploying the mailbox-owner password flow, also run
[database/account-registration-password-after-verification.sql](database/account-registration-password-after-verification.sql)
in SSMS. It removes the old password column from pending verifications and
refuses to run outside `overhead-testdb`.

Configure these App Service settings privately before enabling signup:

| Setting | Value |
|---|---|
| `AZURE_COMMUNICATION_EMAIL_ENDPOINT` | `https://overhead-communication.unitedstates.communication.azure.com` |
| `AZURE_COMMUNICATION_EMAIL_SENDER` | `DoNotReply@3363b393-db15-447a-af00-6d46e399db58.azurecomm.net` |
| `PUBLIC_APP_URL` | `https://overhead-ercgfdckdme4d8bv.westus3-01.azurewebsites.net` |
| `TURNSTILE_SITE_KEY` | Public site key from the Turnstile widget |
| `TURNSTILE_SECRET_KEY` | Secret key from that widget; keep private in App Service settings |
| `ACCOUNT_SIGNUP_ENABLED` | Keep `false` until migration, email, and staged verification pass |
| `ACCOUNT_SIGNUP_ALLOWED_EMAILS` | Comma-separated exact email addresses approved for pilot registration; required for new accounts |

Pilot registration is server-restricted to `ACCOUNT_SIGNUP_ALLOWED_EMAILS`.
Registration emits `Account registration` runtime logs with a random request ID
and processing stage, without email addresses, names, tokens, or passwords.
Use `allowlist_rejected`, `pending_created`, `email_send_started`, and the final
`email_send_succeeded`/`email_send_failed` stages to diagnose generic responses.
A successful send operation is ACS acceptance, not proof of inbox delivery;
use ACS delivery diagnostics for recipient delivery status. Thrown email errors
record a sanitized SDK code, never the SDK message or verification link.
Configure the list privately in App Service settings, not source code or
`NEXT_PUBLIC_` variables. Add later testers by appending their exact email
addresses with commas, then apply the setting. Matching ignores case and
surrounding whitespace, but does not expand domains, wildcards, Gmail dots,
or plus aliases. Missing/empty lists allow no new registrations; malformed
lists fail the request with a server error. Unapproved addresses receive the
same generic 202 response, after throttling and Turnstile, without creating a
pending token or sending email.

Verification checks the current list again before provisioning. Removing an
address invalidates its outstanding link on submission, but does not revoke
an already-created account or change existing logins. The signup enable flag
still controls new requests; turning it off alone does not invalidate issued
links for approved addresses. This pilot restriction remains in force until
explicitly changed in code; an empty list never means unrestricted signup.

Create a [Cloudflare Turnstile widget](https://developers.cloudflare.com/turnstile/get-started/)
and allow-list the exact App Service hostname
`overhead-ercgfdckdme4d8bv.westus3-01.azurewebsites.net`. Set its site key and
secret as the two settings above; only the site key is sent to the browser.
The registration API calls Cloudflare Siteverify server-side, fails closed on
configuration/provider errors, and verifies the returned hostname against
`PUBLIC_APP_URL`. A missing site key keeps the registration form unavailable.
Turnstile protects signup only and does not change sign-in.

The App Service system-assigned identity needs the Communication Services
email-send role on `overhead-communication`. The app uses `ManagedIdentityCredential`
there and `DefaultAzureCredential` for local development. No connection string
or ACS access key is used. Verification mail is sent only through the real ACS
Email SDK; incomplete configuration or delivery failure is logged and removal
of the pending token is attempted, never treated as a successful send. Email is
sent after the generic response to reduce timing-based account enumeration. The
API keeps the same generic response for existing addresses and delivery
failures. Run an Azure Portal **Try Email** test before enabling registration.

Signup collects a name, company name, and email. It sends a generic
response to avoid disclosing whether an address already has an account. Pending
records contain signup metadata and a SHA-256 hash of the random verification
token, but no password. The one-use link expires after 30 minutes; the token is
in the URL fragment, so browsers do not send it in the initial page request.
After following the link, the email owner chooses and confirms a password;
only then does the app create the user, a separate Trial
organization, an Owner membership and role with the 17 current application
permissions, and default invoice settings in one SQL transaction. No email
domain/company matching or auto-joining is performed. There is no password
recovery or verification-resend flow yet.

Turnstile challenge verification supplements the shared SQL-backed limits on
login (10/IP/15 minutes), registration
(5/IP/hour and 3/address/hour), and verification (20/IP/15 minutes and
5/token/15 minutes). Rate-limit identifiers are HMACed with `SESSION_SECRET`
before storage; raw IPs and verification tokens are not stored in that table.
The client address uses the rightmost `X-Forwarded-For` entry under the current
Azure App Service proxy topology. Source ports are removed and IPv6 addresses
are canonicalized before hashing so new connections do not reset IP counters.
Changing the proxy topology requires revalidating which entry is trusted.
Missing addresses share a logged fallback bucket; malformed addresses fail
the request. App restarts do not clear SQL rate-limit counters.
Expired pending signups and rate-limit rows are pruned in bounded batches
during requests. Public signup still needs
operational monitoring and broader abuse controls before unrestricted launch.

The verification endpoint requires the configured application Origin and JSON
content type, and rejects cross-site Fetch Metadata before token consumption or
session creation to prevent cross-site session replacement.

Keep `ACCOUNT_SIGNUP_ENABLED=false` during initial deployment. Test one new
address end-to-end after applying the migration and configuring ACS. Confirm
that no account or organization exists before verification, the email link
lets the mailbox owner set the password and creates exactly one isolated
organization, replay/expiry fail, and login works.
Then test a second signup and cross-company reads/writes. Conduct the planned
focused security review before changing the setting to `true`. Account recovery,
upload quotas, and malware scanning are remaining launch work.

Run registration regressions with:

```powershell
node --experimental-strip-types --test app\lib\account-registration.test.mjs app\lib\account-registration-route.test.mjs app\lib\account-verification-route.test.mjs app\lib\turnstile.test.mjs app\lib\verification-email.test.mjs
```

## Initial Azure SQL schema

[database/azure-sql-baseline.sql](database/azure-sql-baseline.sql) is a schema-only
snapshot exported from the working local `centralHubTest` database on 2026-10-16.
It targets Azure SQL Database and includes 47 tables, 4 views, 59 triggers,
177 indexes (including primary/unique constraints), 143 foreign keys, 65 check
constraints, and 118 defaults. No table rows, database users, logins, credentials,
or permission grants were exported. Azure SQL syntax parsing passed; this is
not yet evidence of a successful deployment to an empty Azure database.

Use it only to initialize a **new, empty database**, not to upgrade an existing
database. In SSMS, connect to the Azure SQL server using the configured
authentication method (Microsoft Entra MFA for the administrator if Entra-only
authentication is enabled), open a query explicitly targeting the intended
database, and open the baseline script. Validate it in a disposable database
before executing it against the deployment database. No `CREATE DATABASE` or
`USE` statement is included. Execution is not wrapped in one transaction; if a
batch fails, stop and investigate rather than rerunning over partial objects.

After the baseline, apply
[database/estimate-status-schema.sql](database/estimate-status-schema.sql):
this idempotently enforces Draft/Won/Lost and converts any legacy Sent
estimates to Draft.

Do not replay all older migration files or run the organization foundation
bootstrap: their existing schema changes are already reflected in this snapshot,
and the foundation bootstrap is restricted to the local database name.

The baseline contains legacy `OrganizationID = 1` defaults on tenant-owned
tables. After reviewing the intended database and baseline, apply
[database/organization-defaults-removal.sql](database/organization-defaults-removal.sql)
before seeding organization data. The guarded, transactional script verifies the
expected schema and removes only `OrganizationID` defaults whose value is `1`;
it does not change existing rows and is safe to rerun after a completed run.
The migration is prepared for review and is not run by the application or
deployment workflow. The app now supplies the authenticated membership's
organization ID on the covered business reads and writes rather than relying on
a database default.

A separately reviewed initialization step must provide the intended organization,
reference data (including units), access roles/permissions, and owner/demo
accounts before the app is usable. Schema creation alone does not provide a
working application login.
Database access for the App Service identity/user must also be granted separately.

For future changes, keep versioned migration scripts as the source of truth and
record applied migrations; do not repeatedly overwrite Azure from the local
schema. The baseline does not install a migration-history runner.

### Azure demo initialization

After the baseline and estimate status migration, run
[database/azure-sql-initialize.sql](database/azure-sql-initialize.sql) in SSMS
against `overhead-testdb`. It refuses another database name and runs in one
transaction with explicit rollback on failure. No local database changes or
business-data migration are required. It initializes:

- `Overhead Demo` (`overhead-demo`) at OrganizationID 1, matching the baseline's
  legacy single-organization defaults.
- Doug (`dcrobb29@gmail.com`) with the Owner role and 17 explicit permissions.
- Recruiter Demo (`demo@overhead.example`) with a Viewer role containing only the
  seven explicit module `.read` permissions, no `.write` or `.manage` grants.
- Twelve approved local unit presets and the employee job titles CEO, VP, and
  Project Manager. Job titles do not grant application permissions.
- Internal test-plan metadata (two seats, no billing provider) and invoice
  settings. This does not represent a purchased subscription.

Both users are deliberately created **inactive**, with NULL password hashes.
The login no longer has prefilled credentials, an account picker, a public
account directory, a practice-password bypass, or plaintext password acceptance.
Deploy this updated code before activating accounts. Set a strong
`SESSION_SECRET`, provision passwords privately, and validate route-level
authorization before exposing the demo as production-ready. Read-only role grants
are not proof that every existing endpoint enforces them. No password, secret,
SQL database principal, managed-identity grant, or Entra user is created here.
The `.example` demo email is a login identifier, not a deliverable mailbox.

The script can be rerun before account activation: it adds missing seed records
without resetting passwords, changing existing names, deleting roles, or
silently removing unexpected grants. Conflicting organizations, account state,
memberships, grants, units, or subscription metadata cause an error and rollback.
It refuses reruns after either account is activated or receives a password.
Its result sets should show the two inactive/uncredentialed users, Owner with
17 permissions, Viewer with 7, twelve unit presets, and three job titles on a
fresh baseline. No demo estimates, projects, customers, bills, or employees
are inserted. Deploying realistic demo business data is a separate step.
Validation performed: Azure SQL syntax parsing, SQL Server compile-only
(`NOEXEC`) validation against the local schema, and checks of the permission
and reference-data counts. Seed execution and rerun behavior have not yet been
tested against an empty database; nothing was executed against Azure.

### Application login and SQL authentication

Application login and database login are separate. A SQL administrator or an
Entra SQL administrator is not automatically an application user. Website login
requires an active `Users` record with an individual PBKDF2 password hash,
an active organization membership, and explicit role permissions.
New users created through membership settings are inactive with no password;
there is no default initial password. Provision credentials separately before
activation. Existing plaintext passwords must be reset; existing PBKDF2 hashes
remain supported. New hashes use PBKDF2-SHA256 with 600,000 iterations.

`SESSION_SECRET` must contain at least 32 bytes and be configured privately in
App Service environment variables and, for local session use, untracked
`.env.local`. There is no built-in fallback, even locally. Missing/weak secrets
fail session signing/verification. Login service errors are logged server-side,
not returned as database error details to the browser.
Session API reads require a valid active session (not an email query parameter);
profile updates are restricted to the authenticated user's own ID.
Middleware now verifies signed session tokens rather than trusting cookie
presence, and checks the current active user and organization membership in SQL
on protected requests. Inactive/deleted users, revoked memberships, and archived
organizations cannot continue using an otherwise unexpired cookie. Database
verification failures return 503 rather than allowing access.
Unauthenticated API requests are rejected except login/logout.
Organization resolution requires an authenticated active membership; it never
falls back to the first organization or organization 1. Background scripts must
pass an explicit organization ID instead of relying on request context.
For users with multiple active memberships, both account and organization lookup
currently select the lowest organization ID; an organization switcher is not yet
implemented.
Module-specific role and resource ownership checks must still be enforced by each
endpoint; the middleware gate is not a replacement for those checks.

Organization settings and invoice-template previews require `organization.manage`
and use the session's organization, rejecting mismatched request organization IDs.
Member changes additionally require `members.manage`; employee changes and links
require `personnel.write`; invoice template changes require `finances.write`.
The settings menu is hidden without `organization.manage`. Membership updates
verify tenant ownership before changing any role assignments. Attaching an
existing account to a different organization is blocked until an invitation
acceptance flow exists.

Invoice listing and next-number lookup require `finances.read`; creation,
updates, deletion, and emailing require `finances.write`. Resource lookups use the
authorized organization, not a caller-supplied tenant ID.
Invoice updates and deletes return `404` with `Invoice not found` for nonexistent
IDs and IDs owned by another organization. SQL checks target ownership before
reference/business checks and uses mutation output rather than trigger row counts
to detect a target that disappears before the write.
Run their mocked database/API regressions with
`node --experimental-strip-types --test app/lib/invoice-mutations.test.mjs`.
These tests do not execute SQL or replace live two-organization verification.

The file explorer uses existing `projects.read` / `projects.write` permissions
for reads / writes. Its files are isolated under
`storage/files/organizations/<OrganizationID>`; API paths remain relative to that
organization's root. Traversal, Windows alternate data streams, and symbolic
links/junctions in tenant paths are rejected. Uploads cannot overwrite an existing
file. Legacy files directly under `storage/files` remain untouched and are no
longer served by the explorer. A trusted administrator must determine ownership
and explicitly move any needed legacy files into the correct organization root
before users can see them. Do not put links to shared folders in tenant roots.
On Azure, configure the private Blob Storage backend described above; the
run-from-package application directory is read-only.

For SQL username/password connectivity, the Azure SQL server must permit SQL
authentication. Configure a dedicated least-privilege application SQL user
through private `DB_USER`/`DB_PASSWORD` App Service settings, alongside `DB_SERVER`,
`DB_NAME`, encryption, and firewall settings. Do not use the SQL administrator
as the web app database identity. Entra-only SQL instead requires managed identity
connection support and corresponding database grants.

Run focused authentication regression checks with
`node --experimental-strip-types --test app/lib/auth.test.mjs app/lib/login-access.test.mjs app/lib/access-boundaries.test.mjs app/lib/member-boundaries.test.mjs`.
These changes remove practice access; they are not a certification of all
application routes. Rate limiting and a complete authorization review remain
separate pre-launch work.

## Interaction styling

Shared, low-specificity styles in `app/styles.css` give links an underline,
unstyled buttons a bordered surface, and disclosures a tinted surface. Existing
component styles retain their visual hierarchy. Interactive elements share a
visible keyboard-focus outline; disabled controls are dimmed and do not receive
the fallback hover treatment. Billing-history and scope disclosures also show
a chevron that changes direction when expanded.

Use semantic links for navigation, buttons for actions, and `details`/`summary`
for expandable content so new controls inherit these affordances. Text-only
actions must retain an underline or another visible non-color cue at rest;
do not rely on cursor or hover changes alone.

## Project workspace

Apply `database\project-workspace-schema.sql` with an admin SQL connection before
using project attachments. The migration adds project/organization-owned
`ProjectAttachments` metadata; existing files and business records are unchanged.

Use **Open project** on a project card, or visit `/projects/{id}`.
Project Management is a compact portfolio: name, customer, editable status,
contract value (per occurrence for recurring jobs), Invoice, and Open project.
Recurring frequency and dates remain visible. Detailed scope, costs, bill
reconciliation, notes, and contract changes live in the project workspace rather
than expanding within every portfolio card. Billing customer assignment is
available in Overview and Scope & Finances; completion and invoicing remain in
Scope & Finances. No calculations or approval workflows have changed.

The project and estimate portfolios share mobile-first layouts in `app/components/record-workspace.module.css`:
below 640px, stacked cards and wrapping filters; **sm** (640px), inline filter
controls; **md** (768px), two-row summary cards; **lg** (1024px), single-row cards;
**xl** (1280px), wider spacing with a 1280px content limit.
The application shell fills the dynamic viewport with an intrinsic-height header
and footer and a flexible, independently scrolling content area. The header and
footer stay visible without overlaying content; the document itself does not
scroll. Project Management and project workspaces scroll within the available
content height, with no separate fixed-height portfolio list. Project workspaces
use a readable status selector instead of viewport-width sizing.
The shared header wraps below 640px. Other module layouts are not part
of the project and estimate portfolio simplification.
Legacy `projectId` and post-conversion `created` query parameters select the
correct project/recurring tab and highlight the target card.

## Sales & Estimates workspace

Sales follows the same compact portfolio and open-record pattern as Projects &
Jobs. Cards show the estimate/customer, status, base quoted value, PDF, and **Open
estimate**. Recurring cards retain frequency, dates, and per-occurrence pricing.
Project/recurring tabs, approval filters, and search remain on the overview.
All former table-column filters and both sort directions for every field are
available in **Filters & sort**, including recurring frequency and dates.
Material Catalog and Scope Templates are grouped under **Libraries**.

`/sales/{estimateId}` opens an organization-owned base estimate with the same
breadcrumb and section-tab conventions as project workspaces:

- **Overview**: customer, value, work type, line count, recurring dates, and
  internal/customer notes.
- **Scope & Pricing**: complete base-bid lines and quantities, pricing settings,
  internal freight/tax, per-line markup, and collapsible scope/type groups.
- **Alternates**: the existing separate alternate management and approval tools.

Apply [database/estimate-status-schema.sql](database/estimate-status-schema.sql)
with an admin SQL connection to **centralHubTest** locally, then separately to
**overhead-testdb** when deploying. Back up the target database first. The
transactional, rerunnable migration converts legacy **Sent** estimates to
**Draft** and enforces **Draft / Won / Lost** with a trusted check constraint.
It reports the number converted, aborts on unexpected statuses, and does not
create projects or change existing Won/Lost records. Approved/Not approved
were list filters, not stored estimate statuses; no data conversion is needed
for those labels. The matching
[rollback](database/estimate-status-rollback.sql) restores permission to store
Sent but cannot identify or restore which Draft records were previously Sent.

Both cards and the workspace have an estimate-specific status selector:
**Draft**, **Won**, and **Lost**. Draft and Lost can be changed to each other.
Selecting Won from Draft opens the existing confirmation/alternate selection
dialog. Confirmation marks the estimate Won and creates its Upcoming project
in one transaction; canceling changes neither. Reopen a Lost estimate as Draft
before winning it. Won estimates remain locked and cannot be won again.
Draft estimates support editing and bid alternates. Lost does not automatically
archive or delete a record. Individual alternates and change orders retain their
separate Draft / Proposed / Approved / Rejected workflow and approval evidence.

PDF is available from both cards and the workspace. Edit is in the workspace
action bar; Delete is under **More actions** and still requires confirmation.
Won/read-only estimates retain their existing action restrictions.
The existing new/edit forms, alternate-draft editor, PDF settings/preview, and
win/conversion workflows are unchanged. The overview no longer expands these
details inside each card. Both portfolios retain the viewport-contained shell
and the same small/medium/large/XL breakpoints.

## Project workspace sections

- Overview: customer, accepted estimate, dates, notes, and project status.
- Scope & Finances: the existing cost panel and calculations, project-linked
  invoices and bills, and the shared completion/invoice modal. Single-job bills
  count in full; split bills count only this project's allocations. Recurring
  estimated cost is per accepted occurrence, while recorded financial totals
  cover the agreement. This is not earned-value or completion-adjusted reporting.
- Documents: contracts, PDFs, text/CSV and Office documents.
- Media: JPG/PNG/GIF/WebP images and MP4/WebM/MOV videos. Browser playback depends
  on the codec; download remains available. Video requests support byte ranges.
- Schedule: the same weekly planner and task-assignment modal, with the board
  limited to this project but availability calculated across **all Active jobs
  in the organization**. Only Active jobs can be scheduled. Changes save to
  Field Operations immediately; visible planners refresh every 30 seconds and
  on focus. Crew templates/bulk crew assignment are not implemented.
- Reporting: a reserved section, not a fabricated percent-complete dashboard.

Tabs load their data on demand. Project documents/media require a verified local
session, active membership, `projects.read` to view and `projects.write` to upload
or remove. Finance and planning sections use their corresponding permissions.
The linked project status/cost/billing and planning mutations validate ownership
on the server. This does not complete the application's broader SaaS rollout.

Uploads are limited to 100 MB per nonempty file and the listed file types.
Local content is stored under `storage\project-attachments`; configured Azure
content uses organization-prefixed blobs, outside the path-based file explorer,
with opaque storage keys. Preview/download requests
resolve organization-owned metadata rather than trusting browser paths.
Removal archives metadata and retains the physical file; it is not a permanent
storage purge. Completed jobs still accept documents/media for afterlife records.
Excluding sample data removes attachment metadata linked to sample projects;
uploaded physical content is retained. Existing Files folders are not
automatically imported or linked. Back up both SQL metadata and the configured
content store. Scanning/retention policies and association of existing Files
content remain follow-up work before public hosting.

Run focused workspace tests with
`node --test app/lib/project-attachment-policy.test.mjs app/lib/field-capacity.test.mjs`.
For rollback-only database checks, set `RUN_DB_TESTS=1` and run
`node --test --test-concurrency=1 app/lib/project-workspace.integration.test.mjs app/lib/project-costs.integration.test.mjs app/lib/project-billing.integration.test.mjs app/lib/recurring-schedule.integration.test.mjs`.
Run database suites sequentially because their transaction fixtures can contend
for shared records. The workspace test also removes its temporary uploaded file.

## Alternates and change orders

Apply `database\contract-changes-schema.sql` after the existing organization,
project billing, and sample-data migrations. It is rerunnable. Apply it last:
rerunning older billing trigger migrations afterwards reinstates the old caps;
rerun this migration to restore current-contract caps.

Use **Alternates** on a Sales estimate (also listed below its expanded scope).
Use the project workspace's **Alternates & Change Orders** tab.
Both use one shared
estimate-style editor: scope, Material/Labor/Equipment lines, preset units,
quantity, cost, freight, markup, tax, and internal/customer notes. New records
have an ALT/CO number plus their own linked EST record ID, not independent jobs.

Base bid totals exclude alternates. Save a draft, propose it, then select the
customer's accepted alternates when marking the bid won. Record approval date
and reference. Unselected alternates can become linked change-order proposals;
they cannot be converted twice. Later changes follow Draft -> Proposed ->
Approved/Rejected. Negotiated edits return proposals to Draft and increment
their version. Approval requires project and finance write permissions.

The displayed original bid, accepted alternates, initial contract, approved
change orders, and current contract are separate values. Pending proposals do
not change them. Approved additions appear in the same project cost panel and
scope billing as the original work. Deductions select existing work and remove
a positive quantity at its original allocated contract price (including its
original markup/rounding); users cannot invent deduction prices. Approved
deductions reduce the linked budget, quantity, and remaining scope billing.
The original estimate and billing snapshots stay unchanged. Issued invoices
are never rewritten. Credits/refunds are not implemented: invoice/cost conflicts,
legacy invoices needing reconciliation, and reductions below recorded costs
block approval with an explanation. Reopening a job does not unlock approvals.

Editing a draft base bid resets its alternates to Draft. Since the existing
base editor replaces line IDs, deductions must be reselected and re-proposed.
Unapproved documents can be removed; approved documents require a corrective
change order. Approval freezes the before/after contract values for historical
PDFs even when later change orders adjust the job. PDF exports include only customer notes and sell values.
Viewing an estimate's scope shows separate base-bid and bid-alternate containers;
alternate scopes expand inline instead of opening a separate viewing modal.
Project contract records remain available in the workspace's dedicated tab.
The **New Estimate** form includes **Add alternate** beneath the base estimate
total. Each alternate uses the shared change-pricing editor and has its own signed
subtotal after that total; none are added to the base bid. Additive lines and
deductions referencing unsaved base-bid lines are supported. Saving writes the
base bid and all linked alternate drafts in one transaction: a failed alternate
leaves no partially saved estimate. Drafts can be included in the customer PDF
without approving them; they must still be proposed before selection at bid
acceptance. Recurring work remains excluded.
The PDF print preview has a saved **Alternates (separate from base bid)** toggle,
enabled by default. Included draft/proposed/approved alternates print immediately after the base
bid with their own scope lines and signed totals; they never change the base total.
Quantity, line-total, and scope-heading print options also apply to alternate lines.
Rejected alternates are not included in customer PDFs. Printing a draft does not
propose or approve it, and does not change the contract.
Apply [database/estimate-alternates-print-schema.sql](database/estimate-alternates-print-schema.sql)
for the saved print preference.

Recurring agreements are explicitly excluded. Existing scheduled assignments
are retained; newly scheduled estimate-backed labor tasks include approved
additions. No worked-time or e-signature system is implied.

Sample insertion now includes a proposed alternate and a proposed change order.
Normal include/exclude remains reversible. If a sample job receives an approved
contract document, exclusion is blocked rather than deleting immutable approval
history; avoid approving sample proposals if you intend to remove all samples.

Run `node --test app/lib/contract-change-pricing.test.mjs app/lib/estimate-pdf.test.mjs`.
For rollback-only database integration, set `RUN_DB_TESTS=1` and run
`node --test --test-concurrency=1 app/lib/contract-changes.integration.test.mjs app/lib/project-billing.integration.test.mjs app/lib/project-costs.integration.test.mjs`.

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

## Live manual two-organization security verification

The paired scripts
[database/live-two-org-security-fixture-setup.sql](database/live-two-org-security-fixture-setup.sql)
and
[database/live-two-org-security-fixture-cleanup.sql](database/live-two-org-security-fixture-cleanup.sql)
prepare and remove a deliberately small, synthetic verification dataset. They
are **manual SQL only**: neither has been run against the database. They make no
Azure changes and do not create SQL/Entra principals or store passwords.

Before running setup, review both scripts and confirm the live schema matches
`azure-sql-baseline.sql`, `azure-sql-initialize.sql`, the deployed organization
and tenant-foreign-key migrations, customer/personnel/project/billing schemas,
`sample-data-tracking-schema.sql`, and
`organization-defaults-removal.sql`. Connect directly to `overhead-testdb`;
the scripts also enforce that database name. Setup requires the existing
OrganizationID 1 to remain `overhead-demo` / `Overhead Demo` / `Active` with
exactly two memberships, all required application permissions to exist, and
relevant tenant foreign keys to be enabled and trusted. It will stop rather
than repair or overwrite an unexpected identity, schema, permission, or
fixture-key collision.
In SSMS, confirm the database selector says `overhead-testdb`, review the paired
scripts, and execute the setup file by itself. Do not run it against production.

The shared, exact fixture marker is `SECVERIFY-20261016-7F29D2E6`, with A/B
suffixes. Each new organization receives two inactive synthetic users
(`secverify-{a,b}-{owner,viewer}@security-fixture.invalid`), active
organization memberships, distinct organization-scoped Owner and Viewer
roles, and explicit grants (Owner: all 17 seeded capabilities; Viewer:
the 7 `*.read` capabilities). Every inserted tenant-owned row supplies its
`OrganizationID`; no reliance on removed bootstrap defaults remains. Each
organization also gets one synthetic customer, active project, vendor bill,
non-project-billing invoice, employee, personnel job title, and employee
history row. Values are invented and clearly marked; no Overhead Demo or
other real organization data is copied. The script reports generated IDs and
per-organization business-row counts. Expected output is two Active fixture
organizations; four users with `IsActive = 0` and
`PasswordState = Not provisioned`; Owner/Viewer permission counts of 17/7 per
org; exactly one customer, project, bill, invoice, employee, and history row
per org; and OrganizationID 1 still Active with its two memberships.

**Private password provisioning is a separate operator step.** The fixture
users intentionally have `IsActive = 0` and `PasswordHash = NULL`; their
memberships are active but they cannot log in yet. No password, password hash,
or reset token belongs in either SQL file, source control, a saved SSMS query,
or chat. This repository has no self-service registration or password-reset
flow. For each test account, privately generate a fresh hash by calling
`hashPassword()` in `app/lib/auth.ts` (PBKDF2-SHA256, 600,000 iterations), then
use a trusted local operator process or a **private, unsaved** SQL session with
an exact-email/empty-hash guard to set that user's hash and activate only the
matching reserved account. The guarded update shape is:

```sql
DECLARE @FixtureEmail nvarchar(254) = N'<one exact fixture email>';
DECLARE @NewPasswordHash nvarchar(255) = N'<fresh hash from hashPassword(); do not save this value>';
UPDATE dbo.Users
SET PasswordHash = @NewPasswordHash, IsActive = 1
WHERE NormalizedEmail = @FixtureEmail
  AND IsActive = 0
  AND PasswordHash IS NULL;
IF @@ROWCOUNT <> 1
    THROW 51290, 'Expected one inactive, unprovisioned fixture user.', 1;
```

Replace placeholders only in that private session; do not save the completed
query or hash. Confirm each account is active/provisioned before browser tests.
The `.invalid` email addresses cannot receive mail; use a private password
handoff for this test only, and do not reuse real credentials.

Use two **separate browser profiles** so the session cookies cannot overwrite
each other:

1. Provision unique test passwords privately, activate each intended account,
   and open the deployed test application in two isolated profiles.
2. Sign in to profile 1 as A Owner and profile 2 as B Viewer. Confirm each sees
   only its own organization and the matching tagged customer, project,
   invoice, bill, and employee. Try direct record URLs/API IDs belonging to the
   other organization; they must be denied or appear absent.
3. Confirm B Viewer cannot create, update, delete, or administer records, even
   by direct API requests. A hidden/disabled button alone is not a successful
   authorization check. If any cross-tenant read/write or unauthorized Viewer
   mutation succeeds, stop testing and treat it as a security failure.
4. Sign out and repeat with A Viewer and B Owner. Verify the same isolation in
   both directions. Keep this verification limited to synthetic records.
5. Sign out both profiles before cleanup. Run the paired cleanup only after
   reviewing its preflight conditions and output.

Cleanup is intentionally narrow and transactional. It requires both exact
fixture organizations and the original ownership-marker inventory (41 tracked
rows per organization), checks for untracked tenant rows and related foreign
keys, and deletes in FK order. Any extra records added during browser testing,
unexpected marker, external membership, linked `UserIdentity`, unknown
organization-owned table row, or disabled/untrusted related FK makes cleanup
roll back without broad deletion. Remove manually added app records through the
application and retry; do not widen the cleanup predicates or disable
constraints. Uploaded physical files are not SQL rows and are never removed by
these scripts. Archived attachment metadata or other extra rows may therefore
cause cleanup to refuse; handle those separately and review every relationship.
The scripts never delete OrganizationID 1, any existing user, the permission
catalog, or non-fixture records.

This fixture only provides controlled test data. Passing the browser checks
does not certify row-level security, pooled-connection isolation, deployment
configuration, or production readiness; continue with the SaaS rollout items
above.

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

## Central styling reference

Styling references are developer-only files in the codebase, not an application
page or customer-facing menu.

[app/design-system.css](app/design-system.css) is the central CSS foundation for
semantic tokens and shared action recipes, organized into labeled sections.
Existing aliases keep older forms working. The [style catalog](docs/STYLE-CATALOG.md)
groups variants by component type and records source ownership, cross-tile
coverage, tokens and remaining exceptions. Shared layout CSS modules are linked
from that catalog.

This is a consolidation/inventory pass, not yet a new brand theme or a claim
that every legacy component has been migrated.

## Files workspace

Files uses the shared compact-card layout rather than an always-visible sidebar
and empty preview pane. The current folder is the main surface, with named
**Open folder**, **Preview**, and **Download** actions. Breadcrumbs and **Up one
folder** retain folder navigation. Search still matches names within the current
folder; **Filters & sort** adds file/folder filtering and name order, keeping
folders before files.

Opening a file shows a focused preview workspace with **Back to folder**, the
existing download control and all existing image, video, audio, PDF, text,
Office-document, and unsupported-format renderers. **File details** expands its
location, size, and modified date. Returning from preview retains the folder's
search and filters.

**Import** groups file and folder pickers in the shared dialog. Multiple-file
imports and relative subfolder paths are preserved. Navigation is disabled during
uploads so the target folder stays fixed. Partial upload failures remain visible
after refreshing the folder, alongside the number imported. Directory failures
have an explicit retry action; Office-preview failures also offer retry.
**New folder** uses the shared form dialog instead of a browser prompt.

Storage paths, duplicate-file protection, upload/download endpoints and preview
formats are unchanged. The responsive layout uses the same small/medium/large/XL
breakpoints as other tiles; header/footer stay visible with scrolling contained
inside the application.

## Finances workspace

Finances follows the same compact overview and focused-record pattern as
Projects, Sales, and People. The responsive section navigation keeps Customers,
Invoices, Bills, and Project Finances available without a fixed-width sidebar.
Invoices, bills, and project financials default to compact cards. **Open invoice**,
**Open bill**, and **Open financials** reveal an **Overview** and **All details**
workspace. Customer cards use the same pattern for contact details and addresses.

The **Detailed table** option preserves the full column layouts, column filters,
sorting, and invoice/bill actions. Both views share search, field filters, sort,
and pagination. **Filters & sort** makes every original field available from the
compact view; addresses and other secondary fields remain searchable even when
not shown on cards. Back controls return to the list without clearing its search,
filters, sort, or page.

Existing import/edit forms, saved-customer snapshots, notes, email dialogs,
deletion confirmations, paid dates, split-bill controls, allocation links,
customer archive/restore, and project creation remain available. Issued-invoice
and completed-project restrictions are unchanged. Financial calculations and API
contracts are unchanged; this is a presentation-only pass. Header/footer remain
visible, while long content and detailed tables scroll within the application.

## People workspace

People uses the same compact overview and focused-record pattern as Sales &
Estimates and Projects & Jobs. The default **Directory** shows name, role,
manager, direct-report count, and **Open person**. Search matches name, role,
and manager; **Filters & sort** provides role filtering and name sorting.
The full **Organization chart** remains an alternate view with its existing
zoom/fit controls; selecting a person opens the same focused workspace.
Chart cards have visibly underlined names and pointer affordances.

Person workspaces use bookmarkable `/personnel?personId={id}&tab=overview`
and `tab=history` links, with **Overview** and **History** section tabs.
Overview retains role, manager, direct reports, and **Edit person**.
Manager/report links open their person workspaces. History retains dated notes,
loads only when opened, and offers **Add history** in the shared dialog instead
of an always-visible form. Failed directory/history loads show explicit errors
and retry controls. **Roles** groups the role list and existing Add role form.
Person creation still supports no connection, reporting to someone, or managing
someone; editing still changes name, role, and manager. No personnel API,
storage, reporting rules, or history schema changes are part of this UI pass.

The directory reuses the shared responsive portfolio styles and small/medium/
large/XL breakpoints. Header/footer stay visible, with scrolling contained in
the application content area. Chart and dialog content fit the available width.

## Field operations planner

Apply [database/field-operations-planning-schema.sql](database/field-operations-planning-schema.sql)
after the project workflow, personnel, and equipment schemas. The planner uses
dated `ServiceVisits`, adds multiple task rows per visit, and stores employee or
equipment assignments on each task. Task and assignment removal is soft, so the
application only needs SELECT/INSERT/UPDATE permissions.

The weekly board lists only Active projects and recurring jobs, plus all org-chart
employees; overhead filtering is not applied. Upcoming jobs remain in Project
Management for preparation, and Complete jobs are not assignable.
The schedule-first layout follows the project/estimate convention of compact
summaries with explicit access to detail. **Schedule job** expands the job/date
selectors; **Use drag & drop** switches to the existing job pool and Week view.
Clicking a pool card also selects that job in the dropdown form. Values are
retained while switching scheduling modes, and the mode stays selected when
navigating weeks. A reload starts with scheduling tools collapsed and selection
mode ready. The date initially follows the selected schedule day when opening
the tools. Scheduled visits and resource assignments retain drag support.

**View** defaults to Auto: below **md** (768px), show one selected day with
seven day-navigation buttons and job counts; at medium and larger sizes, show
the seven-day board. Explicit **Day** and **Week** options work at every size.
The week board scrolls horizontally when needed, not the document. **sm**
(640px) aligns day controls in one row, **lg** (1024px) aligns header actions,
and **xl** (1280px) adds spacing. The application header/footer remain visible;
the planner scrolls within the content area. These controls also apply to a
project's embedded Schedule section.

**Availability** opens the existing shared dialog style with Employees/Equipment
views and the same weekly capacity table. Selecting a date also selects the
schedule day. Daily/weekly resource-overage warnings remain visible on the
planner even with availability closed. Missing recurrence details, load failures,
and unavailable capacity are never hidden inside a disclosure.
Long instructions are grouped under **How scheduling works**; the immediate-save
notice remains on the main surface. Refresh behavior and calculations are unchanged.

### Task assignment modal

Apply [database/field-operations-assignment-hours.sql](database/field-operations-assignment-hours.sql)
after the planning schema (rollback:
[database/field-operations-assignment-hours-rollback.sql](database/field-operations-assignment-hours-rollback.sql)).
It adds `HoursMode`/`CustomHours` to task assignments and `EstimateLineItemID`
to tasks. Existing assignments keep their task's planned hours (shown as Custom).

Visit cards summarize assigned labor-hours and unique crew/equipment counts.
**Tasks** expands each task's hours left, full assignee names, and whole-job
estimated labor; task-over-estimate warnings stay visible when collapsed.
**Move / remove visit** groups occurrence management, including a date selector
for touch/keyboard users; moving or scheduling selects the destination day.
The **Assign crew & equipment**
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
Upcoming, Active, and Completed; estimates support All, Draft, Won, and Lost.
Each estimate filter matches that exact status.
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
