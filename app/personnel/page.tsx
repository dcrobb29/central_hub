import PersonnelWorkspace from "./personnel-workspace";
import styles from "@/app/components/record-workspace.module.css";
import personnelStyles from "./personnel-workspace.module.css";
import { redirect } from "next/navigation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export default async function PersonnelPage({ searchParams }: {
  searchParams: Promise<{ personId?: string | string[]; tab?: string | string[]; view?: string | string[] }>;
}) {
  const { personId, tab, view } = await searchParams;
  let session;
  try {
    session = await requireProjectSession(undefined, "personnel.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <main className={`body personnelPage ${styles.page} ${personnelStyles.page}`}><p role="alert">{error.message}</p></main>;
    throw error;
  }
  return (
    <main className={`body personnelPage ${styles.page} ${personnelStyles.page}`}>
      <PersonnelWorkspace selectedId={typeof personId === "string" ? personId : null}
        selectedTab={typeof tab === "string" ? tab : undefined} view={view === "chart" ? "chart" : "directory"}
        canWrite={session.permissions.includes("personnel.write")} />
    </main>
  );
}
