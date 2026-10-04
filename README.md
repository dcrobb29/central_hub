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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
