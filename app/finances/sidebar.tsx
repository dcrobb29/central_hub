"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Add new entries here as more finance tables are built out.
const NAV_ITEMS = [
  { href: "/finances/invoices", label: "Invoices" },
  { href: "/finances/bills", label: "Bills" },
  { href: "/finances/project_finances", label: "Project Finances" }

];

export default function FinanceSidebar() {
  const pathname = usePathname();

  return (
    <nav className="financeSidebar">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname === item.href ? "financeSidebarLink financeSidebarLinkActive" : "financeSidebarLink"}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
