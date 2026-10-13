"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LocalLoginOption } from "@/app/lib/auth";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("dcrobb29@gmail.com");
  const [password, setPassword] = useState("Password1!");
  const [showPassword, setShowPassword] = useState(false);
  const [practicePassword, setPracticePassword] = useState("Password1!");
  const [localUsers, setLocalUsers] = useState<LocalLoginOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/account/login");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.practicePassword) setPracticePassword(data.practicePassword);
          if (Array.isArray(data.localUsers)) setLocalUsers(data.localUsers);
        }
      } catch {
        // Ignore in local dev
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
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
      window.location.href = redirectTarget;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  function handleSelectUser(user: LocalLoginOption) {
    setEmail(user.email);
    setPassword(practicePassword);
    setError(null);
  }

  return (
    <main className="loginShell">
      <div className="loginCard">
        <div className="loginHeader">
          <img src="/logo.png" alt="Resolution" className="loginLogo" />
          <h1 className="loginTitle">Sign in to your account</h1>
          <p className="loginSubtitle">Enter your credentials or pick a test user below</p>
        </div>

        {error && (
          <div className="financeImportError" role="alert" style={{ marginBottom: "16px", padding: "10px", background: "#fdf3f2", borderRadius: "4px" }}>
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

          <div className="loginPracticeHint">
            <span>
              Practice password: <strong>{practicePassword}</strong>
            </span>
            <button
              type="button"
              onClick={() => setPassword(practicePassword)}
              disabled={busy}
            >
              Fill password
            </button>
          </div>

          <button type="submit" className="loginButton" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {localUsers.length > 0 && (
          <section className="loginQuickSection" aria-label="Available test accounts">
            <h2 className="loginQuickTitle">Quick test accounts</h2>
            <div className="loginQuickList">
              {localUsers.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  className="loginQuickButton"
                  onClick={() => handleSelectUser(u)}
                  disabled={busy}
                >
                  <span className="loginQuickInfo">
                    <strong>{u.displayName}</strong>
                    <small>{u.email}</small>
                  </span>
                  {u.roleName && <span className="loginQuickRole">{u.roleName}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
