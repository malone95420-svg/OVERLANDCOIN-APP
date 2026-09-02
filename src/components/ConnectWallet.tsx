"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { blockdag, blockdagAddChainParams } from "@/lib/chain";
import {
  connectorDisplayName,
  detectedInjectedWalletIds,
  getAnyInjectedProvider,
  type Eip1193Provider,
  type InjectedWalletId,
} from "@/lib/injectedWallets";
import { TOKEN } from "@/lib/token";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function providerFromConnector(connector?: Connector | null): Promise<Eip1193Provider | undefined> {
  if (!connector) return undefined;
  try {
    const p = (await connector.getProvider()) as Eip1193Provider | undefined;
    return p?.request ? p : undefined;
  } catch {
    return undefined;
  }
}

async function addBlockdagNetwork(provider?: Eip1193Provider | null): Promise<void> {
  const eth = provider ?? getAnyInjectedProvider();
  if (!eth?.request) {
    throw new Error("No wallet provider found. Install a BlockDAG-compatible wallet (OKX, Trust, MetaMask, …).");
  }
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [blockdagAddChainParams()],
  });
}

const INSTALL_MSG =
  "No wallet detected. Install OKX, Trust, Rabby, Coinbase, Bitget, or MetaMask — or open this site in a wallet browser. External deposits (USDT/ETH/BTC/SOL) work without a BlockDAG wallet.";

const NAMED_IDS = new Set<string>(["okx", "trust", "rabby", "coinbase", "bitget"]);

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
  const { address, isConnected, status, connector: activeConnector } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [detectedIds, setDetectedIds] = useState<InjectedWalletId[]>([]);
  const autoSwitchedFor = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const ids = detectedInjectedWalletIds();
    setDetectedIds(ids);
    setHasWallet(ids.length > 0 || Boolean(getAnyInjectedProvider()));
  }, []);

  const wrongNetwork = isConnected && chainId !== TOKEN.chainId;

  const menuConnectors = useMemo(() => {
    const list: Connector[] = [];
    const seen = new Set<string>();
    const detected = new Set<string>(detectedIds);

    for (const c of connectors) {
      if (seen.has(c.uid)) continue;
      if (c.id === "walletConnect") {
        list.push(c);
        seen.add(c.uid);
        continue;
      }
      if (NAMED_IDS.has(c.id)) {
        if (detected.has(c.id)) {
          list.push(c);
          seen.add(c.uid);
        }
        continue;
      }
      if (
        (c.id === "injected" || c.type === "injected") &&
        detected.has("injected") &&
        !NAMED_IDS.has(c.id)
      ) {
        list.push(c);
        seen.add(c.uid);
      }
    }
    return list;
  }, [connectors, detectedIds]);

  const primaryConnector = menuConnectors[0] ?? null;

  const resolveActiveProvider = useCallback(async () => {
    return (
      (await providerFromConnector(activeConnector)) ??
      getAnyInjectedProvider() ??
      null
    );
  }, [activeConnector]);

  const onSwitch = useCallback(async () => {
    setNetError(null);
    try {
      setAdding(true);
      const provider = await resolveActiveProvider();
      try {
        await addBlockdagNetwork(provider);
      } catch {
        // Chain may already exist.
      }
      await switchChainAsync({ chainId: blockdag.id });
    } catch (e) {
      setNetError(e instanceof Error ? e.message : "Could not switch to BlockDAG");
    } finally {
      setAdding(false);
    }
  }, [switchChainAsync, resolveActiveProvider]);

  const onAdd = useCallback(async () => {
    setNetError(null);
    setAdding(true);
    try {
      const provider = await resolveActiveProvider();
      await addBlockdagNetwork(provider);
    } catch (e) {
      setNetError(e instanceof Error ? e.message : "Could not add BlockDAG");
    } finally {
      setAdding(false);
    }
  }, [resolveActiveProvider]);

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
    async (connector: Connector) => {
      setLocalError(null);

      if (connector.id !== "walletConnect") {
        const ids = detectedInjectedWalletIds();
        setDetectedIds(ids);
        if (ids.length === 0 && !getAnyInjectedProvider()) {
          setHasWallet(false);
          showInstallError();
          return;
        }
      }

      setMenuOpen(false);
      try {
        await connectAsync({ connector, chainId: blockdag.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        if (/rejected|denied|canceled|cancelled/i.test(msg)) {
          setLocalError("Connection canceled in wallet");
        } else if (!getAnyInjectedProvider() && connector.id !== "walletConnect") {
          showInstallError();
        } else {
          setLocalError(msg);
        }
      }
    },
    [connectAsync, showInstallError],
  );

  const onPrimaryClick = useCallback(async () => {
    setLocalError(null);
    if (!mounted) return;

    const ids = detectedInjectedWalletIds();
    setDetectedIds(ids);
    const ethNow = ids.length > 0 || Boolean(getAnyInjectedProvider());
    setHasWallet(ethNow);

    const hasWc = connectors.some((c) => c.id === "walletConnect");
    if (!ethNow && !hasWc) {
      showInstallError();
      return;
    }

    // Rebuild visible list after fresh detection
    const visible = connectors.filter((c) => {
      if (c.id === "walletConnect") return true;
      if (NAMED_IDS.has(c.id)) return ids.includes(c.id as InjectedWalletId);
      return (c.id === "injected" || c.type === "injected") && ids.includes("injected");
    });

    if (visible.length > 1) {
      setMenuOpen((v) => !v);
      return;
    }

    const target = visible[0] ?? primaryConnector;
    if (!target) {
      showInstallError();
      return;
    }
    await connectWith(target);
  }, [mounted, connectors, primaryConnector, connectWith, showInstallError]);

  const displayError = localError || connectError?.message || null;

  if (isConnected && address) {
    return (
      <div className={`relative flex items-center gap-2 ${compact ? "" : ""}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {wrongNetwork ? (
            <>
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
                title="Re-add BlockDAG with send-capable RPCs (west + east)"
              >
                {adding ? "Adding…" : "Add BlockDAG"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={adding}
              className="btn-secondary !py-1.5 !text-xs"
              title="Re-offer BlockDAG with send-capable west/east RPCs on the connected wallet"
            >
              {adding ? "Updating…" : "Add BlockDAG"}
            </button>
          )}
        </div>
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
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-bg-deep p-2 shadow-gold">
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
              {connectorDisplayName(c.name, c.id)}
            </button>
          ))}
          <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-slate-500">
            Use a wallet that supports BlockDAG 1404 with a send-capable RPC (west/east). No BlockDAG
            wallet? Buy via external USDT/ETH/BTC/SOL deposit on Presale.
          </p>
        </div>
      )}

      {displayError && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-red-500/40 bg-bg-deep p-3 text-[11px] text-red-300 shadow-gold">
          <p className="font-medium text-red-200">Could not connect</p>
          <p className="mt-1 break-words">{displayError}</p>
          {(!hasWallet || displayError === INSTALL_MSG) && (
            <div className="mt-2 space-y-1 border-t border-border pt-2 text-slate-400">
              <p>
                Install{" "}
                <a
                  href="https://www.okx.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  OKX
                </a>
                ,{" "}
                <a
                  href="https://trustwallet.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  Trust
                </a>
                , or{" "}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  MetaMask
                </a>
                — or use external deposits on Presale.
              </p>
              <p>On mobile, open this site inside your wallet’s in-app browser.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
