"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { type ReactNode, useEffect } from "react";
import {
  accountKeyFromSessionUser,
  migrateGuestDataToAccount,
  setAccountKey,
} from "@/lib/auth/accountScope";

function AccountScopeSync({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    const key = accountKeyFromSessionUser(session?.user ?? null);
    if (key) {
      migrateGuestDataToAccount(key);
      setAccountKey(key);
    } else {
      setAccountKey(null);
    }
  }, [session, status]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AccountScopeSync>{children}</AccountScopeSync>
    </SessionProvider>
  );
}
