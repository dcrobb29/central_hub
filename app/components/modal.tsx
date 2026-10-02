"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

// Tracks every currently-mounted Modal (outermost first) so that when
// modals are nested (e.g. the catalog picker opened from inside the new
// estimate form), a single Escape press only dismisses the topmost one
// instead of closing the whole stack at once.
const openModalIds: symbol[] = [];

/**
 * Shared dialog shell for every "add/import/pick" popup in the app
 * (invoices, bills, projects, materials, estimates, win-estimate, catalog
 * picker, ...). Previously each of these hand-rolled the same
 * backdrop/dialog/header/close-button markup; centralizing it here means
 * they all look and behave identically, including dismissal on Escape,
 * which none of the hand-rolled copies had.
 *
 * `onClose` is called for every dismissal attempt (backdrop click, Escape,
 * the close button) - callers that need to block dismissal while saving
 * should make their own close handler a no-op in that case, the same way
 * the existing per-table `closeImportDialog`-style functions already do.
 */
export default function Modal({
  titleId,
  title,
  eyebrow,
  onClose,
  closeDisabled = false,
  closeLabel = "Close",
  className,
  children,
}: {
  titleId: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const modalId = Symbol("modal");
    openModalIds.push(modalId);
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && openModalIds[openModalIds.length - 1] === modalId) onClose();
    }
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      const index = openModalIds.indexOf(modalId);
      if (index !== -1) openModalIds.splice(index, 1);
    };
  }, [onClose]);

  return (
    <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`financeImportDialog${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="financeImportDialogHeader">
          <div>
            {eyebrow && <p className="financeImportEyebrow">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="financeImportClose" onClick={onClose} aria-label={closeLabel} disabled={closeDisabled}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}
