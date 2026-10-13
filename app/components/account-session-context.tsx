"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AccountSession } from "@/app/lib/account";

type AccountSessionContextValue = {
  session: AccountSession | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  updateSessionLocally: (updater: (prev: AccountSession | null) => AccountSession | null) => void;
};

const AccountSessionContext = createContext<AccountSessionContextValue | null>(null);

export function AccountSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/account/session");
      if (res.ok) {
        const data = await res.json();
        setSession(data as AccountSession);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSessionLocally = useCallback((updater: (prev: AccountSession | null) => AccountSession | null) => {
    setSession(updater);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  return (
    <AccountSessionContext.Provider value={{ session, loading, refreshSession, updateSessionLocally }}>
      {children}
    </AccountSessionContext.Provider>
  );
}

export function useAccountSession() {
  const ctx = useContext(AccountSessionContext);
  if (!ctx) {
    throw new Error("useAccountSession must be used within an AccountSessionProvider");
  }
  return ctx;
}
