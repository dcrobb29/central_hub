import FinanceSidebar from "./sidebar";

export default function FinancesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="body financeLayout">
      <FinanceSidebar />
      <div className="financeContent">{children}</div>
    </div>
  );
}
