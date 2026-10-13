"use client";

import { useId } from "react";
import { NOTES_MAX_LENGTH } from "@/app/lib/document-notes";

type Notes = { internalNotes: string | null; customerNotes: string | null };

export function DocumentNotesFields({ internalNotes, customerNotes, onInternalChange, onCustomerChange,
  disabled = false, internalRequired = false, internalHint, customerHint }: Notes & {
  onInternalChange: (value: string) => void; onCustomerChange: (value: string) => void;
  disabled?: boolean; internalRequired?: boolean; internalHint?: string; customerHint?: string;
}) {
  const id = useId();
  return <>
    <div className="estimateNotes">
      <label className="financeImportField" htmlFor={`${id}-internal`}>Internal Notes{internalRequired ? " *" : ""}
        <textarea id={`${id}-internal`} placeholder="Notes for the team (not shown on the customer PDF)" value={internalNotes ?? ""}
          maxLength={NOTES_MAX_LENGTH} rows={4} disabled={disabled} required={internalRequired}
          aria-describedby={`${id}-internal-hint`} onChange={(event) => onInternalChange(event.target.value)} />
      </label>
      <p id={`${id}-internal-hint`} className="estimateInternalNote">
        Private. Never included on the customer PDF. {internalHint ?? "Optional."} Up to {NOTES_MAX_LENGTH.toLocaleString()} characters.
      </p>
    </div>
    <div className="estimateNotes">
      <label className="financeImportField" htmlFor={`${id}-customer`}>Customer Notes
        <textarea id={`${id}-customer`} placeholder="Notes for the customer (shown on the customer PDF)" value={customerNotes ?? ""}
          maxLength={NOTES_MAX_LENGTH} rows={4} disabled={disabled}
          aria-describedby={`${id}-customer-hint`} onChange={(event) => onCustomerChange(event.target.value)} />
      </label>
      <p id={`${id}-customer-hint`} className="estimateInternalNote">
        Optional. Included on the customer PDF. {customerHint} Up to {NOTES_MAX_LENGTH.toLocaleString()} characters.
      </p>
    </div>
  </>;
}

export function DocumentNotes({ internalNotes, customerNotes, internalClassName = "", customerClassName = "" }: Notes & {
  internalClassName?: string; customerClassName?: string;
}) {
  return <>
    {internalNotes && <div className={`internalNotes ${internalClassName}`}><strong>Internal notes</strong><p>{internalNotes}</p></div>}
    {customerNotes && <div className={`customerNotes ${customerClassName}`}><strong>Customer notes</strong><p>{customerNotes}</p></div>}
  </>;
}
