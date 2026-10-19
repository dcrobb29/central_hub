"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";

export default function RegisterClient({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSent(false);
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          organizationName: form.get("organizationName"),
          email: form.get("email"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Registration failed.");
      setSent(true);
      formElement.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="loginShell">
    <div className="loginCard">
      <div className="loginHeader">
        <img src="/logo.png" alt="Resolution" className="loginLogo" />
        <h1 className="loginTitle">Create your account</h1>
        <p className="loginSubtitle">Your verified account starts a separate company workspace.</p>
      </div>
      {!enabled ? <p role="status">Account registration is not available yet.</p> : <>
        {error && <div className="financeImportError" role="alert">{error}</div>}
        {sent && <p role="status">If registration is available for that address, verification instructions will be sent. If nothing arrives, check your spam folder or try again later.</p>}
        <form onSubmit={(event) => void submit(event)} className="loginForm">
          <label className="loginField">Your name
            <input name="displayName" type="text" autoComplete="name" maxLength={150} required disabled={busy} className="loginInput" />
          </label>
          <label className="loginField">Company name
            <input name="organizationName" type="text" autoComplete="organization" maxLength={150} required disabled={busy} className="loginInput" />
          </label>
          <label className="loginField">Email address
            <input name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} className="loginInput" />
          </label>
          <button type="submit" className="loginButton" disabled={busy}>{busy ? "Sending verification..." : "Verify email"}</button>
        </form>
      </>}
      <p className="loginSubtitle"><Link href="/login">Back to sign in</Link></p>
    </div>
  </main>;
}
