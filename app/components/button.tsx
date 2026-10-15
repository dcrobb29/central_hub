"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "text" | "dangerText";

const variants: Record<ButtonVariant, string> = {
  primary: "uiButtonPrimary",
  secondary: "uiButtonSecondary",
  danger: "uiButtonDanger",
  text: "uiButtonText",
  dangerText: "uiButtonDangerText",
};

export default function Button({ variant = "primary", className, type = "button", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`uiButton ${variants[variant]}${className ? ` ${className}` : ""}`} {...props} />;
}