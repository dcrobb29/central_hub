"use client";

import { useState, type ReactNode } from "react";
import { FilterButton, FiltersDialog } from "./workspace-ui";

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
      <FilterButton active={active} onClick={() => setOpen(true)} />
    </div>
    {open && <FiltersDialog id={id} label={label} onClose={() => setOpen(false)} onReset={onReset} className="listFiltersDialog"
      hint="Changes apply immediately to the current list. Amount sorting uses the quoted total.">
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
    </FiltersDialog>}
  </>;
}
