import FinanceSidebar from "./sidebar";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./finance-workspace.module.css";

export default function FinancesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={`body ${recordStyles.page} ${styles.page}`}>
      <div className={recordStyles.workspace}>
        <FinanceSidebar />
        {children}
      </div>
    </main>
  );
}
