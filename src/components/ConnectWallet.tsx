"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { blockdag, blockdagAddChainParams } from "@/lib/chain";
import { TOKEN } from "@/lib/token";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function connectorLabel(name: string, id: string) {
  if (id === "injected" || name === "Injected" || name === "MetaMask") return "Browser wallet";
  return name;
}

function hasWindowEthereum(): boolean {
  return Boolean((window as unknown as { ethereum?: unknown }).ethereum);
}

async function addBlockdagNetwork(): Promise<void> {
  const eth = (
    window as unknown as {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }
  ).ethereum;
  if (!eth?.request) {
    throw new Error("No injected wallet found. Install MetaMask or another injected wallet.");
  }
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [blockdagAddChainParams()],
  });
}

const INSTALL_MSG =
  "No wallet detected. Install MetaMask for desktop browsers or open this site in a wallet browser.";

function ConnectWalletButton({
  disabled,
  label = "Connect Wallet",
}: {
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button type="button" className="btn-primary !py-2 !text-xs" disabled={disabled}>
      {label}
    </button>
  );
}

/** Outer shell: no wagmi hooks until Web3Provider is client-mounted. */
export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return <ConnectWalletButton disabled label="Connect Wallet" />;
  }
  return <ConnectWalletInner compact={compact} />;
}

function ConnectWalletInner({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [hasEthereum, setHasEthereum] = useState(false);
  const [mounted, setMounted] = useState(false);
  const autoSwitchedFor = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setHasEthereum(hasWindowEthereum());
  }, []);

  const wrongNetwork = isConnected && chainId !== TOKEN.chainId;

  const browserConnector = useMemo(() => {
    return connectors.find((c) => c.id === "injected" || c.type === "injected") ?? null;
  }, [connectors]);

  const menuConnectors = useMemo(() => {
    const list = [];
    const inj = connectors.find((c) => c.id === "injected" || c.type === "injected");
    if (inj) list.push(inj);
    return list;
  }, [connectors]);

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

  // After connect, auto-prompt Switch/Add BlockDAG if wrong chain (once per address).
  useEffect(() => {
    if (!isConnected || !address || !wrongNetwork) {
      if (!isConnected) autoSwitchedFor.current = null;
      return;
    }
    if (autoSwitchedFor.current === address) return;
    autoSwitchedFor.current = address;
    void onSwitch();
  }, [isConnected, address, wrongNetwork, onSwitch]);

  const showInstallError = useCallback(() => {
    setMenuOpen(false);
    setLocalError(INSTALL_MSG);
  }, []);

  const connectWith = useCallback(
    async (connector: (typeof connectors)[number]) => {
      setLocalError(null);
      const isBrowserWallet =
        connector.id === "injected" || connector.type === "injected";

      // QA: clicking Browser wallet with no window.ethereum must not crash.
      if (isBrowserWallet && !hasWindowEthereum()) {
        setHasEthereum(false);
        showInstallError();
        return;
      }

      setMenuOpen(false);
      try {
        await connectAsync({ connector, chainId: blockdag.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        if (
          !hasWindowEthereum() ||
          (/provider|ethereum|not found|no injected/i.test(msg) && !hasWindowEthereum())
        ) {
          showInstallError();
        } else {
          setLocalError(msg);
        }
      }
    },
    [connectAsync, showInstallError]
  );

  const onPrimaryClick = useCallback(async () => {
    setLocalError(null);
    if (!mounted) return;

    const ethNow = hasWindowEthereum();
    setHasEthereum(ethNow);

    if (!ethNow) {
      showInstallError();
      return;
    }

    if (menuConnectors.length > 1) {
      setMenuOpen((v) => !v);
      return;
    }

    const target = browserConnector ?? menuConnectors[0] ?? null;
    if (!target) {
      showInstallError();
      return;
    }
    await connectWith(target);
  }, [mounted, menuConnectors, browserConnector, connectWith, showInstallError]);

  const displayError = localError || connectError?.message || null;

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
        disabled={isConnecting || status === "connecting" || !mounted}
        onClick={() => void onPrimaryClick()}
      >
        {isConnecting || status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>

      {menuOpen && menuConnectors.length > 0 && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-bg-deep p-2 shadow-gold">
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-slate-500">
            BlockDAG only (chain {TOKEN.chainId})
          </p>
          {menuConnectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-bg-card"
              onClick={() => void connectWith(c)}
            >
              {connectorLabel(c.name, c.id)}
            </button>
          ))}
          <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-slate-500">
            Uses the browser injected wallet (MetaMask, etc.).
          </p>
        </div>
      )}

      {displayError && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-red-500/40 bg-bg-deep p-3 text-[11px] text-red-300 shadow-gold">
          <p className="font-medium text-red-200">Could not connect</p>
          <p className="mt-1 break-words">{displayError}</p>
          {(!hasEthereum || displayError === INSTALL_MSG) && (
            <div className="mt-2 space-y-1 border-t border-border pt-2 text-slate-400">
              <p>
                No browser wallet detected.{" "}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  Install MetaMask
                </a>
                .
              </p>
              <p>On mobile, open this site inside the MetaMask in-app browser.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
