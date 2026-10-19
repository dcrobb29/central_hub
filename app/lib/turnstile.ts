import crypto from "node:crypto";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function expectedHostname() {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (!configured) throw new Error("PUBLIC_APP_URL is not configured.");
  const url = new URL(configured);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("PUBLIC_APP_URL must be an HTTPS origin.");
  }
  return url.hostname.toLowerCase();
}

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured.");

  const response = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret,
      response: token,
      idempotency_key: crypto.randomUUID(),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Turnstile Siteverify returned HTTP ${response.status}.`);

  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("success" in result) || typeof result.success !== "boolean") {
    throw new Error("Turnstile Siteverify returned an invalid response.");
  }
  if (!result.success) return false;
  return "hostname" in result && typeof result.hostname === "string"
    && result.hostname.toLowerCase() === expectedHostname();
}
