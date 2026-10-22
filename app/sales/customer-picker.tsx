"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Modal from "@/app/components/modal";
import { CUSTOMER_FIELD_GROUPS, EMPTY_CUSTOMER, type CustomerDraft } from "@/app/lib/customer-fields";
import type { CustomerSearchResult } from "@/app/lib/customers";
import styles from "./customer-picker.module.css";

export type PickedCustomer = { customerId: number | null; name: string; address: string | null };

const SEARCH_DELAY_MS = 250;

export default function CustomerPicker({ value, onChange, canCreate, disabled = false }: {
  value: PickedCustomer;
  onChange: (customer: PickedCustomer) => void;
  canCreate: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [similar, setSimilar] = useState<CustomerSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const hasCustomer = value.customerId !== null;
  const options: ({ kind: "customer"; customer: CustomerSearchResult } | { kind: "create" })[] = [
    ...results.map((customer) => ({ kind: "customer" as const, customer })),
    ...(canCreate ? [{ kind: "create" as const }] : []),
  ];

  useEffect(() => {
    if (!open || hasCustomer) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/sales/customers?q=${encodeURIComponent(text.trim())}`, { signal: controller.signal });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? "Unable to search customers.");
        setResults(result.customers as CustomerSearchResult[]);
        setActiveIndex(0);
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchError(error instanceof Error ? error.message : "Unable to search customers.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text, open, hasCustomer]);

  function choose(customer: CustomerSearchResult) {
    onChange({ customerId: customer.customerId, name: customer.displayName, address: customer.address });
    setText("");
    setOpen(false);
  }

  function openCreate() {
    const typed = text.trim();
    setDraft({ ...EMPTY_CUSTOMER, firstName: typed });
    setSimilar([]);
    setCreateError(null);
    setOpen(false);
  }

  function closeCreate() {
    if (saving) return;
    setDraft(null);
    setSimilar([]);
    inputRef.current?.focus();
  }

  function activate(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === "customer") choose(option.customer);
    else openCreate();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      activate(activeIndex);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The estimate form is an ancestor in the React tree; its submit handler must not run.
    event.stopPropagation();
    void createCustomer(false);
  }

  async function createCustomer(confirmSimilar: boolean) {
    if (!draft) return;
    setSaving(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/sales/customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, confirmSimilar }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 409 && Array.isArray(result?.similar)) {
        setSimilar(result.similar as CustomerSearchResult[]);
        return;
      }
      if (!response.ok) throw new Error(result?.error ?? "Unable to save customer.");
      setDraft(null);
      setSimilar([]);
      choose(result.customer as CustomerSearchResult);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  }

  const activeId = open && options[activeIndex] ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className={styles.picker}>
      {hasCustomer ? (
        <div className={styles.selected}>
          <div>
            <strong>{value.name}</strong>
            {value.address && <span className={styles.address}>{value.address}</span>}
          </div>
          {!disabled && <button type="button" className="estimateTextAction" onClick={() => { onChange({ customerId: null, name: "", address: null }); setTimeout(() => inputRef.current?.focus(), 0); }}>Change</button>}
        </div>
      ) : (
        <>
          {value.name && <p className={styles.notice} role="status">
            &ldquo;{value.name}&rdquo; is not linked to a customer record. Search to choose a customer; leaving this unchanged keeps the current name.
          </p>}
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Customer"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            placeholder="Search customers by company or name"
            value={text}
            disabled={disabled}
            maxLength={100}
            onChange={(event) => { setText(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          {open && (
            <ul id={listId} role="listbox" aria-label="Matching customers" className={styles.list} onMouseDown={(event) => event.preventDefault()}>
              {loading && <li className={styles.status} role="presentation">Searching&hellip;</li>}
              {searchError && <li className={styles.status} role="alert">{searchError}</li>}
              {!loading && !searchError && results.length === 0 && <li className={styles.status} role="presentation">No matching customers.</li>}
              {options.map((option, index) => (
                <li
                  key={option.kind === "customer" ? option.customer.customerId : "create"}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`${styles.option} ${index === activeIndex ? styles.active : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => activate(index)}
                >
                  {option.kind === "customer" ? (
                    <>
                      <strong>{option.customer.displayName}</strong>
                      {option.customer.displayName !== option.customer.contactName && option.customer.contactName &&
                        <span className={styles.address}>{option.customer.contactName}</span>}
                      {option.customer.address && <span className={styles.address}>{option.customer.address.replace(/\n/g, ", ")}</span>}
                    </>
                  ) : (
                    <strong>+ Create new customer{text.trim() ? ` "${text.trim()}"` : ""}</strong>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {draft && createPortal(
        <Modal titleId="estimateNewCustomerTitle" title="New customer" eyebrow="SALES & ESTIMATES" onClose={closeCreate} closeDisabled={saving} closeLabel="Close new customer form">
          <form onSubmit={submitCreate}>
            <p className="financeImportHint">Contact name is required. Estimates use the company name when there is one, otherwise the contact name, with the billing address beneath it.</p>
            {CUSTOMER_FIELD_GROUPS.map((group) => <fieldset className="financeImportGroup" key={group.title}>
              <legend>{group.title}</legend>
              {group.title === "Shipping address" && <button type="button" className="estimateTextAction" disabled={saving} onClick={() => setDraft({
                ...draft, shippingAddressLine1: draft.billingAddressLine1, shippingAddressLine2: draft.billingAddressLine2,
                shippingAddressCity: draft.billingAddressCity, shippingAddressState: draft.billingAddressState, shippingAddressZip: draft.billingAddressZip,
              })}>Copy billing address</button>}
              <div className="financeImportFields">{group.fields.map((field) => <label className="financeImportField" key={field.key}>
                {field.label}{field.required ? " *" : ""}
                <input type={field.type ?? "text"} value={draft[field.key]} required={field.required} maxLength={field.maxLength} disabled={saving}
                  onChange={(event) => { setDraft({ ...draft, [field.key]: event.target.value }); setSimilar([]); }} />
              </label>)}</div>
            </fieldset>)}
            {similar.length > 0 && <div className={styles.similar} role="alert">
              <p>A similar customer already exists. Use it, or create this one anyway.</p>
              <ul>{similar.map((customer) => <li key={customer.customerId}>
                <span><strong>{customer.displayName}</strong>{customer.email ? ` - ${customer.email}` : ""}</span>
                <button type="button" className="estimateTextAction" disabled={saving} onClick={() => { setDraft(null); setSimilar([]); choose(customer); }}>Use this customer</button>
              </li>)}</ul>
            </div>}
            {createError && <p className="financeImportError" role="alert">{createError}</p>}
            <div className="financeImportActions">
              <button type="button" className="financeImportCancel" onClick={closeCreate} disabled={saving}>Cancel</button>
              {similar.length > 0
                ? <button type="button" className="financeImportSubmit" disabled={saving} onClick={() => void createCustomer(true)}>
                    {saving ? "Saving..." : "Create anyway"}
                  </button>
                : <button type="submit" className="financeImportSubmit" disabled={saving}>{saving ? "Saving..." : "Save customer"}</button>}
            </div>
          </form>
        </Modal>,
        document.body,
      )}
    </div>
  );
}
