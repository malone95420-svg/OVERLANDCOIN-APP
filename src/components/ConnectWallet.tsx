"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { blockdag, blockdagAddChainParams } from "@/lib/chain";
import { TOKEN } from "@/lib/token";
import { hasWalletConnect } from "@/lib/wagmi";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function addBlockdagNetwork(): Promise<void> {
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth?.request) {
    throw new Error("No injected wallet found. Install MetaMask or another injected wallet.");
  }
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [blockdagAddChainParams()],
  });
}

export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const wrongNetwork = isConnected && chainId !== TOKEN.chainId;

  const onSwitch = useCallback(async () => {
    setNetError(null);
    try {
      await switchChainAsync({ chainId: blockdag.id });
    } catch {
      try {
        setAdding(true);
        await addBlockdagNetwork();
        await switchChainAsync({ chainId: blockdag.id });
      } catch (e) {
        setNetError(e instanceof Error ? e.message : "Could not switch to BlockDAG");
      } finally {
        setAdding(false);
      }
    }
  }, [switchChainAsync]);

  const onAdd = useCallback(async () => {
    setNetError(null);
    setAdding(true);
    try {
      await addBlockdagNetwork();
    } catch (e) {
      setNetError(e instanceof Error ? e.message : "Could not add BlockDAG");
    } finally {
      setAdding(false);
    }
  }, []);

  if (isConnected && address) {
    return (
      <div className={`relative flex items-center gap-2 ${compact ? "" : ""}`}>
        {wrongNetwork && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onSwitch}
              disabled={isSwitching || adding}
              className="btn-primary !py-1.5 !text-xs"
            >
              {isSwitching || adding ? "Switching…" : "Switch to BlockDAG"}
            </button>
            <button
              type="button"
              onClick={onAdd}
              disabled={adding}
              className="btn-secondary !py-1.5 !text-xs"
            >
              Add BlockDAG
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => disconnect()}
          className="btn-secondary !py-1.5 !text-xs"
          title={`Connected on chain ${chainId}`}
        >
          {wrongNetwork ? "Wrong network · " : ""}
          {shortAddr(address)}
          <span className="ml-1 text-slate-500">Disconnect</span>
        </button>
        {netError && (
          <p className="absolute right-0 top-full z-20 mt-1 max-w-xs rounded-lg border border-red-500/40 bg-bg-deep p-2 text-[11px] text-red-300">
            {netError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-primary !py-2 !text-xs"
        disabled={isConnecting || status === "connecting"}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-border bg-bg-deep p-2 shadow-gold">
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-slate-500">
            BlockDAG only (chain {TOKEN.chainId})
          </p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-bg-card"
              onClick={() => {
                connect({ connector: c, chainId: blockdag.id });
                setMenuOpen(false);
              }}
            >
              {c.name === "Injected" ? "MetaMask / Browser wallet" : c.name}
            </button>
          ))}
          {!hasWalletConnect && (
            <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-slate-500">
              WalletConnect unavailable (no project id configured). Injected wallets work.
            </p>
          )}
          {connectError && (
            <p className="mt-1 px-2 text-[11px] text-red-300">{connectError.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
