# Security and review follow-up

This tracker records the October 20, 2026 browser review. The review used synthetic data and limited, sequential checks; it is not a security certification. Priority labels below are the report's product-impact labels, not CVSS ratings.

## Current change set

The following changes are prepared for review and have not been committed or pushed:

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
- Local production-server smoke check: login page returned the configured headers; an anonymous PDF API request was not given the page framing policy.

These checks do not confirm headers at Azure's public edge or prove authenticated user workflows work in the Azure environment.

## Test deployment and rollback

Before deploying to the shared Azure test instance:

1. Confirm the instance is test-only, tell both testers about the planned change, and avoid real customer/payment data.
2. Commit the source and this tracker in a clearly identifiable commit. Record its commit ID before pushing.
3. Push only to the branch that updates the test instance, then confirm Azure reports a successful build/deployment before testing.
4. Perform the deployment checks in the “Security actions started” and “Security items requiring authorized verification” sections. Do not share credentials, cookies, or tokens.

If the change causes a regression after it is committed, use a **new revert commit** for the change commit and push that revert to the same test deployment branch. A revert preserves shared Git history and is safer than resetting or force-pushing. Wait for Azure to complete the revert deployment, then verify the app is back to its prior behavior. If Azure's deployment fails before publishing, do not assume the live instance rolled back; check its deployment status and currently running version.

If the tracker and source are committed together, reverting that commit also removes this tracker from the current checkout, although its contents remain available in Git history. Keep the commit ID and this file available until the deployment has been accepted or rolled back. The exact Azure rollback mechanism cannot be specified from this repository because no Azure deployment configuration is checked in.

## Security actions started

| Item | Report finding | Status and verification limit |
| --- | --- | --- |
| F12 | Login return-address validation can accept a control-character value that normalizes to an external URL. | Fixed in the login client and middleware with canonical same-origin URL validation. Automated regression cases cover the reported encoded-tab payload, protocol-relative/external URLs, backslashes, and valid internal paths. Verify the deployed login flow with a disposable account before relying on the fix. |
| F05 | Sampled login responses lacked browser security headers. | Page responses receive CSP `base-uri`, `object-src`, and `frame-ancestors` directives plus framing denial. API responses are excluded from framing denial so same-origin PDF/file previews can continue working. MIME sniffing protection and an explicit referrer policy are configured globally. HSTS is enabled in production configuration without `includeSubDomains`; technology disclosure is disabled. Verify the actual deployed response headers and application compatibility. This intentionally scoped CSP does not provide a `script-src` policy or by itself prevent XSS. |

## Security items requiring authorized verification

The report did not establish these as vulnerabilities; they remain unverified and should be tested before using real multi-organization or sensitive records:

- **Tenant isolation and role authorization:** Test reads, writes, and exports using two expressly authorized organizations and owner, finance, read-only, and field roles. Verify authorization on the server for every relevant route and API.
- **Sessions and CSRF:** Review cookie `Secure`, `HttpOnly`, and `SameSite` attributes; token expiry and rotation; server-side logout invalidation; and CSRF protection for state-changing requests. The normal sign-out check did not verify these deeper controls.
- **File handling:** In a disposable environment, verify upload extension, MIME and signature validation; size limits; tenant-bound storage authorization; safe download headers; and malware scanning. No upload-abuse testing was performed.
- **Application and deployment controls:** Review dependency updates, secrets handling, parameterized database operations, authorization middleware, and security-relevant server logging. The browser review did not include source, database, dependency, or Azure configuration review.
- **Production headers and CSP compatibility:** Confirm headers at the public deployment edge, then exercise sign-in, navigation, exports, and file workflows in a browser. A response configured by the application can still be changed or removed by a proxy/CDN.

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
