"use client";

import type { MouseEventHandler, ReactNode, Ref } from "react";
import { SlidersHorizontal } from "lucide-react";
import Modal from "./modal";
import styles from "./workspace-ui.module.css";

export function WorkspaceHeading({ title, eyebrow, actions, className = "", muted = false, headingRef, focusable = false }: {
  title: ReactNode; eyebrow: string; actions?: ReactNode; className?: string; muted?: boolean;
  headingRef?: Ref<HTMLHeadingElement>; focusable?: boolean;
}) {
  return <header className={`${styles.heading} ${className}`}>
    <div><p className={`${styles.eyebrow}${muted ? ` ${styles.mutedEyebrow}` : ""}`}>{eyebrow}</p>
      <h1 ref={headingRef} tabIndex={focusable ? -1 : undefined}>{title}</h1></div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}

export function SearchToolbar({ label, value, onChange, placeholder, count, onClear }: {
  label: string; value: string; onChange: (value: string) => void; placeholder: string; count?: ReactNode; onClear?: () => void;
}) {
  return <div className={`invoiceTableTools ${styles.search}`}>
    <label className="invoiceSearchLabel">{label}<input type="search" className="invoiceSearchInput" value={value}
      onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
    {count !== undefined && <span className="invoiceResultCount" aria-live="polite">{count}</span>}
    {onClear && <button type="button" className="invoiceClearButton" onClick={onClear}>Clear</button>}
  </div>;
}

export function FilterButton({ active, onClick }: { active: boolean; onClick: MouseEventHandler<HTMLButtonElement> }) {
  return <button type="button" className="listFilterButton" aria-label="Filters & sort" aria-haspopup="dialog" onClick={onClick}
    title={active ? "Filters or sorting active" : "Filters & sort"}>
    <SlidersHorizontal size={14} aria-hidden="true" />Filters &amp; sort
    {active && <span className="listFilterIndicator" aria-label="Filters or sorting active" />}
  </button>;
}

export function FiltersDialog({ id, label, onClose, onReset, children, hint, className }: {
  id: string; label: string; onClose: () => void; onReset: () => void; children: ReactNode; hint: string; className?: string;
}) {
  return <Modal titleId={`${id}-filters-title`} title="Filters & sort" eyebrow={label} onClose={onClose}
    closeLabel="Close filters and sort" className={className}>
    {children}
    <p className="projectCostHint">{hint}</p>
    <div className="financeImportActions">
      <button type="button" className="financeImportCancel" onClick={onReset}>Reset filters &amp; sort</button>
      <button type="button" className="financeImportSubmit" onClick={onClose}>Done</button>
    </div>
  </Modal>;
}

export function RecordTabs({ label, tabs, selected, onSelect }: {
  label: string; tabs: { value: string; label: string }[]; selected: string; onSelect: (value: string) => void;
}) {
  return <nav className="projectHubTabs" aria-label={label}>{tabs.map((tab) =>
    <button type="button" key={tab.value} aria-pressed={selected === tab.value} onClick={() => onSelect(tab.value)}>{tab.label}</button>)}</nav>;
}
