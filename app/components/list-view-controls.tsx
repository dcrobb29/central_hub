"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import Modal from "./modal";

export default function ListViewControls({ id, label, statuses, status, onStatusChange, sort, onSortChange, active, onReset, sortOptions, children }: {
  id: string;
  label: string;
  statuses: { value: string; label: string; count: number }[];
  status: string;
  onStatusChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  active: boolean;
  onReset: () => void;
  sortOptions?: { value: string; label: string }[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="listViewControls">
      <div className="listStatusToggle" role="group" aria-label={`${label} status filter`}>
        {statuses.map((option) => <button key={option.value} type="button"
          aria-pressed={status === option.value} onClick={() => onStatusChange(option.value)}>
          {option.label} <span>({option.count})</span>
        </button>)}
      </div>
      <button type="button" className="listFilterButton" onClick={() => setOpen(true)} aria-haspopup="dialog"
        aria-label="Filters & sort" title={active ? "Filters or sorting active" : "Filters & sort"}>
        <SlidersHorizontal size={14} aria-hidden="true" /> Filters &amp; sort{active && <span aria-label="Filters or sorting active" className="listFilterIndicator" />}
      </button>
    </div>
    {open && <Modal titleId={`${id}-filters-title`} title="Filters & sort" eyebrow={label}
      onClose={() => setOpen(false)} closeLabel="Close filters and sort" className="listFiltersDialog">
      <label className="financeImportField">Status
        <select autoFocus value={status} onChange={(event) => onStatusChange(event.target.value)}>
          {statuses.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
        </select>
      </label>
      <label className="financeImportField">Sort by
        <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="">Default order</option>
          {(sortOptions ?? [
            { value: "name-asc", label: "Name: A to Z" },
            { value: "name-desc", label: "Name: Z to A" },
            { value: "amount-asc", label: "Amount: low to high" },
            { value: "amount-desc", label: "Amount: high to low" },
          ]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          {sort === "custom" && <option value="custom" disabled>Current table-column sort</option>}
        </select>
      </label>
      {children}
      <p className="projectCostHint">Changes apply immediately to the current list. Amount sorting uses the quoted total.</p>
      <div className="financeImportActions">
        <button type="button" className="financeImportCancel" onClick={onReset}>Reset filters &amp; sort</button>
        <button type="button" className="financeImportSubmit" onClick={() => setOpen(false)}>Done</button>
      </div>
    </Modal>}
  </>;
}
