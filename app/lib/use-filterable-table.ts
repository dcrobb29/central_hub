"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type TableColumn<T> = {
  key: keyof T;
  label: string;
};

export type SortState<T> = { key: keyof T; direction: "asc" | "desc" } | null;
export type ColumnFilters<T> = Partial<Record<keyof T, string>>;

export type FilterableTableOptions<T> = {
  searchableValue: (key: keyof T, value: T[keyof T]) => string;
  compare: (left: T, right: T, key: keyof T) => number;
  initialPageSize?: number;
};

/**
 * Shared search/filter/sort/pagination behavior for data tables.
 * Memoizes filtered and sorted rows to prevent unnecessary re-computations
 * and provides paginated row slices to keep DOM size small and rendering snappy.
 */
export function useFilterableTable<T>(
  rows: T[],
  columns: TableColumn<T>[],
  { searchableValue, compare, initialPageSize = 50 }: FilterableTableOptions<T>,
) {
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<T>>({});
  const [sort, setSort] = useState<SortState<T>>(null);
  const [openFilter, setOpenFilter] = useState<keyof T | null>(null);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);
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

  // Reset to page 1 whenever search, filters, or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, columnFilters, sort]);

  const filteredRows = useMemo(() => {
    const trimmedSearch = search.trim().toLocaleLowerCase();
    const activeFilterKeys = (Object.keys(columnFilters) as (keyof T)[]).filter((key) => {
      const val = columnFilters[key];
      return typeof val === "string" && val.trim().length > 0;
    });

    if (!trimmedSearch && activeFilterKeys.length === 0) {
      return rows;
    }

    return rows.filter((row) => {
      if (trimmedSearch) {
        const matchesSearch = columns.some((column) =>
          searchableValue(column.key, row[column.key]).includes(trimmedSearch),
        );
        if (!matchesSearch) return false;
      }
      return activeFilterKeys.every((key) => {
        const filter = (columnFilters[key] as string).trim().toLocaleLowerCase();
        return searchableValue(key, row[key]).includes(filter);
      });
    });
  }, [rows, search, columnFilters, columns, searchableValue]);

  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const leftValue = left[sort.key];
      const rightValue = right[sort.key];
      const leftMissing = leftValue == null || leftValue === "";
      const rightMissing = rightValue == null || rightValue === "";
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      const comparison = compare(left, right, sort.key);
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sort, compare]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(visibleRows.length / pageSize)) : 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    if (pageSize <= 0) return visibleRows;
    const startIndex = (safePage - 1) * pageSize;
    return visibleRows.slice(startIndex, startIndex + pageSize);
  }, [visibleRows, safePage, pageSize]);

  function toggleSort(key: keyof T) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  function clearFilters() {
    setSearch("");
    setColumnFilters({});
    setSort(null);
    setOpenFilter(null);
    setCurrentPage(1);
  }

  const hasActiveFilters = Boolean(search) || Object.values(columnFilters).some(Boolean) || Boolean(sort);

  return {
    search,
    setSearch,
    columnFilters,
    setColumnFilters,
    sort,
    setSort,
    toggleSort,
    openFilter,
    setOpenFilter,
    filterControlRoot,
    visibleRows,
    paginatedRows,
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    clearFilters,
    hasActiveFilters,
  };
}
