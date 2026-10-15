import FileExplorer from "./file-explorer";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./file-workspace.module.css";

export default function FilesPage() {
  return (
    <main className={`body ${recordStyles.page} ${styles.page}`}>
      <FileExplorer />
    </main>
  );
}
