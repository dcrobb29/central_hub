"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FileDown } from "lucide-react";
import type { EstimateDetails, LineType } from "@/app/lib/estimates";
import ContractChangesPanel from "@/app/components/contract-changes-panel";
import { DocumentNotes } from "@/app/components/document-notes";
import styles from "./estimate-workspace.module.css";
import EstimateStatusSelector from "./estimate-status-selector";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const tabs = [["overview", "Overview"], ["scope", "Scope & Pricing"], ["alternates", "Alternates"]] as const;

export default function EstimateRecord({ estimate, selectedTab, canEdit, loadingEdit, onEdit, onPdf, onWin, onDelete }: {
  estimate: EstimateDetails;
  selectedTab?: string;
  canEdit: boolean;
  loadingEdit: boolean;
  onEdit: () => void;
  onPdf: () => void;
  onWin: () => void;
  onDelete: () => void;
}) {
  const tab = tabs.some(([key]) => key === selectedTab) ? selectedTab : "overview";
  const href = (key: string) => `/sales/${estimate.estimateId}?tab=${key}`;
  return <div className={`projectHub ${styles.record}`}>
    <nav className="projectHubBreadcrumb" aria-label="Breadcrumb">
      <Link href="/sales">Sales &amp; Estimates</Link><span> / {estimate.estimateName}</span>
    </nav>
    <header className="projectHubHeader">
      <div><p className="salesEyebrow">ESTIMATE WORKSPACE / EST-{estimate.estimateId}</p><h1>{estimate.estimateName}</h1></div>
      <EstimateStatusSelector estimate={estimate} canEdit={canEdit} onWin={onWin} />
    </header>
    <div className={styles.recordActions} aria-label="Estimate actions">
      {canEdit && estimate.status !== "Won" && <button type="button" className="financeImportButton" disabled={loadingEdit} onClick={onEdit}>
        {loadingEdit ? "Loading..." : "Edit estimate"}
      </button>}
      <button type="button" className="projectWorkspaceLink" onClick={onPdf}><FileDown size={24} aria-hidden="true" /></button>
      {estimate.projectId && <Link className="projectWorkspaceLink" href={`/projects/${estimate.projectId}`}>Open project</Link>}
      {canEdit && estimate.status !== "Won" && <button type="button" className="financeImportButton" onClick={onDelete}>Delete</button>}
      {/* // && <details className={styles.moreActions}>
      //   <summary>More actions</summary>
      //   <button type="button" className="estimateDangerAction" onClick={onDelete}>Delete estimate</button>
      // </details>} */}

    </div>
    <nav className="projectHubTabs" aria-label="Estimate sections">
      {tabs.map(([key, label]) => <Link key={key} href={href(key)} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    {tab === "overview" ? <section className="projectHubSection">
      <h2>Estimate overview</h2>
      <dl className="projectHubFacts">
        <div><dt>Customer</dt><dd>{estimate.customerName || "Unassigned"}{estimate.customerAddress && <span style={{ display: "block", whiteSpace: "pre-line" }}>{estimate.customerAddress}</span>}</dd></div>
        <div><dt>{estimate.engagementType === "Service" ? "Quoted value per occurrence" : "Base estimate total"}</dt><dd>{money(estimate.quotedTotal)}</dd></div>
        <div><dt>Work type</dt><dd>{estimate.engagementType === "Service" ? "Recurring service" : "One-time project"}</dd></div>
        <div><dt>Line items</dt><dd>{estimate.lineCount}</dd></div>
        {estimate.engagementType === "Service" && <>
          <div><dt>Frequency</dt><dd>{estimate.recurrenceFrequency || "Not specified"}</dd></div>
          <div><dt>Start date</dt><dd>{estimate.expectedStartDate || "Not specified"}</dd></div>
          <div><dt>End date</dt><dd>{estimate.expectedEndDate || "Ongoing"}</dd></div>
        </>}
      </dl>
      <p className="projectCostHint">Alternates are priced separately from the base estimate. Marking an estimate won carries its accepted scope into Projects &amp; Jobs.</p>
      <DocumentNotes internalNotes={estimate.internalNotes} customerNotes={estimate.customerNotes} />

    </section> : tab === "scope" ? <section className="projectHubSection">
      <h2>Scope &amp; pricing</h2>
      <EstimateScope key={`${estimate.estimateId}:${estimate.revisionId}`} details={estimate} />
    </section> : <ContractChangesPanel key={estimate.estimateId} context={{ estimateId: estimate.estimateId }} />}
  </div>;
}

function EstimateScope({ details }: { details: EstimateDetails }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const lineItem = (line: EstimateDetails["lines"][number]) => <li key={line.estimateLineItemId}>
    <span>{line.description}</span>
    <span>{line.quantity} {line.unitName}</span>
    <span>{money(line.unitCost)} / unit</span>
    <span>Freight {money(line.freightAmount)} (internal)</span>
    {details.markupMode === "perLine" && <span>{line.lineMarkupPercent}% markup</span>}
    <span className="estimateLineTypeBadge">{line.lineType}</span>
  </li>;
  const groupSection = (key: string, title: string, lines: EstimateDetails["lines"]) => <div key={key} className="estimateScopeGroup">
    <button type="button" className="estimateScopeToggle" aria-expanded={!collapsedGroups[key]}
      onClick={() => setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }))}>
      <span className="estimateScopeToggleIcon" aria-hidden="true">{collapsedGroups[key] ? "▸" : "▾"}</span>
      <h4>{title}</h4><span className="estimateLineGroupCount">({lines.length} {lines.length === 1 ? "line" : "lines"})</span>
    </button>
    {!collapsedGroups[key] && <ol>{lines.map(lineItem)}</ol>}
  </div>;
  let content: ReactNode;
  if (details.groupingMode === "Scope") {
    const ungrouped = details.lines.filter((line) => line.estimateScopeOfWorkId === null);
    content = <>
      {[...details.scopes].sort((a, b) => a.sortOrder - b.sortOrder).map((scope) => {
        const lines = details.lines.filter((line) => line.estimateScopeOfWorkId === scope.estimateScopeOfWorkId);
        return lines.length ? groupSection(`scope-${scope.estimateScopeOfWorkId}`, scope.scopeName, lines) : null;
      })}
      {ungrouped.length > 0 && groupSection("ungrouped", "Ungrouped", ungrouped)}
    </>;
  } else if (details.groupingMode === "Type") {
    content = (["Material", "Labor", "Equipment"] satisfies LineType[]).map((type) => {
      const lines = details.lines.filter((line) => line.lineType === type);
      return lines.length ? groupSection(type, type, lines) : null;
    });
  } else {
    content = <ol>{details.lines.map(lineItem)}</ol>;
  }
  return <section className={`estimateScope estimateBaseBid ${styles.scope}`} aria-label="Base bid scope">
    <h3>Base bid <span>{money(details.quotedTotal)} (alternates excluded)</span></h3>
    <div className="estimateScopeSummary">
      <span>Markup: {details.markupMode === "perLine" ? "Per line" : `${details.estimateMarkupPercent}% on estimate`}</span>
      <span>Tax: {details.taxPercent}% of cost (internal only)</span>
      <span>Round to: {details.roundingIncrement ? money(details.roundingIncrement) : "No rounding"}</span>
      <span>Grouping: {details.groupingMode === "None" ? "None" : details.groupingMode === "Scope" ? "By scope of work" : "By line type"}</span>
    </div>
    {content}
  </section>;
}
