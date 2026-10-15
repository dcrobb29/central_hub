"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./finance-workspace.module.css";

// Add new entries here as more finance tables are built out.
const NAV_ITEMS = [
  { href: "/finances/customers", label: "Customers" },
  { href: "/finances/invoices", label: "Invoices" },
  { href: "/finances/bills", label: "Bills" },
  { href: "/finances/project_finances", label: "Project Finances" }

];

export default function FinanceSidebar() {
  const pathname = usePathname();

  return (
    <nav className={styles.navigation} aria-label="Finance sections">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
