"use client";

import { useEffect, useRef, useState } from "react";

export type TableColumn<T> = {
  key: keyof T;
  label: string;
};

export type SortState<T> = { key: keyof T; direction: "asc" | "desc" } | null;
export type ColumnFilters<T> = Partial<Record<keyof T, string>>;

type FilterableTableOptions<T> = {
  searchableValue: (key: keyof T, value: T[keyof T]) => string;
  compare: (left: T, right: T, key: keyof T) => number;
};

/**
 * Shared search/filter/sort behavior for data tables (used by both the invoice
 * and estimate tables). Keeping this logic in one place means every table that
 * adopts it behaves identically and stays in sync when the behavior changes.
 */
export function useFilterableTable<T>(rows: T[], columns: TableColumn<T>[], { searchableValue, compare }: FilterableTableOptions<T>) {
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<T>>({});
  const [sort, setSort] = useState<SortState<T>>(null);
  const [openFilter, setOpenFilter] = useState<keyof T | null>(null);
  const filterControlRoot = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openFilter) return;
    function dismissFilter(event: PointerEvent) {
      if (event.target instanceof Node && !filterControlRoot.current?.contains(event.target)) {
        setOpenFilter(null);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenFilter(null);
    }
    document.addEventListener("pointerdown", dismissFilter);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissFilter);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openFilter]);

  const filteredRows = rows.filter((row) => {
    if (search) {
      const matchesSearch = columns.some((column) =>
        searchableValue(column.key, row[column.key]).includes(search.trim().toLocaleLowerCase())
      );
      if (!matchesSearch) return false;
    }
    return columns.every((column) => {
      const filter = columnFilters[column.key]?.trim().toLocaleLowerCase();
      return !filter || searchableValue(column.key, row[column.key]).includes(filter);
    });
  });

  const visibleRows = sort
    ? [...filteredRows].sort((left, right) => {
        const leftValue = left[sort.key];
        const rightValue = right[sort.key];
        const leftMissing = leftValue == null || leftValue === "";
        const rightMissing = rightValue == null || rightValue === "";
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        const comparison = compare(left, right, sort.key);
        return sort.direction === "asc" ? comparison : -comparison;
      })
    : filteredRows;

  function toggleSort(key: keyof T) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  function clearFilters() {
    setSearch("");
    setColumnFilters({});
    setSort(null);
    setOpenFilter(null);
  }

  const hasActiveFilters = Boolean(search) || Object.values(columnFilters).some(Boolean) || Boolean(sort);

  return {
    search,
    setSearch,
    columnFilters,
    setColumnFilters,
    sort,
    toggleSort,
    openFilter,
    setOpenFilter,
    filterControlRoot,
    visibleRows,
    clearFilters,
    hasActiveFilters,
  };
}
