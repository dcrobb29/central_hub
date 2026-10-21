# Security and review follow-up

This tracker records the October 20, 2026 browser review. The review used synthetic data and limited, sequential checks; it is not a security certification. Priority labels below are the report's product-impact labels, not CVSS ratings.

## Current change set

The redirect/header changes and the sales API authorization fix described below were committed and deployed to the shared Azure test instance. The catalog and scope-template page guards in this follow-up are a subsequent fix and require a subsequent deployment.

- `app/lib/safe-redirect.ts`: shared canonical same-origin redirect validator.
- `app/login/login-client.tsx`: validates the destination immediately before post-login navigation.
- `middleware.ts`: applies the same validation to the already-authenticated login path; adds page-only framing and CSP headers. API responses are excluded so embedded same-origin file/PDF previews are not denied framing.
- `next.config.ts`: configures `X-Content-Type-Options`, `Referrer-Policy`, production-only HSTS without `includeSubDomains`, and disables the Next.js technology header.
- `tests/security/safe-redirect.test.mjs`: regression tests for safe internal paths and redirect bypass variants.
- `SECURITY-FOLLOW-UP.md`: this findings, verification, and rollback record.

The CSP is intentionally limited to `base-uri 'self'`, `object-src 'none'`, and `frame-ancestors 'none'`. It does not define `script-src` and does not by itself prevent XSS.

## Local validation completed

- Redirect regression tests: 4 passed.
- Targeted ESLint: no errors; one pre-existing `<img>` optimization warning in `app/login/login-client.tsx`.
- `npm run build`: passed.
- After the sales API authorization change, targeted ESLint and `npm run build` both passed.
- Local production-server smoke check: login page returned the configured headers; an anonymous PDF API request was not given the page framing policy.

These local checks alone do not confirm the Azure deployment or authenticated user workflows.

## Azure test-instance verification

The application owner reported the following checks passing on the shared Azure test instance after deployment:

- The `/login` response had the expected CSP directives, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security: max-age=31536000`; `X-Powered-By` was absent.
- Signing in with an internal `/files` return path stayed within the app and opened Files.
- Signing in with the encoded tab payload `/login?redirect=%2F%09%2Fexample.invalid%2Fqa` stayed within the app and opened Home.
- The estimate PDF preview and synthetic PDF and text file previews in Files displayed inside the app.
- The owner reports the session cookie showed `HttpOnly`, `Secure`, `SameSite=Lax`, and an expiry about seven days after sign-in.
- After normal sign-out, opening `/projects` redirected to sign-in without showing project details.
- The owner reports the configured Read-only role had read/view permissions, including project read access. Signed in with that role, a known synthetic project was viewable and project edit/save controls were hidden or disabled.
- With the Read-only account, five deliberately invalid sales write requests (material create, material price create, scope-template create, update with ID `0`, and delete with ID `0`) each returned `403`. The requests were rejected before body/ID validation and could not create, update, or delete data.
- These API write tests passed on the deployed prior version; they do not verify the catalog or scope-template page guards added in this subsequent change, which require a subsequent deployment.

These are owner-reported browser checks on the test instance. They do not establish tenant isolation, lower-role authorization, session or CSRF protections, upload safety, or production deployment behavior.

Before this deployment, the owner reports running a separate Company A/Company B test and concluding that the two companies' data was isolated. The exact routes, actions, roles, and test method were not recorded here. The current deployment did not change tenant-scoping logic.

## Test deployment and rollback

The redirect/header changes and sales API authorization fix have been pushed to the branch that updates the shared test instance. If a committed change causes a regression, use a **new revert commit** for that change commit and push the revert to the same deployment branch. A revert preserves shared Git history and is safer than resetting or force-pushing. Wait for Azure to complete the revert deployment, then verify the app is back to its prior behavior. If Azure's deployment fails before publishing, do not assume the live instance rolled back; check its deployment status and currently running version.

If the tracker and source are committed together, reverting that commit also removes this tracker from the current checkout, although its contents remain available in Git history. Keep the commit ID and this file available until the deployment has been accepted or rolled back. The exact Azure rollback mechanism cannot be specified from this repository because no Azure deployment configuration is checked in.

## Security actions started

| Item | Report finding | Status and verification limit |
| --- | --- | --- |
| F12 | Login return-address validation can accept a control-character value that normalizes to an external URL. | Fixed in the login client and middleware with canonical same-origin URL validation. Automated regression cases pass for the reported encoded-tab payload, protocol-relative/external URLs, backslashes, and valid internal paths. The owner reports that internal `/files` redirect and the encoded-tab payload both behaved safely on the Azure test instance. |
| F05 | Sampled login responses lacked browser security headers. | Page responses receive CSP `base-uri`, `object-src`, and `frame-ancestors` directives plus framing denial. API responses are excluded from framing denial so same-origin file/PDF previews can continue working. MIME sniffing protection and an explicit referrer policy are configured globally. HSTS is enabled in production configuration without `includeSubDomains`; technology disclosure is disabled. The owner reports the expected headers on the Azure test login response and successful estimate PDF and Files PDF/text previews. This intentionally scoped CSP does not provide a `script-src` policy or by itself prevent XSS. |
| SR-01 | Sales material, price-history, and scope-template APIs did not enforce role permissions. | Fixed: APIs require `sales.read` for reads and `sales.write` for mutations; the catalog and scope-template pages now also require `sales.read` before fetching shared material/template data. Catalog data remains global as currently modeled; this change does not add tenant-specific catalog storage. API write tests passed on the deployed prior version; the page guards require this subsequent deployment. Read-denial behavior still depends on which roles are assigned `sales.read`; verify with an explicitly authorized role that lacks it before claiming unauthorized reads are rejected. |

## Security items requiring authorized verification

The report did not establish these as vulnerabilities; they remain unverified and should be tested before using real multi-organization or sensitive records:

- **Tenant isolation and role authorization:** The owner reports a prior Company A/Company B check found their data isolated. That check predates this deployment and its routes, actions, and method are not documented here. The owner also reports the Read-only UI hid or disabled project edits. Five denied API writes support the SR-01 fix for those mutation routes, but do not establish authorization for all endpoints or data reads. Verify GET denial with a role explicitly lacking `sales.read`, and continue endpoint-by-endpoint review before production use.
- **SR-01 post-deployment check completed:** With the Read-only account, invalid requests to `POST /api/sales/materials` with body `{}`, `POST /api/sales/materials/0/prices` with body `{}`, `POST /api/sales/scope-templates` with body `{}`, `PUT /api/sales/scope-templates/0` with body `{}`, and `DELETE /api/sales/scope-templates/0` each returned `403` before payload or ID validation. No valid data or IDs were sent.
- **CSRF:** Verify protections for state-changing requests. Cookie `SameSite=Lax` is a useful browser control but does not replace reviewing the app's request-origin validation and state-changing endpoints.
- **Session token revocation:** Source review shows the session is a signed, stateless token with a seven-day expiration. Logout expires the browser cookie, and requests check that the user and organization membership remain active, but there is no per-token server-side revocation shown. The browser sign-out test passed; it does not invalidate a separately copied token. If a token were exposed, it could remain usable until expiration unless the user/membership is disabled or the signing secret is changed. Decide whether this exposure window is acceptable; a server-side session record, token version, or other revocation mechanism would require an intentional design and migration.
- **File handling:** In a disposable environment, verify upload extension, MIME and signature validation; size limits; tenant-bound storage authorization; safe download headers; and malware scanning. No upload-abuse testing was performed.
- **Application and deployment controls:** Review dependency updates, secrets handling, parameterized database operations, authorization middleware, and security-relevant server logging. The browser review did not include source, database, dependency, or Azure configuration review.
- **Production deployment, if separate from this test instance:** Confirm headers at the public edge and exercise sign-in, navigation, exports, and file workflows in a browser. The test-instance checks do not establish production deployment behavior; a proxy/CDN can change or remove application response headers.

Do not perform cross-organization or destructive checks against live customer data. Use authorized test accounts and an isolated environment.

## Remaining report findings

| ID | Priority | Concern | Suggested follow-up |
| --- | --- | --- | --- |
| F10 | High | Supplier bill edits failed on two synthetic bills; the original value remained after reload. | Trace the update operation, permissions, transaction, and error handling. Test amount, vendor, date, project, persistence, and cost reconciliation with authorized finance roles. |
| F11 | Medium | Supplier company names are limited to 10 characters in the bill form. | Set a realistic shared limit across UI, API validation, and database storage. |
| F02 | Medium | Estimate PDF date differed from the local business date shown for invoicing. | Define the organization timezone and apply a single date policy; test midnight and daylight-saving boundaries. |
| F03 | Medium | An invoice due date conflicted with its printed “Net 30” terms. | Agree whether terms determine the due date or allow an explicit exception; keep the stored invoice and PDF consistent. |
| F13 | Medium | Recurring estimate PDF omitted the per-occurrence basis, frequency, and service dates. | Clearly print the per-occurrence price basis, recurrence, and service period; test supported frequencies and date boundaries. |
| F09 | Medium | Keyboard focus escaped open modal dialogs. | Keep focus within dialogs, make background controls unavailable while open, and restore focus on close. |
| F04 | Medium | Some functional icon buttons lacked accessible names. | Name icon actions and expose expanded state for expandable controls. |
| F01 | Medium | Appearance preferences repeatedly failed to load, leaving a disabled control and persistent error. | Trace preference storage/authorization, provide a usable default and retry, and log actionable diagnostics. |
| F06 | Low | Refreshing a folder or open bill returned to the parent/list view. | Encode the selected resource in the URL and support browser Back/Forward. |
| F08 | Low | Email-template help lists `{amount}` while the default body uses `{invoiceAmount}`. | Align documented and rendered tokens and add a send-free preview. Actual delivery substitution was not tested. |
| F07 | Low | Sampled routes retained the default “Create Next App” document title. | Set product and route-specific titles. |

## Notes and scope

- The accepted negative supplier bill may represent a supplier credit; confirm the business rule instead of treating acceptance alone as a defect.
- The scheduling-availability observation was not reproduced in later checks and was not counted as a confirmed defect.
- The report also suggested unsaved-work warnings and load testing. These are product/resilience follow-ups, not demonstrated security vulnerabilities; load testing needs separate owner approval and agreed limits.
- Synthetic records and evidence from the original review were left in the application for developer review. Confirm cleanup needs before deleting them.
