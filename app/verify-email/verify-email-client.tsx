"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type SubmitEvent } from "react";

function subscribeToHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getVerificationToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export default function VerifyEmailClient() {
  const token = useSyncExternalStore(subscribeToHashChange, getVerificationToken, () => "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completeSignup(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Verification failed.");
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setBusy(false);
    }
  }

  return <main className="loginShell">
    <div className="loginCard">
      <div className="loginHeader">
        <img src="/logo2.png" alt="Overhead" className="loginLogo" />
        <h1 className="loginTitle">Verify your email</h1>
        <p className="loginSubtitle">{token ? "Set your password to verify this email address and finish creating your account." : "This verification link is missing or invalid."}</p>
      </div>
      {error && <div className="financeImportError" role="alert">{error}</div>}
      {token && <form onSubmit={(event) => void completeSignup(event)} className="loginForm">
        <label className="loginField">Password (12–128 characters)
          <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} className="loginInput" />
        </label>
        <label className="loginField">Confirm password
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="loginInput" />
        </label>
        <button type="submit" className="loginButton" disabled={busy}>
          {busy ? "Creating account..." : "Verify email and create account"}
        </button>
      </form>}
      <p className="loginSubtitle"><Link href="/login">Return to sign in</Link></p>
    </div>
  </main>;
}
