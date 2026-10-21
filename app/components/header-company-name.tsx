"use client";

import { useAccountSession } from "./account-session-context";

export default function HeaderCompanyName() {
  const { session } = useAccountSession();
  const companyName = session?.organization?.organizationName || "Overhead";

  return <h1>{companyName}</h1>;
}
