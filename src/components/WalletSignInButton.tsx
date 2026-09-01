"use client";

import { signIn } from "next-auth/react";
import { useCallback, useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { blockdag } from "@/lib/chain";
import {
  buildWalletSignInMessage,
  randomNonce,
} from "@/lib/auth/walletMessage";

export function WalletSignInButton({
  callbackUrl = "/garage",
}: {
  callbackUrl?: string;
}) {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return (
      <button type="button" className="btn-primary w-full" disabled>
        Sign in with wallet
      </button>
    );
  }
  return <WalletSignInInner callbackUrl={callbackUrl} />;
}

function WalletSignInInner({ callbackUrl }: { callbackUrl: string }) {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ensureConnected = useCallback(async () => {
    if (isConnected && address) return address;
    const inj =
      connectors.find((c) => c.id === "injected" || c.type === "injected") ?? null;
    if (!inj) {
      throw new Error("No browser wallet found. Install MetaMask or open in a wallet browser.");
    }
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!eth) {
      throw new Error("No browser wallet found. Install MetaMask or open in a wallet browser.");
    }
    const result = await connectAsync({ connector: inj, chainId: blockdag.id });
    return result.accounts[0];
  }, [address, connectAsync, connectors, isConnected]);

  const onSignIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const addr = await ensureConnected();
      if (!addr) throw new Error("Wallet not connected");
      const nonce = randomNonce();
      const message = buildWalletSignInMessage({ address: addr, nonce });
      const signature = await signMessageAsync({ message });
      const res = await signIn("wallet", {
        address: addr,
        message,
        signature,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        throw new Error(res.error === "CredentialsSignin" ? "Signature rejected." : res.error);
      }
      if (res?.url) {
        window.location.href = res.url;
      } else {
        window.location.href = callbackUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet sign-in failed");
    } finally {
      setBusy(false);
    }
  }, [callbackUrl, ensureConnected, signMessageAsync]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || connecting || signing}
        onClick={() => void onSignIn()}
      >
        {busy || connecting || signing
          ? "Signing…"
          : isConnected
            ? "Sign in with connected wallet"
            : "Sign in with wallet"}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <p className="text-[11px] text-slate-500">
        Primary login — works without email or Redis. You&apos;ll sign a short message
        (&quot;Sign in to OVERLANDCOIN&quot;). No gas fee.
      </p>
    </div>
  );
}
