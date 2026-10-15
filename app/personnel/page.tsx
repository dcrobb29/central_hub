import PersonnelWorkspace from "./personnel-workspace";
import styles from "@/app/components/record-workspace.module.css";
import personnelStyles from "./personnel-workspace.module.css";

export default async function PersonnelPage({ searchParams }: {
  searchParams: Promise<{ personId?: string | string[]; tab?: string | string[]; view?: string | string[] }>;
}) {
  const { personId, tab, view } = await searchParams;
  return (
    <main className={`body personnelPage ${styles.page} ${personnelStyles.page}`}>
      <PersonnelWorkspace selectedId={typeof personId === "string" ? personId : null}
        selectedTab={typeof tab === "string" ? tab : undefined} view={view === "chart" ? "chart" : "directory"} />
    </main>
  );
}
