import RegisterClient from "./register-client";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <RegisterClient
    enabled={process.env.ACCOUNT_SIGNUP_ENABLED === "true"}
    turnstileSiteKey={process.env.TURNSTILE_SITE_KEY?.trim() ?? ""}
  />;
}
