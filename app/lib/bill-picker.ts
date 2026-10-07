import type { AllocationBill } from "./project-costs";

export function billBalanceForRow(bill: AllocationBill, original?: { billId: string; amount: number }): number | null {
  return bill.remainingAmount === null ? null : Math.round((bill.remainingAmount + (original?.billId === bill.billId ? original.amount : 0)) * 100) / 100;
}

export function billSelectionIssue(bill: AllocationBill, projectId: number, original?: { billId: string; amount: number }): string | null {
  if (bill.amount === null || bill.amount <= 0) return "Correct the bill total in Finances first.";
  if (!bill.isSplit && bill.projectId !== null && bill.projectId !== projectId) {
    return bill.readOnly ? "Attached to a completed job. Reopen that job before changing bill ownership."
      : "Attached to another job. Enable split mode to allocate its balance here.";
  }
  if ((billBalanceForRow(bill, original) ?? 0) <= 0) return "No unallocated balance remains.";
  return null;
}

export function searchAllocationBills(bills: AllocationBill[], search: string, original?: { billId: string; amount: number }): AllocationBill[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return bills.filter((bill) => {
    const text = [bill.billId, bill.billNo, bill.companyName, bill.projectName, bill.billDate,
      bill.isSplit ? "split across jobs" : bill.projectId === null ? "unassigned" : "assigned"].join(" ").toLocaleLowerCase();
    return ((billBalanceForRow(bill, original) ?? 0) > 0 || bill.billId === original?.billId)
      && terms.every((term) => text.includes(term));
  });
}
