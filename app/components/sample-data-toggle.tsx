"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function SampleDataToggle() {
  const router = useRouter();
  const [hasSampleData, setHasSampleData] = useState<boolean | null>(null);
  const [recordCount, setRecordCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Load initial status on mount
  useEffect(() => {
    let isMounted = true;
    async function checkStatus() {
      try {
        const res = await fetch("/api/sample-data");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setHasSampleData(Boolean(data.hasSampleData));
            setRecordCount(Number(data.recordCount || 0));
          }
        }
      } catch {
        // Silently fail initial probe if network / offline
      }
    }
    void checkStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleToggle() {
    if (isProcessing) return;
    const nextAction = hasSampleData ? "exclude" : "include";
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(
      nextAction === "include"
        ? "Generating sample lifecycle (estimates, projects, field ops, invoices)..."
        : "Removing sample data records cleanly..."
    );

    try {
      const res = await fetch("/api/sample-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to update sample data");
      }

      setHasSampleData(Boolean(data.hasSampleData));
      setRecordCount(Number(data.recordCount || 0));
      setStatusMessage(
        nextAction === "include"
          ? `Sample data loaded (${data.recordCount || 76} records)! Refreshing...`
          : "Sample data removed successfully! Refreshing..."
      );

      // Refresh page data so tables immediately reflect changes
      startTransition(() => {
        router.refresh();
      });

      // Reload page after brief delay for complete re-render of cached tables
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An error occurred");
      setStatusMessage(null);
      setIsProcessing(false);
    }
  }

  // Do not render until initial status is loaded to avoid button flicker
  if (hasSampleData === null) {
    return null;
  }

  return (
    <div className="sampleDataToggleContainer">
      <button
        type="button"
        className={`sampleDataButton ${hasSampleData ? "sampleDataButtonActive" : "sampleDataButtonInactive"}`}
        onClick={handleToggle}
        disabled={isProcessing}
        title={
          hasSampleData
            ? "Remove all generated sample estimates, projects, operations, invoices, and bills"
            : "Generate complete sample lifecycle across estimates, projects, operations, invoices, and bills"
        }
      >
        {isProcessing ? (
          <>
            <svg
              className="sampleDataSpinner"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle
                className="sampleDataSpinnerTrack"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="sampleDataSpinnerHead"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{hasSampleData ? "Excluding..." : "Including..."}</span>
          </>
        ) : hasSampleData ? (
          <>
            <span className="sampleDataActiveDot" aria-hidden="true" />
            <span>Exclude Sample Data</span>
          </>
        ) : (
          <>
            <svg
              className="sampleDataAddIcon"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 1a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 8 1z" />
            </svg>
            <span>Include Sample Data</span>
          </>
        )}
      </button>

      {statusMessage && (
        <div className="sampleDataToast sampleDataToastInfo" role="status" aria-live="polite">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="sampleDataToast sampleDataToastError" role="alert">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="sampleDataToastClose"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
