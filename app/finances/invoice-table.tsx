"use client";

import { useState } from "react";
import type { Invoice } from "@/app/lib/invoices";

type Column = {
  key: keyof Invoice;
  label: string;
};

// Order here defines the initial column order; this array will become
// reorderable state once drag-and-drop is added.
const COLUMNS: Column[] = [
  { key: "invoiceNo", label: "Invoice No" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "invoiceDueDate", label: "Due Date" },
  { key: "invoiceAmount", label: "Amount" },
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "companyName", label: "Company" },
  { key: "billingAddressLine1", label: "Billing Address 1" },
  { key: "billingAddressLine2", label: "Billing Address 2" },
  { key: "billingAddressCity", label: "Billing City" },
  { key: "billingAddressState", label: "Billing State" },
  { key: "billingAddressZip", label: "Billing Zip" },
  { key: "shippingAddressLine1", label: "Shipping Address 1" },
  { key: "shippingAddressLine2", label: "Shipping Address 2" },
  { key: "shippingAddressCity", label: "Shipping City" },
  { key: "shippingAddressState", label: "Shipping State" },
  { key: "shippingAddressZip", label: "Shipping Zip" },
];

function formatValue(key: keyof Invoice, value: Invoice[keyof Invoice]) {
  if (value == null) return "";
  if (key === "invoiceAmount") {
    // stored as padded text like " $1,101.00" (nchar column), not a numeric type
    const numeric = Number(String(value).replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(numeric)) return String(value).trim();
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(numeric);
  }
  if (key === "invoiceDate" || key === "invoiceDueDate") {
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  return String(value);
}

export default function InvoiceTable({ className, invoices }: { className?: string; invoices: Invoice[] }) {
  const [columns] = useState<Column[]>(COLUMNS);

  if (invoices.length === 0) {
    return <p>No invoices found.</p>;
  }

  return (
    <div className="invoiceTableWrapper">
      <table className={className}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              {columns.map((column) => (
                <td key={column.key}>{formatValue(column.key, invoice[column.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
