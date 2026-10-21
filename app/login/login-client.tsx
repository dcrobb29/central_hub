"use client";

import { useState, type SubmitEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSafeRedirectTarget } from "@/app/lib/safe-redirect";

export default function LoginClient({ signupEnabled }: { signupEnabled: boolean }) {
  const searchParams = useSearchParams();
  const requestedTarget = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Sign-in failed. Please verify credentials.");
      }

      // Hard redirect to refresh root layout and session
      window.location.href = getSafeRedirectTarget(requestedTarget, window.location.origin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="loginShell">
      <div className="loginCard">
        <div className="loginHeader">
          <img src="/logo2.png" alt="Overhead" className="loginLogo" />
          <h1 className="loginTitle">Sign in to your account</h1>
          <p className="loginSubtitle">Enter your email address and password.</p>
        </div>

        {error && (
          <div className="financeImportError" role="alert" style={{ marginBottom: "16px", padding: "10px", background: "var(--ui-color-danger-bg)", borderRadius: "4px" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="loginForm">
          <label className="loginField">
            Email address
            <input
              type="email"
              className="loginInput"
              autoComplete="email"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </label>

          <label className="loginField">
            Password
            <div className="loginPasswordWrap">
              <input
                type={showPassword ? "text" : "password"}
                className="loginInput"
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="loginPasswordToggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <button type="submit" className="loginButton" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {signupEnabled && <p className="loginSubtitle"><Link href="/register">Create an account</Link></p>}

      </div>
    </main>
  );
}
