"use client";

import Link from "next/link";

export default function ProjectError({ reset }: { reset: () => void }) {
  return <main className="body projectsBody">
    <h1>Unable to load this project section</h1>
    <p role="alert">Check the database connection and required migrations, then try again.</p>
    <button type="button" onClick={reset}>Try again</button>{" "}
    <Link href="/projects">Back to projects</Link>
  </main>;
}
