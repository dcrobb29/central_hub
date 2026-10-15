"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Modal from "@/app/components/modal";
import TablePagination from "@/app/components/table-pagination";
import type { TableColumn, useFilterableTable } from "@/app/lib/use-filterable-table";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./finance-workspace.module.css";

export function FinanceHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <>
    <header className={styles.heading}>
      <div><p className="salesEyebrow">FINANCES</p><h1>{title}</h1></div>
      {action}
    </header>
    <p className={recordStyles.intro}>{description}</p>
  </>;
}

export default function FinanceCollection<T>({ title, description, action, columns, controls, count, itemLabel, cards, children }: {
  title: string;
  description: string;
  action?: ReactNode;
  columns: TableColumn<T>[];
  controls: ReturnType<typeof useFilterableTable<T>>;
  count: number;
  itemLabel: string;
  cards: ReactNode;
  children: ReactNode;
}) {
  const [view, setView] = useState("cards");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { search, setSearch, columnFilters, setColumnFilters, sort, setSort, clearFilters, hasActiveFilters } = controls;
  return <>
    <FinanceHeading title={title} description={description} action={action} />
    <div className={styles.toolbar}>
      <div className="listStatusToggle" role="group" aria-label={`${title} display`}>
        <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>Overview</button>
        <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Detailed table</button>
      </div>
      <button type="button" className="listFilterButton" aria-label="Filters & sort" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
        Filters &amp; sort{hasActiveFilters && <span className="listFilterIndicator" aria-label="Filters or sorting active" />}
      </button>
    </div>
    <div className="invoiceTableTools">
      <label className="invoiceSearchLabel">Search {itemLabel}
        <input type="search" className="invoiceSearchInput" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all details" />
      </label>
      <span className="invoiceResultCount" aria-live="polite">{controls.visibleRows.length} of {count} {itemLabel}</span>
      {hasActiveFilters && <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>}
    </div>
    {view === "cards" ? <div className={recordStyles.list}>
      {controls.visibleRows.length === 0 ? <p className={recordStyles.empty}>{count === 0 ? `No ${itemLabel} yet.` : `No ${itemLabel} match these filters.`}</p> : cards}
    </div> : children}
    <TablePagination currentPage={controls.currentPage} totalPages={controls.totalPages} totalItems={controls.visibleRows.length}
      pageSize={controls.pageSize} onPageChange={controls.setCurrentPage} onPageSizeChange={controls.setPageSize}
      pageSizeOptions={[25, 50, 100]} itemLabel={itemLabel} />
    {filtersOpen && <Modal titleId="financeFiltersTitle" title="Filters & sort" eyebrow={title} onClose={() => setFiltersOpen(false)} closeLabel="Close filters and sort">
      <label className="financeImportField">Sort by
        <select value={sort ? String(sort.key) : ""} onChange={(event) => {
          const column = columns.find((item) => String(item.key) === event.target.value);
          setSort(column ? { key: column.key, direction: sort?.direction ?? "asc" } : null);
        }}>
          <option value="">Default order</option>
          {columns.map((column) => <option value={String(column.key)} key={String(column.key)}>{column.label}</option>)}
        </select>
      </label>
      <label className="financeImportField">Sort direction
        <select value={sort?.direction ?? "asc"} disabled={!sort} onChange={(event) => {
          if (sort) setSort({ ...sort, direction: event.target.value === "desc" ? "desc" : "asc" });
        }}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
      </label>
      <details className="projectDisclosure">
        <summary>Filter individual fields</summary>
        <div className={styles.filters}>{columns.map((column) => <label key={String(column.key)} className="financeImportField">{column.label}
          <input value={columnFilters[column.key] ?? ""} onChange={(event) => setColumnFilters((current) => ({ ...current, [column.key]: event.target.value }))} />
        </label>)}</div>
      </details>
      <p className="projectCostHint">Changes apply immediately to both views. Search includes every table field, even when not shown on overview cards.</p>
      <div className="financeImportActions">
        <button type="button" className="financeImportCancel" onClick={clearFilters}>Reset filters &amp; sort</button>
        <button type="button" className="financeImportSubmit" onClick={() => setFiltersOpen(false)}>Done</button>
      </div>
    </Modal>}
  </>;
}

export function FinanceRecord({ title, collection, onBack, actions, overview, details }: {
  title: string;
  collection: string;
  onBack: () => void;
  actions?: ReactNode;
  overview: ReactNode;
  details: ReactNode;
}) {
  const [tab, setTab] = useState("overview");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className={styles.record}>
    <nav className="projectHubBreadcrumb" aria-label="Breadcrumb">
      <button type="button" className="projectWorkspaceLink" onClick={onBack}>Back to {collection}</button>
      <span> / {title}</span>
    </nav>
    <header className={styles.heading}><div><p className="salesEyebrow">FINANCE WORKSPACE</p><h1 ref={heading} tabIndex={-1}>{title}</h1></div><div className={styles.actions}>{actions}</div></header>
    <nav className="projectHubTabs" aria-label={`${title} sections`}>
      <button type="button" aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
      <button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")}>All details</button>
    </nav>
    <section className={styles.section}><h2>{tab === "overview" ? "Overview" : "All details"}</h2>{tab === "overview" ? overview : details}</section>
  </div>;
}

export function FinanceFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className={styles.facts}>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value === null || item.value === undefined || item.value === "" ? "Not provided" : item.value}</dd></div>)}</dl>;
}
