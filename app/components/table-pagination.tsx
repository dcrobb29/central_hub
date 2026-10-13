"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export type TablePaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
};

export default function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  itemLabel = "items",
}: TablePaginationProps) {
  if (totalItems === 0) return null;

  const startItem = pageSize <= 0 ? 1 : Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = pageSize <= 0 ? totalItems : Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="tablePagination" role="navigation" aria-label="Table pagination">
      <div className="tablePaginationSummary">
        Showing <strong>{startItem}–{endItem}</strong> of <strong>{totalItems}</strong> {itemLabel}
      </div>

      <div className="tablePaginationControls">
        <label className="tablePaginationPageSize">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const nextSize = Number(e.target.value);
              onPageSizeChange(nextSize);
              onPageChange(1);
            }}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={0}>All</option>
          </select>
        </label>

        {totalPages > 1 && (
          <div className="tablePaginationButtons">
            <button
              type="button"
              className="tablePaginationButton"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(1)}
              aria-label="First page"
              title="First page"
            >
              <ChevronsLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tablePaginationButton"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Previous page"
              title="Previous page"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>

            <span className="tablePaginationPageIndicator" aria-live="polite">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              className="tablePaginationButton"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Next page"
              title="Next page"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tablePaginationButton"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label="Last page"
              title="Last page"
            >
              <ChevronsRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
