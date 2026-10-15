"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Modal from "@/app/components/modal";
import { FinanceHeading, FinanceRecord, FinanceFacts } from "../finance-collection";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "../finance-workspace.module.css";
import {
  CUSTOMER_FIELD_GROUPS, EMPTY_CUSTOMER, customerLabel, customerToDraft,
  type Customer, type CustomerDraft,
} from "@/app/lib/customer-fields";

export default function CustomerDirectory({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState("cards");
  const selectedCustomer = customers.find((customer) => customer.customerId === selectedId);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return customers.filter((customer) => (showArchived || customer.isActive) &&
      (!q || Object.values(customer).join(" ").toLocaleLowerCase().includes(q)));
  }, [customers, showArchived, search]);

  function open(customer?: Customer) {
    setEditingId(customer?.customerId ?? null);
    setDraft(customer ? customerToDraft(customer) : { ...EMPTY_CUSTOMER });
    setError(null);
  }
  function close() {
    if (busy) return;
    setDraft(null);
    setError(null);
  }
  async function request(body: Record<string, unknown>) {
    const response = await fetch("/api/finances/customers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to save customer");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await request({ action: "save", customerId: editingId, ...draft });
      setDraft(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save customer");
    } finally { setBusy(false); }
  }
  async function changeActive(customer: Customer) {
    setBusy(true);
    setError(null);
    try {
      await request({ action: "set-active", customerId: customer.customerId, isActive: !customer.isActive });
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update customer");
    } finally { setBusy(false); }
  }
  return (
    <section className={styles.workspace}>
      {selectedCustomer ? <FinanceRecord key={selectedCustomer.customerId} title={customerLabel(selectedCustomer)} collection="customers" onBack={() => setSelectedId(null)}
        actions={<>
          <button type="button" className="estimateTextAction" disabled={busy} onClick={() => open(selectedCustomer)}>Edit customer</button>
          <button type="button" className="estimateTextAction" disabled={busy} onClick={() => void changeActive(selectedCustomer)}>{selectedCustomer.isActive ? "Archive" : "Restore"}</button>
        </>}
        overview={<FinanceFacts items={[
          { label: "Contact", value: [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") },
          { label: "Company", value: selectedCustomer.companyName },
          { label: "Email", value: selectedCustomer.email },
          { label: "Phone", value: selectedCustomer.phone },
          { label: "Status", value: selectedCustomer.isActive ? "Active" : "Archived" },
        ]} />}
        details={<FinanceFacts items={CUSTOMER_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => ({
          label: `${group.title}: ${field.label}`, value: selectedCustomer[field.key],
        })))} />}
      /> : <>
      <FinanceHeading title="Customers" description="Your customer directory. Open a customer for contact information, addresses, editing, and archive tools."
        action={<button type="button" className="financeImportButton" onClick={() => open()} disabled={busy}><Plus size={15} aria-hidden="true" />Add customer</button>} />
      <div className={styles.toolbar}>
        <div className="listStatusToggle" role="group" aria-label="Customers display">
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>Overview</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Detailed table</button>
        </div>
        <label className="customerArchivedToggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived</label>
      </div>
      <div className="invoiceTableTools">
        <label className="invoiceSearchLabel">Search customers
          <input type="search" className="invoiceSearchInput" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contact, company, or address" />
        </label>
        <span className="invoiceResultCount" aria-live="polite">{visible.length} customers</span>
      </div>
      {view === "cards" ? <div className={recordStyles.list}>
        {visible.length === 0 && <p className={recordStyles.empty}>No customers match. Add a customer to get started.</p>}
        {visible.map((customer) => <article className={recordStyles.card} key={customer.customerId} aria-label={customerLabel(customer)}>
          <div className={recordStyles.identity}><h2><button type="button" className={styles.textButton} onClick={() => setSelectedId(customer.customerId)}>{customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(" ")}</button></h2>
            {customer.companyName && <p>{[customer.firstName, customer.lastName].filter(Boolean).join(" ")}</p>}</div>
          <div className={recordStyles.status}><span className={recordStyles.label}>Status</span><strong>{customer.isActive ? "Active" : "Archived"}</strong></div>
          <div className={recordStyles.status}><span className={recordStyles.label}>Contact</span><span className={styles.hint}>{customer.email || "No email"}</span><span className={styles.hint}>{customer.phone || "No phone"}</span></div>
          <div className={recordStyles.actions}><button type="button" className={recordStyles.openRecord} onClick={() => setSelectedId(customer.customerId)} aria-label={`Open customer ${customerLabel(customer)}`}>Open customer</button></div>
        </article>)}
      </div> : <div className="invoiceTableWrapper">
        <table className="invoiceTable">
          <thead><tr><th>Contact</th><th>Company</th><th>Email / phone</th><th>Billing address</th><th>Shipping address</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={7} className="invoiceNoResults">No customers match. Add a customer to get started.</td></tr>}
            {visible.map((customer) => <tr key={customer.customerId}>
              <td>{[customer.firstName, customer.lastName].filter(Boolean).join(" ")}</td>
              <td>{customer.companyName ?? "-"}</td>
              <td>{customer.email ?? "-"}<br />{customer.phone ?? "-"}</td>
              <td>{[customer.billingAddressLine1, customer.billingAddressLine2, customer.billingAddressCity, customer.billingAddressState, customer.billingAddressZip].filter(Boolean).join(", ") || "-"}</td>
              <td>{[customer.shippingAddressLine1, customer.shippingAddressLine2, customer.shippingAddressCity, customer.shippingAddressState, customer.shippingAddressZip].filter(Boolean).join(", ") || "-"}</td>
              <td>{customer.isActive ? "Active" : "Archived"}</td>
              <td><div className="estimateActionsInner">
                <button type="button" className="estimateTextAction" disabled={busy} onClick={() => open(customer)} aria-label={`Edit ${customerLabel(customer)}`}>Edit</button>
                <button type="button" className="estimateTextAction" disabled={busy} onClick={() => void changeActive(customer)} aria-label={`${customer.isActive ? "Archive" : "Restore"} ${customerLabel(customer)}`}>{customer.isActive ? "Archive" : "Restore"}</button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      </>}
      <p className={styles.hint}>Customer changes apply to future selections, not existing invoice details. Archive customers to hide them from new assignments without deleting history.</p>
      {error && !draft && <p className="financeImportError" role="alert">{error}</p>}
      {draft && <Modal titleId="customerFormTitle" title={editingId === null ? "Add customer" : "Edit customer"} eyebrow="CUSTOMERS" onClose={close} closeDisabled={busy}>
        <form onSubmit={save}>
          <p className="financeImportHint">Contact name is required. Company, contact methods, and addresses are optional.</p>
          {CUSTOMER_FIELD_GROUPS.map((group) => <fieldset className="financeImportGroup" key={group.title}>
            <legend>{group.title}</legend>
            {group.title === "Shipping address" && <button type="button" className="estimateTextAction" disabled={busy} onClick={() => setDraft({
              ...draft, shippingAddressLine1: draft.billingAddressLine1, shippingAddressLine2: draft.billingAddressLine2,
              shippingAddressCity: draft.billingAddressCity, shippingAddressState: draft.billingAddressState, shippingAddressZip: draft.billingAddressZip,
            })}>Copy billing address</button>}
            <div className="financeImportFields">{group.fields.map((field) => <label className="financeImportField" key={field.key}>
              {field.label}{field.required ? " *" : ""}
              <input type={field.type ?? "text"} value={draft[field.key]} required={field.required} maxLength={field.maxLength} disabled={busy}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
            </label>)}</div>
          </fieldset>)}
          {error && <p className="financeImportError" role="alert">{error}</p>}
          <div className="financeImportActions">
            <button type="button" className="financeImportCancel" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="financeImportSubmit" disabled={busy}>{busy ? "Saving..." : "Save customer"}</button>
          </div>
        </form>
      </Modal>}
    </section>
  );
}
