"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { decimalInputError, normalizeCurrencyText, normalizeDecimalText, MAX_DECIMAL_4, MAX_DECIMAL_6 } from "@/app/lib/decimal-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  value: string | number;
  places?: number;
  currency?: boolean;
};

export default function DecimalInput({ value, places = 2, currency = false, onChange, onBlur, min, max, ...props }: Props) {
  const errorId = useId();
  const [draft, setDraft] = useState({ external: String(value), text: String(value) });
  if (draft.external !== String(value)) setDraft({ external: String(value), text: String(value) });
  const text = draft.external === String(value) ? draft.text : String(value);
  const error = decimalInputError(text, places, min === undefined ? undefined : Number(min), max === undefined ? (places === 6 ? MAX_DECIMAL_6 : MAX_DECIMAL_4) : Number(max));
  return <span className="decimalInputField"><input {...props} type="text" inputMode="decimal" value={text}
    aria-invalid={error ? true : undefined}
    aria-describedby={[props["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
    ref={element => { if (element) element.setCustomValidity(error); }}
    onChange={event => {
      const raw = currency ? normalizeCurrencyText(event.target.value) : event.target.value;
      if (!/^-?\d*\.?\d*$/.test(raw)) {
        if (currency && /[$,]/.test(raw)) setDraft({ external: String(value), text: raw });
        return;
      }
      event.target.value = raw;
      if (typeof value === "number" && !Number.isFinite(Number(raw))) {
        setDraft({ external: String(value), text: raw });
        return;
      }
      setDraft({ external: typeof value === "number" ? String(Number(raw)) : raw, text: raw });
      onChange?.(event);
    }}
    onBlur={event => {
      const normalized = normalizeDecimalText(event.target.value);
      if (typeof value === "number" && !Number.isFinite(Number(normalized))) {
        onBlur?.(event);
        return;
      }
      event.target.value = normalized;
      setDraft({ external: typeof value === "number" ? String(Number(normalized)) : normalized, text: normalized });
      onChange?.(event);
      onBlur?.(event);
    }} />{error && !props.disabled && <span id={errorId} className="financeImportError" role="alert">{error}</span>}</span>;
}
