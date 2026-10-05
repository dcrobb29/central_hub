import type { Transaction } from "mssql";

export async function rollbackIfActive(transaction: Transaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch (error) {
    // SQL triggers can abort the transaction before the application catches the
    // original error. Preserve that error instead of replacing it with EABORT.
    if (typeof error === "object" && error !== null && "code" in error &&
      (error.code === "EABORT" || error.code === "ENOTBEGUN")) return;
    throw error;
  }
}
