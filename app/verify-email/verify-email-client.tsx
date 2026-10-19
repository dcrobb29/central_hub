"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

function subscribeToHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getVerificationToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export default function VerifyEmailClient() {
  const token = useSyncExternalStore(subscribeToHashChange, getVerificationToken, () => "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
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
        <img src="/logo.png" alt="Resolution" className="loginLogo" />
        <h1 className="loginTitle">Verify your email</h1>
        <p className="loginSubtitle">{token ? "Confirm this address to finish creating your account." : "This verification link is missing or invalid."}</p>
      </div>
      {error && <div className="financeImportError" role="alert">{error}</div>}
      {token && <button type="button" className="loginButton" disabled={busy} onClick={() => void verify()}>
        {busy ? "Verifying..." : "Verify email and create account"}
      </button>}
      <p className="loginSubtitle"><Link href="/login">Return to sign in</Link></p>
    </div>
  </main>;
}
