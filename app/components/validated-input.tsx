"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import DecimalInput from "./decimal-input";
import { formatPhone, formatZip } from "@/app/lib/contact-input";
import { US_STATES } from "@/app/lib/us-states";
import { MAX_BILL_AMOUNT, MAX_MONEY } from "@/app/lib/decimal-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  field: string;
  onChange?: (event: { target: { value: string } }) => void;
};

export default function ValidatedInput({ field, onChange, ...props }: Props) {
  const errorId = useId();
  const [touched, setTouched] = useState(false);
  if (props.type === "number") return <DecimalInput {...props} currency
    max={field === "billAmount" ? MAX_BILL_AMOUNT : MAX_MONEY}
    value={String(props.value ?? "")} onChange={onChange} />;
  if (field.toLowerCase().endsWith("state")) {
    const value = String(props.value ?? "");
    const legacy = value && !US_STATES.some(([code]) => code === value);
    return <select id={props.id} name={props.name} className={props.className}
      aria-label={props["aria-label"]} aria-describedby={props["aria-describedby"]}
      required={props.required} disabled={props.disabled} value={value} onChange={onChange}>
      <option value="">Select state / territory</option>
      {legacy && <option value={value}>{value} (existing value)</option>}
      {US_STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
    </select>;
  }
  const phone = field.toLowerCase().includes("phone");
  const zip = field.toLowerCase().endsWith("zip");
  const text = String(props.value ?? "");
  const error = props.required && !text.trim() ? "This field is required."
    : phone && text && !/^\(\d{3}\)\d{3}-\d{4}$/.test(text) ? "Enter a 10-digit US phone number."
    : zip && text && !/^\d{5}(?:-\d{4})?$/.test(text) ? "Enter a 5-digit ZIP or ZIP+4 (XXXXX-XXXX)." : "";
  return <><input {...props}
    aria-invalid={touched && error ? true : undefined}
    aria-describedby={[props["aria-describedby"], touched && error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
    ref={element => { if (element) element.setCustomValidity(error); }}
    inputMode={phone ? "tel" : zip ? "numeric" : props.inputMode}
    pattern={phone ? "\\(\\d{3}\\)\\d{3}-\\d{4}" : zip ? "\\d{5}(-\\d{4})?" : props.pattern}
    title={phone ? "Enter a 10-digit US phone number." : zip ? "Enter a 5-digit ZIP or ZIP+4 (XXXXX-XXXX)." : props.title}
    onBlur={event => {
      setTouched(true);
      if (!phone && !zip && props.type !== "date") {
        event.target.value = event.target.value.trim();
        onChange?.(event);
      }
      props.onBlur?.(event);
    }}
    onInvalid={event => { setTouched(true); props.onInvalid?.(event); }}
    onChange={event => {
      if (phone) event.target.value = formatPhone(event.target.value);
      if (zip) event.target.value = formatZip(event.target.value);
      onChange?.(event);
    }} />{touched && error && <span id={errorId} className="financeImportError" role="alert">{error}</span>}</>;
}
