"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { setCompletionsWallet } from "@/lib/completions";

/**
 * Bind quest completion ledger to the connected wagmi address.
 * Must render under WagmiProvider. Switching wallets refreshes map/profile.
 */
export function WalletCompletionsSync() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    setCompletionsWallet(isConnected && address ? address : null);
  }, [address, isConnected]);

  return null;
}
