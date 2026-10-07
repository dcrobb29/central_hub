"use client";

import { useState } from "react";
import Modal from "@/app/components/modal";
import BillSplitToggle from "@/app/components/bill-split-toggle";
import { billBalanceForRow, billSelectionIssue, searchAllocationBills } from "@/app/lib/bill-picker";
import type { AllocationBill } from "@/app/lib/project-costs";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const PAGE_SIZE = 20;

export default function SupplierBillPicker({ bills, projectId, original, onSelect, onClose }: {
  bills: AllocationBill[]; projectId: number; original?: { billId: string; amount: number };
  onSelect: (bill: AllocationBill) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const matches = searchAllocationBills(bills, search, original);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1));
  const visible = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  return <Modal titleId={`supplierBillPicker-${projectId}`} title="Find supplier bill" eyebrow="PROJECT ACTUALS"
    onClose={onClose} closeLabel="Close supplier bill search">
    <label className="financeImportField">Search bills
      <input type="search" autoFocus value={search} placeholder="Bill number, ID, vendor, date, or job"
        onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
    </label>
    <p className="projectCostHint">Bills with available balances are shown, including those attached to other jobs. Those bills require explicit split mode before selection. Changing split mode is saved immediately and changes job totals.</p>
    <p role="status">{matches.length} matching bills{matches.length > 0 && ` · Showing ${currentPage * PAGE_SIZE + 1}-${currentPage * PAGE_SIZE + visible.length}`}</p>
    <div className="projectScopeTableWrapper"><table className="invoiceTable projectScopeTable">
      <thead><tr><th>Bill / Vendor</th><th>Date</th><th>Total</th><th>Available balance</th><th>Assignment</th><th>Action</th></tr></thead>
      <tbody>{visible.map((bill) => {
        const issue = billSelectionIssue(bill, projectId, original);
        const balance = billBalanceForRow(bill, original);
        return <tr key={bill.billId}>
          <td>{bill.billNo} ({bill.billId})<br />{bill.companyName ?? "Vendor unspecified"}</td>
          <td>{bill.billDate}</td><td>{bill.amount === null ? "Invalid total" : currency.format(bill.amount)}</td>
          <td>{balance === null ? "Invalid total" : currency.format(balance)}</td>
          <td>{bill.isSplit ? "Split across jobs" : bill.projectName ?? (bill.projectId === null ? "Unassigned" : `Job ${bill.projectId}`)}</td>
          <td><button type="button" className="estimateTextAction" disabled={issue !== null} onClick={() => onSelect(bill)}
            aria-label={`Select supplier bill ${bill.billId}`}>Select bill</button>
            {issue && <p className="projectCostHint">{issue}</p>}
            {!bill.isSplit && bill.projectId !== null && bill.projectId !== projectId &&
              <BillSplitToggle billId={bill.billId} isSplit={bill.isSplit} disabled={bill.readOnly} />}
          </td>
        </tr>;
      })}
      {visible.length === 0 && <tr><td colSpan={6}>No bills match. Try another search, or import a bill in Finances. Fully allocated bills are excluded except the bill on the row being edited.</td></tr>}
      </tbody>
    </table></div>
    <div className="financeImportActions">
      <button type="button" className="financeImportCancel" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous bills</button>
      <button type="button" className="financeImportCancel" disabled={(currentPage + 1) * PAGE_SIZE >= matches.length} onClick={() => setPage(currentPage + 1)}>Next bills</button>
    </div>
  </Modal>;
}
