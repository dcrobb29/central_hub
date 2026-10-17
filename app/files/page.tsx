import FileExplorer from "./file-explorer";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./file-workspace.module.css";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  let canWrite: boolean;
  try {
    const session = await requireProjectSession(undefined, "projects.read");
    canWrite = session.permissions.includes("projects.write");
  } catch (error) {
    if (!(error instanceof ProjectAccessError)) throw error;
    return <main className={`body ${recordStyles.page} ${styles.page}`}><p role="alert">{error.message}</p></main>;
  }
  return (
    <main className={`body ${recordStyles.page} ${styles.page}`}>
      <FileExplorer canWrite={canWrite} />
    </main>
  );
}
