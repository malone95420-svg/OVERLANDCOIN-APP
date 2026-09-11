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
import { blockdag } from "@/lib/chain";
import { EAST_RPC } from "@/lib/blockdagRpc";
import {
  connectorDisplayName,
  detectedInjectedWalletIds,
  getAnyInjectedProvider,
  type Eip1193Provider,
  type InjectedWalletId,
} from "@/lib/injectedWallets";
import {
  blockdagRpcManualFixMessage,
  ensureBlockdagNetwork,
} from "@/components/presale/ensureNetworks";
import { TOKEN } from "@/lib/token";
import { walletConnectEnabled } from "@/lib/wagmi";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { WalletBalanceChip } from "@/components/WalletBalanceChip";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isInAppWalletBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Common wallet in-app browsers — prefer injected over WalletConnect QR.
  return /MetaMask|OKApp|OKX|Trust|Coinbase|BitKeep|Bitget|Rainbow|Phantom|imToken|TokenPocket|WebView/i.test(
    ua,
  );
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

function friendlyConnectError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "Connection failed. Try again.";
  if (/rejected|denied|canceled|cancelled/i.test(msg)) return "Connection canceled in wallet.";
  if (/already pending|request already/i.test(msg)) return "A wallet request is already open — check your wallet app.";
  if (/disconnect.*(wallet|metamask|extension)|other wallet|disable.*(metamask|wallet)/i.test(msg)) {
    return "OKX is fighting another browser wallet. Use the OKX Wallet button here (not Browser wallet), or pause MetaMask/Rabby for this site.";
  }
  if (/session.*expired|proposal.*expired|QR.*expired/i.test(msg)) {
    return "WalletConnect session expired. Tap Connect again and approve in your wallet.";
  }
  if (/User disapproved|Connection request reset/i.test(msg)) {
    return "Connection canceled. Tap Connect and approve in your wallet.";
  }
  if (/Chain mismatch|unsupported chain|chain not configured/i.test(msg)) {
    return `Wallet needs BlockDAG Mainnet (chain ${TOKEN.chainId}). Tap Switch / Fix network after connecting.`;
  }
  // Strip noisy viem / WC stacks for mobile
  if (msg.length > 220) return `${msg.slice(0, 200).trim()}…`;
  return msg;
}

const INSTALL_MSG =
  "No wallet detected. On mobile Safari use WalletConnect (QR / open wallet app). Or open this site inside MetaMask, OKX, or Trust. External deposits (USDT/ETH/BTC/SOL) work without a BlockDAG wallet.";

const NAMED_IDS = new Set<string>(["okx", "trust", "rabby", "coinbase", "bitget"]);

function ConnectWalletButton({
  disabled,
  label = "Connect Wallet",
  compact = false,
}: {
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn-primary !py-2 !text-xs ${compact ? "!px-2.5 sm:!px-5" : ""}`}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

/** Outer shell: no wagmi hooks until Web3Provider is client-mounted. */
export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return (
      <ConnectWalletButton
        disabled
        compact={compact}
        label={compact ? "Connect" : "Connect Wallet"}
      />
    );
  }
  return <ConnectWalletInner compact={compact} />;
}

function ConnectWalletInner({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, status, connector: activeConnector } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [detectedIds, setDetectedIds] = useState<InjectedWalletId[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const preparedFor = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsMobile(isMobileBrowser());
    const ids = detectedInjectedWalletIds();
    setDetectedIds(ids);
    setHasWallet(ids.length > 0 || Boolean(getAnyInjectedProvider()));
  }, []);

  // Close menu on outside tap / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = menuRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const wrongNetwork = isConnected && chainId !== TOKEN.chainId;
  const isWcActive = activeConnector?.id === "walletConnect";

  const menuConnectors = useMemo(() => {
    const list: Connector[] = [];
    const seen = new Set<string>();
    const detected = new Set<string>(detectedIds);
    const mobile = isMobile;
    const inApp = typeof navigator !== "undefined" && isInAppWalletBrowser();

    // In-app / detected injected: show those first. Otherwise WC first for Safari.
    const preferInjected = inApp || (detected.size > 0 && !mobile);

    const pushWc = () => {
      for (const c of connectors) {
        if (c.id === "walletConnect" && !seen.has(c.uid)) {
          list.push(c);
          seen.add(c.uid);
        }
      }
    };
    const pushInjected = () => {
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
    };

    if (preferInjected) {
      pushInjected();
      pushWc();
    } else {
      pushWc();
      pushInjected();
    }
    return list;
  }, [connectors, detectedIds, isMobile]);

  const primaryConnector = menuConnectors[0] ?? null;
  const hasWcConnector = connectors.some((c) => c.id === "walletConnect");

  const resolveActiveProvider = useCallback(async () => {
    return (
      (await providerFromConnector(activeConnector)) ??
      getAnyInjectedProvider() ??
      null
    );
  }, [activeConnector]);

  /** One control: switch/add + force east→west RPC refresh. */
  const onFixNetwork = useCallback(async () => {
    setNetError(null);
    setFixing(true);
    let ensureFailedMsg: string | null = null;
    try {
      const provider = await resolveActiveProvider();
      const wc = activeConnector?.id === "walletConnect";
      try {
        await ensureBlockdagNetwork(provider, {
          forceRpcRefresh: true,
          isWalletConnect: wc,
        });
      } catch (e) {
        if (/rejected|canceled|cancelled/i.test(e instanceof Error ? e.message : "")) {
          throw e;
        }
        ensureFailedMsg =
          e instanceof Error ? e.message : blockdagRpcManualFixMessage(wc);
      }
      try {
        await switchChainAsync({ chainId: blockdag.id });
      } catch (e) {
        if (!ensureFailedMsg) {
          ensureFailedMsg =
            e instanceof Error
              ? friendlyConnectError(e.message)
              : `Could not switch to BlockDAG (chain ${TOKEN.chainId}).`;
        }
      }
      if (ensureFailedMsg) setNetError(ensureFailedMsg);
    } catch (e) {
      setNetError(
        e instanceof Error
          ? friendlyConnectError(e.message)
          : "Could not switch to BlockDAG",
      );
    } finally {
      setFixing(false);
    }
  }, [switchChainAsync, resolveActiveProvider, activeConnector]);

  // After connect: optional silent ensure network — do NOT force RPC re-add dance
  // (that theater was blocking Buy / causing cancels). Explicit "Fix BDAG" still forces.
  useEffect(() => {
    if (!isConnected || !address) {
      preparedFor.current = null;
      return;
    }
    const key = `${address.toLowerCase()}:${activeConnector?.id ?? "unknown"}`;
    if (preparedFor.current === key) return;
    preparedFor.current = key;
    setNetError(null);
    void (async () => {
      try {
        const provider = await resolveActiveProvider();
        const wc = activeConnector?.id === "walletConnect";
        // Soft: switch/add only if needed; never forceRpcRefresh on connect.
        await ensureBlockdagNetwork(provider, {
          forceRpcRefresh: false,
          isWalletConnect: wc,
        });
        if (chainId !== TOKEN.chainId) {
          try {
            await switchChainAsync({ chainId: blockdag.id });
          } catch {
            /* optional — user can Fix later; Buy soft-switches */
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // Silent on auto-prepare — don't surface rejected/network noise or block Buy
        if (msg && !/rejected|canceled|cancelled/i.test(msg)) {
          /* keep quiet; wrong-network button still available */
        }
      }
    })();
    // Intentionally omit chainId from deps — we only auto-prepare once per session key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, activeConnector?.id, resolveActiveProvider, switchChainAsync]);

  const showNoWalletGuidance = useCallback(() => {
    setMenuOpen(false);
    setLocalError(INSTALL_MSG);
  }, []);

  const connectWith = useCallback(
    async (connector: Connector) => {
      setLocalError(null);
      setNetError(null);

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
        if (isConnected && activeConnector && activeConnector.id !== connector.id) {
          try {
            await disconnectAsync();
          } catch {
            /* still try the new connector */
          }
        }
        await connectAsync({ connector, chainId: blockdag.id });
        // Payable-session prepare runs via the isConnected effect.
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        if (/rejected|denied|canceled|cancelled/i.test(msg)) {
          setLocalError("Connection canceled in wallet");
        } else if (!getAnyInjectedProvider() && connector.id !== "walletConnect") {
          showNoWalletGuidance();
        } else {
          setLocalError(friendlyConnectError(msg));
        }
      }
    },
    [connectAsync, showNoWalletGuidance, isConnected, activeConnector, disconnectAsync],
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
    const inApp = isInAppWalletBrowser();

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

    // In-app wallet browser: go straight to injected (skip WC QR)
    if (ethNow && (inApp || (mobile && ethNow))) {
      const injectedTarget =
        connectors.find((c) => NAMED_IDS.has(c.id) && ids.includes(c.id as InjectedWalletId)) ??
        connectors.find(
          (c) =>
            (c.id === "injected" || c.type === "injected") && ids.includes("injected"),
        );
      if (injectedTarget && (inApp || ids.length === 1)) {
        await connectWith(injectedTarget);
        return;
      }
    }

    if (!ethNow && !wc) {
      showNoWalletGuidance();
      return;
    }

    // Rebuild visible list after fresh detection
    const visible: Connector[] = [];
    const preferInjected = inApp || (ethNow && !mobile);
    const pushWc = () => {
      if (wc) visible.push(wc);
    };
    const pushInj = () => {
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
    };
    if (preferInjected) {
      pushInj();
      pushWc();
    } else {
      pushWc();
      pushInj();
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

  const onDisconnect = useCallback(async () => {
    setLocalError(null);
    setNetError(null);
    setMenuOpen(false);
    preparedFor.current = null;
    try {
      await disconnectAsync();
    } catch {
      /* ignore */
    }
  }, [disconnectAsync]);

  const displayError = localError || (connectError?.message ? friendlyConnectError(connectError.message) : null);
  const showInstallHint =
    Boolean(displayError) &&
    (!hasWallet || displayError === INSTALL_MSG);

  if (isConnected && address) {
    return (
      <div className="relative flex min-w-0 items-center gap-1 sm:gap-2">
        {!wrongNetwork && (
          <WalletBalanceChip compact={compact} showOlc className="max-w-[9.5rem] sm:max-w-none" />
        )}
        {wrongNetwork && (
          <button
            type="button"
            onClick={() => void onFixNetwork()}
            disabled={isSwitching || fixing}
            className={`btn-primary !py-1.5 !text-xs ${compact ? "!px-2 sm:!px-3" : ""}`}
            title={`Switch to BlockDAG and set RPC to ${EAST_RPC}`}
          >
            {isSwitching || fixing ? "Switching…" : compact ? "Fix BDAG" : "Switch / Fix BlockDAG"}
          </button>
        )}
        {!wrongNetwork && fixing && (
          <span className="hidden text-[10px] text-slate-500 sm:inline">Updating network…</span>
        )}
        <button
          type="button"
          onClick={() => void onDisconnect()}
          className={`btn-secondary min-w-0 truncate !py-1.5 !text-xs ${compact ? "!px-2 sm:!px-5" : ""}`}
          title={`Connected on chain ${chainId}${isWcActive ? " via WalletConnect" : ""} — tap to disconnect`}
        >
          {wrongNetwork && !compact ? "Wrong network · " : ""}
          {shortAddr(address)}
          <span className={`ml-1 text-slate-500 ${compact ? "hidden sm:inline" : ""}`}>
            Disconnect
          </span>
        </button>
        {netError && (
          <p className="absolute right-0 top-full z-20 mt-1 max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-amber-500/40 bg-bg-deep p-2 text-[11px] text-amber-100">
            {netError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className={`btn-primary !py-2 !text-xs ${compact ? "!px-2.5 sm:!px-5" : ""}`}
        disabled={isConnecting || status === "connecting" || !mounted}
        onClick={() => void onPrimaryClick()}
      >
        {isConnecting || status === "connecting"
          ? "Connecting…"
          : compact
            ? "Connect"
            : "Connect Wallet"}
      </button>

      {menuOpen && menuConnectors.length > 0 && (
        <div className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border border-border bg-bg-deep p-2 shadow-gold">
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Connect · BlockDAG {TOKEN.chainId}
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
              ) : (
                <span className="ml-auto text-[10px] text-slate-500">Browser</span>
              )}
            </button>
          ))}
          {!hasWcConnector && (
            <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-amber-200/90">
              WalletConnect isn’t available on this build. Use an in-app browser or set{" "}
              <span className="font-mono text-[10px]">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span>.
            </p>
          )}
          <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-slate-500">
            Mobile Safari: WalletConnect. In MetaMask/OKX/Trust: use Browser wallet. No BlockDAG
            wallet? Buy with USDT/ETH/BTC/SOL on Presale.
          </p>
        </div>
      )}

      {displayError && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(70vh,20rem)] overflow-y-auto rounded-xl border border-red-500/40 bg-bg-deep p-3 text-[11px] text-red-300 shadow-gold">
          <p className="font-medium text-red-200">Could not connect</p>
          <p className="mt-1 break-words">{displayError}</p>
          {showInstallHint && (
            <div className="mt-2 space-y-1 border-t border-border pt-2 text-slate-400">
              <p>
                Prefer <span className="text-gold-bright">WalletConnect</span> on Safari, or open
                this site in{" "}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  MetaMask
                </a>
                ,{" "}
                <a
                  href="https://www.okx.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  OKX
                </a>
                , or{" "}
                <a
                  href="https://trustwallet.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-bright underline"
                >
                  Trust
                </a>
                . Deposits on Presale work without a BlockDAG wallet.
              </p>
              {!walletConnectEnabled && (
                <p className="text-amber-200/90">WalletConnect isn’t configured on this deployment.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
