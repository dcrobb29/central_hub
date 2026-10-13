import { Suspense } from "react";
import LoginClient from "./login-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loginShell"><p>Loading...</p></div>}>
      <LoginClient />
    </Suspense>
  );
}
