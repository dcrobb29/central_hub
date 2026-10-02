"use client";

import { Filter } from "lucide-react";
import type { TableColumn } from "@/app/lib/use-filterable-table";

/**
 * Sortable + filterable <th> content shared by every table that uses
 * useFilterableTable. Renders a sort toggle button and a filter popover
 * with a per-column search input.
 */
export function FilterableTableHeaderCell<T>({
  column,
  idPrefix,
  alignPopoverRight,
  sortDirection,
  filterValue,
  isFilterOpen,
  onToggleSort,
  onToggleFilter,
  onFilterChange,
  onClearFilter,
}: {
  column: TableColumn<T>;
  idPrefix: string;
  alignPopoverRight: boolean;
  sortDirection: "asc" | "desc" | null;
  filterValue: string;
  isFilterOpen: boolean;
  onToggleSort: () => void;
  onToggleFilter: () => void;
  onFilterChange: (value: string) => void;
  onClearFilter: () => void;
}) {
  const filterId = `${idPrefix}-filter-${String(column.key)}`;
  return (
    <th aria-sort={sortDirection ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
      <div className="invoiceHeaderControls">
        <button type="button" className="invoiceSortButton" onClick={onToggleSort}>
          {column.label}
          <span aria-hidden="true">{sortDirection ? (sortDirection === "asc" ? " ↑" : " ↓") : " ↕"}</span>
        </button>
        <div className="invoiceFilterControl">
          <button
            type="button"
            className={`invoiceFilterButton${filterValue.trim() ? " invoiceFilterButtonActive" : ""}`}
            aria-label={`Filter ${column.label}`}
            aria-expanded={isFilterOpen}
            aria-controls={filterId}
            title={`Filter ${column.label}`}
            onClick={onToggleFilter}
          >
            <Filter size={14} aria-hidden="true" />
          </button>
          {isFilterOpen && (
            <div
              id={filterId}
              className={`invoiceFilterPopover${alignPopoverRight ? " invoiceFilterPopoverRight" : ""}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <label>
                Filter {column.label}
                <input
                  autoFocus
                  type="search"
                  value={filterValue}
                  onChange={(event) => onFilterChange(event.target.value)}
                  placeholder={`Match ${column.label.toLowerCase()}`}
                  className="invoicePopoverInput"
                />
              </label>
              {filterValue && (
                <button type="button" className="invoicePopoverClear" onClick={onClearFilter}>
                  Clear this filter
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </th>
  );
}
