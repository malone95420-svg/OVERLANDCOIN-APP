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
import { hasWalletConnect } from "@/lib/wagmi";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function connectorLabel(name: string, id: string) {
  if (id === "metaMask" || name === "MetaMask") return "MetaMask";
  if (id === "injected" || name === "Injected") return "Browser wallet";
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
  "No wallet detected. Install MetaMask for desktop browsers. On mobile, WalletConnect needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.";

export function ConnectWallet({ compact = false }: { compact?: boolean }) {
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
    return (
      connectors.find((c) => c.id === "metaMask") ??
      connectors.find((c) => c.id === "injected" || c.type === "injected") ??
      null
    );
  }, [connectors]);

  const wcConnector = useMemo(() => {
    if (!hasWalletConnect) return null;
    return connectors.find((c) => c.id === "walletConnect" || c.type === "walletConnect") ?? null;
  }, [connectors]);

  /** Deduped menu options: MetaMask preferred over generic injected; WC if configured. */
  const menuConnectors = useMemo(() => {
    const list = [];
    const mm = connectors.find((c) => c.id === "metaMask");
    const inj = connectors.find((c) => c.id === "injected");
    if (mm) list.push(mm);
    else if (inj) list.push(inj);
    if (wcConnector) list.push(wcConnector);
    return list;
  }, [connectors, wcConnector]);

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
        connector.id === "metaMask" ||
        connector.id === "injected" ||
        connector.type === "injected";

      // QA: clicking MetaMask/Browser with no window.ethereum must not silently close.
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
        // Common wagmi/provider-missing messages → install guidance
        if (
          !hasWindowEthereum() ||
          /provider|ethereum|not found|no injected|rejected/i.test(msg) && !hasWindowEthereum()
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

    if (!ethNow && !wcConnector) {
      showInstallError();
      return;
    }

    // Multiple distinct options → small menu
    if (menuConnectors.length > 1) {
      setMenuOpen((v) => !v);
      return;
    }

    // Single path: connect immediately to MetaMask / injected (or WC on mobile if configured)
    const target =
      (ethNow ? browserConnector : null) ?? wcConnector ?? menuConnectors[0] ?? null;
    if (!target) {
      showInstallError();
      return;
    }
    await connectWith(target);
  }, [
    mounted,
    wcConnector,
    menuConnectors,
    browserConnector,
    connectWith,
    showInstallError,
  ]);

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
          {!hasWalletConnect && (
            <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-slate-500">
              WalletConnect unavailable (no project id). Injected wallets work on desktop.
            </p>
          )}
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
              <p>
                On mobile, WalletConnect requires{" "}
                <code className="text-slate-300">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> in
                deployment env.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
