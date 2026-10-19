import { Suspense } from "react";
import LoginClient from "./login-client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const signupEnabled = process.env.ACCOUNT_SIGNUP_ENABLED === "true";
  return (
    <Suspense fallback={<div className="loginShell"><p>Loading...</p></div>}>
      <LoginClient signupEnabled={signupEnabled} />
    </Suspense>
  );
}
