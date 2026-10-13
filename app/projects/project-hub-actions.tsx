"use client";

import { useState } from "react";
import ProjectBillingModal from "./project-billing-modal";

export default function ProjectHubActions({ projectId, projectName }: { projectId: number; projectName: string }) {
  const [tab, setTab] = useState<"completion" | "invoice" | "history" | null>(null);
  return <div className="projectHubActions">
    <button type="button" onClick={() => setTab("completion")}>Completion &amp; billing</button>
    <button type="button" onClick={() => setTab("invoice")}>Issue invoice</button>
    {tab && <ProjectBillingModal projectId={projectId} projectName={projectName} initialTab={tab} onClose={() => setTab(null)} />}
  </div>;
}
