"use client";

import Link from "next/link";
import { useCallback, useState, type SubmitEvent } from "react";
import TurnstileWidget from "./turnstile-widget";

export default function RegisterClient({ enabled, turnstileSiteKey }: { enabled: boolean; turnstileSiteKey: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const updateTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

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
          turnstileToken,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Registration failed.");
      setSent(true);
      formElement.reset();
      setTurnstileToken("");
      setCaptchaResetSignal((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
      setTurnstileToken("");
      setCaptchaResetSignal((value) => value + 1);
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
      {!enabled || !turnstileSiteKey ? <p role="status">Account registration is not available yet.</p> : <>
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
          <TurnstileWidget siteKey={turnstileSiteKey} resetSignal={captchaResetSignal} onToken={updateTurnstileToken} />
          <button type="submit" className="loginButton" disabled={busy || !turnstileToken}>{busy ? "Sending verification..." : "Verify email"}</button>
        </form>
      </>}
      <p className="loginSubtitle"><Link href="/login">Back to sign in</Link></p>
    </div>
  </main>;
}
