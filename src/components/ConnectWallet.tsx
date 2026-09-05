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
import { walletConnectEnabled } from "@/lib/wagmi";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS desktop UA with touch
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
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
  "No wallet detected. Install OKX, Trust, Rabby, Coinbase, Bitget, or MetaMask — or connect with WalletConnect from this page. External deposits (USDT/ETH/BTC/SOL) work without a BlockDAG wallet.";

const WC_MISSING_MOBILE_MSG =
  "WalletConnect isn’t configured yet on this deployment (set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID). Injected wallets still work if your browser has one.";

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
  const [isMobile, setIsMobile] = useState(false);
  const autoSwitchedFor = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsMobile(isMobileBrowser());
    const ids = detectedInjectedWalletIds();
    setDetectedIds(ids);
    setHasWallet(ids.length > 0 || Boolean(getAnyInjectedProvider()));
  }, []);

  const wrongNetwork = isConnected && chainId !== TOKEN.chainId;

  const menuConnectors = useMemo(() => {
    const list: Connector[] = [];
    const seen = new Set<string>();
    const detected = new Set<string>(detectedIds);

    // WalletConnect first whenever the connector exists
    for (const c of connectors) {
      if (c.id === "walletConnect" && !seen.has(c.uid)) {
        list.push(c);
        seen.add(c.uid);
      }
    }

    for (const c of connectors) {
      if (seen.has(c.uid)) continue;
      if (c.id === "walletConnect") continue;
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
  const hasWcConnector = connectors.some((c) => c.id === "walletConnect");

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

  const showNoWalletGuidance = useCallback(() => {
    setMenuOpen(false);
    if (!walletConnectEnabled && isMobileBrowser()) {
      setLocalError(WC_MISSING_MOBILE_MSG);
      return;
    }
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
          showNoWalletGuidance();
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
          showNoWalletGuidance();
        } else {
          setLocalError(msg);
        }
      }
    },
    [connectAsync, showNoWalletGuidance],
  );

  const onPrimaryClick = useCallback(async () => {
    setLocalError(null);
    if (!mounted) return;

    const ids = detectedInjectedWalletIds();
    setDetectedIds(ids);
    const ethNow = ids.length > 0 || Boolean(getAnyInjectedProvider());
    setHasWallet(ethNow);
    const mobile = isMobileBrowser();
    setIsMobile(mobile);

    const wc = connectors.find((c) => c.id === "walletConnect");

    // Mobile Safari/Chrome with no injected wallet: open WalletConnect directly
    if (mobile && !ethNow) {
      if (wc) {
        await connectWith(wc);
        return;
      }
      showNoWalletGuidance();
      return;
    }

    if (!ethNow && !wc) {
      showNoWalletGuidance();
      return;
    }

    // Rebuild visible list after fresh detection (WC first)
    const visible: Connector[] = [];
    if (wc) visible.push(wc);
    for (const c of connectors) {
      if (c.id === "walletConnect") continue;
      if (NAMED_IDS.has(c.id) && ids.includes(c.id as InjectedWalletId)) {
        visible.push(c);
        continue;
      }
      if ((c.id === "injected" || c.type === "injected") && ids.includes("injected")) {
        visible.push(c);
      }
    }

    if (visible.length > 1) {
      setMenuOpen((v) => !v);
      return;
    }

    const target = visible[0] ?? primaryConnector;
    if (!target) {
      showNoWalletGuidance();
      return;
    }
    await connectWith(target);
  }, [mounted, connectors, primaryConnector, connectWith, showNoWalletGuidance]);

  const displayError = localError || connectError?.message || null;
  const showWcMissingHint = !walletConnectEnabled && (isMobile || displayError === WC_MISSING_MOBILE_MSG);
  const showInstallHint =
    Boolean(displayError) &&
    (!hasWallet || displayError === INSTALL_MSG || displayError === WC_MISSING_MOBILE_MSG);

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
              {c.id === "walletConnect" ? (
                <span className="ml-auto text-[10px] text-slate-500">QR / wallet app</span>
              ) : null}
            </button>
          ))}
          {!hasWcConnector && (
            <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-amber-200/90">
              WalletConnect isn’t configured yet. On mobile Safari/Chrome, set{" "}
              <span className="font-mono text-[10px]">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span> to
              connect without an in-app browser.
            </p>
          )}
          <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-slate-500">
            Prefer WalletConnect (QR or open wallet app) from this page on mobile. Use a wallet that
            supports BlockDAG 1404 with a send-capable RPC (west/east). No BlockDAG wallet? Buy via
            external USDT/ETH/BTC/SOL deposit on Presale.
          </p>
        </div>
      )}

      {displayError && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-red-500/40 bg-bg-deep p-3 text-[11px] text-red-300 shadow-gold">
          <p className="font-medium text-red-200">Could not connect</p>
          <p className="mt-1 break-words">{displayError}</p>
          {showInstallHint && (
            <div className="mt-2 space-y-1 border-t border-border pt-2 text-slate-400">
              {showWcMissingHint || displayError === WC_MISSING_MOBILE_MSG ? (
                <p>
                  WalletConnect isn’t configured yet. Add{" "}
                  <span className="font-mono text-[10px] text-slate-300">
                    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
                  </span>{" "}
                  in Vercel to connect from mobile Safari/Chrome via QR / wallet app. Injected wallets
                  still work if present.
                </p>
              ) : (
                <>
                  <p>
                    Use <span className="text-gold-bright">WalletConnect</span> from this page (QR or
                    open your wallet app), or install{" "}
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
                    . External deposits on Presale work without a BlockDAG wallet.
                  </p>
                  {!hasWcConnector && (
                    <p className="text-amber-200/90">
                      WalletConnect isn’t configured on this deployment yet.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
