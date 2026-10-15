"use client";

import Link from "next/link";

export default function EstimateError({ reset }: { reset: () => void }) {
  return <main className="body salesBody">
    <h1>Unable to load this estimate</h1>
    <p role="alert">The estimate workspace could not be loaded. Try again or return to Sales &amp; Estimates.</p>
    <button type="button" onClick={reset}>Try again</button>
    <Link href="/sales">Back to estimates</Link>
  </main>;
}
