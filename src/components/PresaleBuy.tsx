"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits, type Address, type Hash } from "viem";
import { waitForBlockdagReceipt } from "@/lib/waitForBlockdagReceipt";
import { AddOlcButton } from "@/components/AddOlcButton";
import { ConnectWallet } from "@/components/ConnectWallet";
import { CopyAddress } from "@/components/CopyAddress";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { useLivePrices } from "@/hooks/useLivePrices";
import {
  liveUsdForAsset,
  rateReadyForBuy,
  sourceLabelForAsset,
  type AcceptedPayAsset,
} from "@/lib/acceptedPayAssets";
import {
  calcOlcFromPay,
  calcPayFromOlc,
  formatUsdPrice,
} from "@/lib/livePrices";
import {
  listPendingLockCredits,
  loadPurchases,
  loadPurchasesForWallet,
  removePurchase,
  savePurchase,
  updatePurchase,
  type LocalPurchase,
} from "@/lib/purchases";
import {
  clearOpenPayOrder,
  listOpenPayOrdersForBuyer,
  saveOpenPayOrder,
  updateOpenPayOrderHint,
} from "@/lib/openPayOrders";
import { friendlyPaymentError, parsePaymentTxRef } from "@/lib/parsePaymentTxRef";
import { getAnyInjectedProvider, getEthereumPaymentProvider } from "@/lib/injectedWallets";
import { blockdag } from "@/lib/chain";
import { PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerTxUrl, explorerAddressUrl } from "@/lib/token";
import {
  getCheckoutPayAssets,
  isEvmDepositAsset,
  isOnChainAsset,
  payChainForAsset,
  qrUrl,
} from "@/components/presale/checkoutAssets";
import {
  getInjectedSolanaProvider,
  sendNativeSolTransfer,
} from "@/lib/solanaNativeTransfer";
import {
  blockdagRpcManualFixMessage,
  ensureBlockdagNetwork,
  ensureEthereumMainnet,
  noInjectedProviderMessage,
  EAST_RPC,
} from "@/components/presale/ensureNetworks";
import {
  formatWalletError,
  isUserRejection,
  walletErrorCode,
} from "@/components/presale/walletErrors";
import { useWalletBalances } from "@/hooks/useWalletBalances";

function isDeliverOk(status?: string): boolean {
  return status === "delivered" || status === "locked";
}

type InputMode = "olc" | "pay";
type Progress =
  | null
  | "switching_network"
  | "creating_order"
  | "confirm_wallet"
  | "confirming_payment"
  | "locking_olc";

type ActivePayOrder = {
  orderId: string;
  buyer: string;
  payAsset: string;
  payAmount: number;
  olcAmount: number;
  depositAddress: string;
  depositNetwork: string;
  expiresAt: number;
  usdPaid?: number;
};

/** Ethereum mainnet ERC-20 deposit tokens. */
const ETH_MAINNET_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address;
const ETH_MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;

function liveBatch() {
  return PRESALE_BATCHES.find((b) => b.status === "LIVE") ?? PRESALE_BATCHES[0];
}

function formatNum(n: number, maxFrac = 6): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** iOS Safari (no injected wallet) — always show clear manual deposit path. */
function isMobileSafariNoWallet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/i.test(ua);
  const other = /(CriOS|FxiOS|OPiOS|EdgiOS|Chrome|Firefox|Android)/i.test(ua);
  return iOS && webkit && !other;
}

function progressLabel(p: Progress): string | null {
  switch (p) {
    case "switching_network":
      return "Switching network…";
    case "creating_order":
      return "Creating order…";
    case "confirm_wallet":
      return "Confirm in wallet…";
    case "confirming_payment":
      return "Confirming payment…";
    case "locking_olc":
      return "Delivering OLC…";
    default:
      return null;
  }
}

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: { toString(): string };
      connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
      signAndSendTransaction?: (
        transaction: unknown,
        opts?: { skipPreflight?: boolean },
      ) => Promise<{ signature: string } | string>;
    };
    phantom?: {
      solana?: Window["solana"];
    };
  }
}

export function PresaleBuy() {
  const web3Mounted = useWeb3Mounted();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 2000);
    return () => window.clearTimeout(id);
  }, []);

  if (!web3Mounted) {
    // Avoid infinite "Loading wallet…" when wagmi fails / ErrorBoundary strips provider
    if (!waited) {
      return (
        <div className="rounded-xl border border-border bg-bg-card p-6 text-sm text-slate-400">
          Loading wallet…
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-border bg-bg-card p-6 text-sm text-slate-300 space-y-2">
        <p className="font-medium text-white">Wallet connector unavailable</p>
        <p className="text-slate-400">
          Refresh the page to retry Connect Wallet. You can still prepare an external USDT / ETH /
          BTC / SOL deposit from a desktop browser with an injected wallet, or try again shortly.
        </p>
      </div>
    );
  }
  return <PresaleBuyInner />;
}

function PresaleBuyInner() {
  const batch = liveBatch();
  const batchPrice = batch.priceUsdt;
  const assets = useMemo(() => getCheckoutPayAssets(), []);
  const prices = useLivePrices();

  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;
  const { switchChainAsync } = useSwitchChain();
  // Locked-balance polling retired (wallet delivery only — do not hit /api/presale/locked-balance).
  const walletBal = useWalletBalances({ includeOlc: true });

  const [assetId, setAssetId] = useState<AcceptedPayAsset["id"]>(
    () => assets[0]?.id ?? "BDAG",
  );
  const [mode, setMode] = useState<InputMode>("olc");
  const [olcInput, setOlcInput] = useState("1000");
  const [payInput, setPayInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<Hash | undefined>();
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [successExplorer, setSuccessExplorer] = useState<string | null>(null);
  const [pendingLockRetryTx, setPendingLockRetryTx] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActivePayOrder | null>(null);
  /** Silent background poll looking for deposit without tx hash */
  const [autoLooking, setAutoLooking] = useState(false);
  /** True when BDAG on-chain send is blocked by wallet RPC (WC / stale RPC) — offer deposit path. */
  const [bdagRpcBlocked, setBdagRpcBlocked] = useState(false);
  const confirmInFlight = useRef(false);
  const activeOrderRef = useRef<ActivePayOrder | null>(null);
  const depositTxHashRef = useRef("");
  /** True only when an in-page Solana provider is present — never deep-link. */
  const [hasInjectedSolana, setHasInjectedSolana] = useState(false);

  const selected = assets.find((a) => a.id === assetId) ?? assets[0];
  const onChain = selected ? isOnChainAsset(selected) : false;

  useEffect(() => {
    setBdagRpcBlocked(false);
  }, [assetId]);

  const usdPerPayUnit = selected ? liveUsdForAsset(selected, prices) : null;
  const rateSource = selected ? sourceLabelForAsset(selected, prices) : "—";
  const buyRateReady = selected ? rateReadyForBuy(selected, prices) : false;
  const fracDigits = selected?.id === "BDAG" ? 8 : selected?.id === "BTC" ? 2 : 4;

  const onChainAddress =
    selected?.onChain?.kind === "erc20" ? selected.onChain.address : undefined;
  const decimalsHint =
    selected?.onChain?.kind === "native"
      ? selected.onChain.decimalsHint
      : selected?.onChain?.kind === "erc20"
        ? selected.onChain.decimalsHint
        : 18;

  const { data: onChainDecimals } = useReadContract({
    address: onChainAddress,
    abi: erc20Abi,
    functionName: "decimals",
    query: {
      enabled: Boolean(onChainAddress) && onCorrectChain && onChain,
    },
  });

  const decimals =
    typeof onChainDecimals === "number"
      ? onChainDecimals
      : typeof onChainDecimals === "bigint"
        ? Number(onChainDecimals)
        : decimalsHint;

  useEffect(() => {
    setPurchases(loadPurchasesForWallet(address));
    // Hang affiliate ?ref= off real checkout URL (local only until backend exists)
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^OLC[A-Z0-9]{6,12}$/i.test(ref)) {
        localStorage.setItem("overlandcoin.affiliateRef.v1", ref.toUpperCase());
      }
    } catch {
      /* ignore */
    }
    const pending = listPendingLockCredits(address);
    if (pending.length > 0) {
      setPendingLockRetryTx(pending[0].txHash);
      setSuccessNote(
        `You have ${pending.length} purchase(s) with payment confirmed but OLC wallet delivery still pending. Use Retry deliver to recover.`,
      );
    }
    const t = setInterval(() => setPurchases(loadPurchasesForWallet(address)), 8000);
    return () => clearInterval(t);
  }, [address]);

  useEffect(() => {
    function refresh() {
      setHasInjectedSolana(Boolean(getInjectedSolanaProvider()));
    }
    refresh();
    // Wallets often inject after first paint (Phantom fires solana#initialized).
    const onInit = () => refresh();
    window.addEventListener("solana#initialized", onInit);
    const poll = setInterval(refresh, 750);
    const stop = setTimeout(() => clearInterval(poll), 8000);
    return () => {
      window.removeEventListener("solana#initialized", onInit);
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, []);


  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    depositTxHashRef.current = depositTxHash;
  }, [depositTxHash]);

  /**
   * While a pay-order card is open: auto-poll confirm (no pasted tx required).
   * Also re-check on tab focus / visibility. Stops when credited, expired, or canceled.
   */
  useEffect(() => {
    if (!activeOrder) {
      setAutoLooking(false);
      return;
    }
    if (Date.now() > activeOrder.expiresAt) {
      clearOpenPayOrder(activeOrder.orderId);
      setActiveOrder(null);
      setAutoLooking(false);
      setError("Pay order expired — create a new Buy order with a fresh quote.");
      return;
    }

    setAutoLooking(true);
    let cancelled = false;
    const POLL_MS = 12_000;

    const tick = async () => {
      if (cancelled) return;
      const order = activeOrderRef.current;
      if (!order) return;
      if (Date.now() > order.expiresAt) {
        clearOpenPayOrder(order.orderId);
        setActiveOrder(null);
        setAutoLooking(false);
        setError("Pay order expired — create a new Buy order with a fresh quote.");
        return;
      }
      if (document.visibilityState === "hidden") return;
      const hint = (depositTxHashRef.current || "").trim() || undefined;
      await confirmOrder(order, hint, { silent: true });
    };

    const onFocus = () => {
      void tick();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };

    // First check shortly after card opens (wallet path may already be retrying)
    const first = window.setTimeout(() => void tick(), 4_000);
    const interval = window.setInterval(() => void tick(), POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // confirmOrder closes over latest buildRecord; activeOrder id drives restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?.orderId]);

  /** On wallet connect / page load: restore recent open orders + retry pending credits. */
  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;

    const run = async () => {
      // Restore newest unexpired local open order into the pay card
      try {
        const open = listOpenPayOrdersForBuyer(address);
        if (!cancelled && open.length > 0 && !activeOrderRef.current) {
          const o = open[0];
          setActiveOrder({
            orderId: o.orderId,
            buyer: o.buyer,
            payAsset: o.payAsset,
            payAmount: o.payAmount,
            olcAmount: o.olcAmount,
            depositAddress: o.depositAddress,
            depositNetwork: o.depositNetwork,
            expiresAt: o.expiresAt,
            usdPaid: o.usdPaid,
          });
          setAutoLooking(true);
          if (o.paymentTxHint) setDepositTxHash(o.paymentTxHint);
        }
      } catch {
        /* ignore */
      }

      // Retry pending wallet deliveries / open order: stubs
      const pending = listPendingLockCredits(address);
      const purchases = loadPurchases().filter((p) => {
        if (p.from && p.from.toLowerCase() !== address.toLowerCase()) return false;
        if (p.status === "delivered" || p.status === "locked") return false;
        if (p.txHash.startsWith("order:")) return true;
        return (
          p.status === "locked_pending_chain" || p.status === "pending_external"
        );
      });
      const seen = new Set<string>();
      for (const p of [...pending, ...purchases].slice(0, 5)) {
        if (cancelled) break;
        if (seen.has(p.txHash)) continue;
        seen.add(p.txHash);
        try {
          if (p.txHash.startsWith("order:")) {
            const orderId = p.txHash.slice("order:".length);
            const open = listOpenPayOrdersForBuyer(address).find(
              (o) => o.orderId === orderId,
            );
            if (open) {
              await confirmOrder(
                {
                  orderId: open.orderId,
                  buyer: open.buyer,
                  payAsset: open.payAsset,
                  payAmount: open.payAmount,
                  olcAmount: open.olcAmount,
                  depositAddress: open.depositAddress,
                  depositNetwork: open.depositNetwork,
                  expiresAt: open.expiresAt,
                  usdPaid: open.usdPaid,
                },
                open.paymentTxHint,
                { silent: true },
              );
            } else {
              // No open card: prefer deliver when we have a payment hash hint; else scan
              const payChain = payChainForAsset(p.payAsset || "ETH");
              const payAmt = Number(String(p.payAmount || "").replace(/,/g, ""));
              const hint =
                (typeof (p as { paymentTxHint?: string }).paymentTxHint === "string"
                  ? (p as { paymentTxHint?: string }).paymentTxHint
                  : undefined) ||
                (p.txHash && !p.txHash.startsWith("order:") ? p.txHash : undefined);
              let res: Response;
              if (hint && hint.length >= 10) {
                res = await fetch("/api/presale/deliver", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    buyer: address,
                    paymentTxHash: hint,
                    payAsset: p.payAsset,
                    payAmount: payAmt > 0 ? String(payAmt) : undefined,
                    payChain,
                    olcAmount: p.olcAmount,
                  }),
                });
              } else {
                res = await fetch("/api/presale/confirm-deposit", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    buyer: address,
                    payAsset: p.payAsset,
                    payAmount: payAmt > 0 ? payAmt : undefined,
                    chain: payChain,
                    olcAmount: p.olcAmount,
                  }),
                });
              }
              let data = (await res.json().catch(() => ({}))) as {
                status?: string;
                creditTxHash?: string;
                olcAmount?: number;
                paymentTxHash?: string;
                error?: string;
              };
              if (
                res.status === 404 ||
                !(isDeliverOk(data.status) && data.creditTxHash)
              ) {
                const orderRes = await fetch(
                  `/api/presale/orders/${encodeURIComponent(orderId)}/confirm`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(hint ? { paymentTxHash: hint } : {}),
                  },
                );
                const orderData = (await orderRes.json().catch(() => ({}))) as typeof data;
                if (isDeliverOk(orderData.status) && orderData.creditTxHash) {
                  data = orderData;
                }
              }
              if (isDeliverOk(data.status) && data.creditTxHash) {
                clearOpenPayOrder(orderId);
                setPurchases(
                  updatePurchase(p.txHash, {
                    status: "locked",
                    creditTxHash: data.creditTxHash,
                    olcAmount:
                      typeof data.olcAmount === "number"
                        ? data.olcAmount
                        : p.olcAmount,
                    deliveryNote: undefined,
                  }),
                );
                setPendingLockRetryTx(null);
                setSuccessNote(
                  `${formatNum(
                    typeof data.olcAmount === "number"
                      ? data.olcAmount
                      : p.olcAmount ?? 0,
                    4,
                  )} OLC sent to your BlockDAG wallet.`,
                );
                void walletBal.refetch();
              }
            }
          } else if (p.status === "locked_pending_chain") {
            await retryLockCredit(p.txHash);
          }
        } catch {
          /* best-effort resume */
        }
      }
    };

    const t = window.setTimeout(() => void run(), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  useEffect(() => {
    setError(null);
    // Drop in-progress checkout UI when pay asset changes (keep local open-order for resume)
    setActiveOrder(null);
    setDepositTxHash("");
    setAutoLooking(false);
    if (!pendingLockRetryTx) setSuccessNote(null);
    setSuccessExplorer(null);
    setMode("olc");
  }, [assetId]);

  const derived = useMemo(() => {
    const price = batchPrice;
    const rate = usdPerPayUnit;
    if (rate == null || !(rate > 0) || !(price > 0)) {
      return { olc: 0, usd: 0, payAmount: 0 };
    }
    if (mode === "olc") {
      const olc = Number(olcInput);
      if (!(olc > 0)) return { olc: 0, usd: 0, payAmount: 0 };
      const { usdPaid, payTokenAmount } = calcPayFromOlc({
        olcAmount: olc,
        usdPerPayUnit: rate,
        batchPriceUsdt: price,
      });
      return { olc, usd: usdPaid, payAmount: payTokenAmount };
    }
    const payAmount = Number(payInput);
    if (!(payAmount > 0)) return { olc: 0, usd: 0, payAmount: 0 };
    const { usdPaid, olcAmount } = calcOlcFromPay({
      payTokenAmount: payAmount,
      usdPerPayUnit: rate,
      batchPriceUsdt: price,
    });
    return { olc: olcAmount, usd: usdPaid, payAmount };
  }, [mode, olcInput, payInput, batchPrice, usdPerPayUnit]);

  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const buildRecord = useCallback(
    (opts: {
      txHash: string;
      status: LocalPurchase["status"];
      payMethod: "onchain" | "deposit";
      payAsset?: string;
      payAmount?: number;
      olc?: number;
      usd?: number;
      depositAddress?: string;
      depositNetwork?: string;
    }): LocalPurchase => {
      const rate = usdPerPayUnit ?? 0;
      const payAmt = opts.payAmount ?? derived.payAmount;
      const olcAmt = opts.olc ?? derived.olc;
      const usdAmt = opts.usd ?? derived.usd;
      return {
        id: `${Date.now()}-${opts.txHash.slice(0, 12)}`,
        txHash: opts.txHash,
        timestamp: Date.now(),
        from: address,
        payAsset: opts.payAsset ?? selected?.symbol ?? "BDAG",
        payAmount: formatNum(payAmt, 8),
        olcEstimated: formatNum(olcAmt, 4),
        olcAmount: olcAmt,
        batchPriceUsdt: batchPrice,
        batchPriceUsed: batchPrice,
        usdRateUsed: rate,
        usdPaid: Number(usdAmt.toFixed(8)),
        usdEstimated: Number(usdAmt.toFixed(8)),
        status: opts.status,
        payMethod: opts.payMethod,
        depositAddress: opts.depositAddress ?? selected?.depositAddress,
        depositNetwork: opts.depositNetwork ?? selected?.depositNetwork,
      };
    },
    [
      address,
      selected?.symbol,
      selected?.depositAddress,
      selected?.depositNetwork,
      derived.payAmount,
      derived.olc,
      derived.usd,
      batchPrice,
      usdPerPayUnit,
    ],
  );

  const deliverLocked = useCallback(
    async (
      paymentTxHash: string,
      opts?: { olc?: number; usd?: number; payAmount?: number; payAsset?: string; retryOnce?: boolean },
    ) => {
      const olc = opts?.olc ?? derived.olc;
      const usd = opts?.usd ?? derived.usd;
      const payAmt = opts?.payAmount ?? derived.payAmount;
      const payAsset = opts?.payAsset ?? selected?.symbol ?? "BDAG";
      const payChain = payChainForAsset(payAsset);

      const base = buildRecord({
        txHash: paymentTxHash,
        status: "locked_pending_chain",
        payMethod: "onchain",
        payAsset,
        payAmount: payAmt,
        olc,
        usd,
      });
      setPurchases(
        savePurchase({
          ...base,
          from: address,
          olcAmount: olc,
          deliveryNote: "Delivering OLC to your wallet…",
        }),
      );

      const attempt = async () => {
        const res = await fetch("/api/presale/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyer: address,
            olcAmount: olc,
            paymentTxHash,
            payChain,
            batchPriceUsed: batchPrice,
            usdRateUsed: usdPerPayUnit ?? 0,
            usdPaid: Number(usd.toFixed(8)),
            payAsset,
            payAmount: formatNum(payAmt, 8),
          }),
        });
        return {
          res,
          data: (await res.json().catch(() => ({}))) as {
            status?: string;
            creditTxHash?: string;
            message?: string;
            error?: string;
            notConfigured?: boolean;
            olcAmount?: number;
            retryable?: boolean;
          },
        };
      };

      setProgress("locking_olc");
      let { res, data } = await attempt();
      // Retry when RPC/indexing lags (409) — wallet-approve credit must not die on first lag.
      if (!(isDeliverOk(data.status) && data.creditTxHash) && opts?.retryOnce !== false) {
        const isLag = () =>
          data.status === "pending_confirmation" ||
          data.retryable === true ||
          res.status === 409 ||
          data.status === "locked_pending_chain" ||
          /indexing lag|not confirmed yet|not found|pending/i.test(
            `${data.error || ""} ${data.message || ""}`,
          );
        const maxAttempts = isLag() ? 6 : 3;
        for (let i = 1; i < maxAttempts; i++) {
          await new Promise((r) => setTimeout(r, Math.min(8_000, 1500 * i)));
          ({ res, data } = await attempt());
          if (isDeliverOk(data.status) && data.creditTxHash) break;
          if (!isLag() && data.status === "unverified" && res.status !== 409) break;
        }
      }

      const olcLabel = formatNum(olc, 4);
      if (isDeliverOk(data.status) && data.creditTxHash) {
        const next = updatePurchase(paymentTxHash, {
          status: "delivered",
          creditTxHash: data.creditTxHash,
          olcAmount: typeof data.olcAmount === "number" ? data.olcAmount : olc,
          from: address,
          deliveryNote: undefined,
        });
        setPurchases(next);
        setPendingLockRetryTx(null);
        setSuccessExplorer(explorerTxUrl(paymentTxHash));
        setSuccessNote(
          `${olcLabel} OLC sent to your BlockDAG wallet. Tap Add OLC if it does not show in MetaMask.`,
        );
        void walletBal.refetch();
        return true;
      }

      const next = updatePurchase(paymentTxHash, {
        status: "locked_pending_chain",
        olcAmount: olc,
        from: address,
        deliveryNote:
          data.message ||
          data.error ||
          "Payment on-chain — OLC wallet delivery pending. Use Retry deliver.",
      });
      setPurchases(next);
      setPendingLockRetryTx(paymentTxHash);
      setSuccessExplorer(explorerTxUrl(paymentTxHash));
      setSuccessNote(
        `Payment confirmed (${paymentTxHash.slice(0, 10)}…). ${olcLabel} OLC recorded locally but wallet delivery failed — tap Retry deliver. ${
          data.notConfigured || res.status === 503
            ? "Deliver service may need fund/RPC config."
            : data.error || data.message || ""
        }`,
      );
      void walletBal.refetch();
      return false;
    },
    [
      buildRecord,
      address,
      derived.olc,
      derived.usd,
      derived.payAmount,
      batchPrice,
      usdPerPayUnit,
      selected?.symbol,
      walletBal.refetch,
    ],
  );

  async function retryLockCredit(paymentTxHash: string) {
    setRetryBusy(true);
    setError(null);
    try {
      const record =
        loadPurchases().find((p) => p.txHash === paymentTxHash) ||
        listPendingLockCredits(address).find((p) => p.txHash === paymentTxHash);
      if (!record) {
        setError("Purchase record not found for retry.");
        return;
      }
      const olcAmount =
        typeof record.olcAmount === "number" && Number.isFinite(record.olcAmount)
          ? record.olcAmount
          : Number(String(record.olcEstimated).replace(/,/g, ""));
      const buyer = record.from || address;
      if (!buyer || !(olcAmount > 0)) {
        setError("Missing buyer or olcAmount for retry.");
        return;
      }
      const assetIdRetry = (record.payAsset as AcceptedPayAsset["id"]) || selected?.id || "BDAG";
      const payChain = payChainForAsset(assetIdRetry);
      let res: Response;
      if (paymentTxHash.startsWith("order:")) {
        const orderId = paymentTxHash.slice("order:".length);
        const open = listOpenPayOrdersForBuyer(buyer).find((o) => o.orderId === orderId);
        const hint = open?.paymentTxHint?.trim();
        if (hint) {
          // Known payment hash → deliver (BDAG-style), ignore ephemeral order store
          res = await fetch("/api/presale/deliver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyer,
              olcAmount,
              paymentTxHash: hint,
              payChain,
              payAsset: record.payAsset || open?.payAsset,
              payAmount: record.payAmount || String(open?.payAmount ?? ""),
            }),
          });
        } else {
          // Scan without order id
          const payAmt =
            Number(String(record.payAmount).replace(/,/g, "")) ||
            open?.payAmount ||
            0;
          res = await fetch("/api/presale/confirm-deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyer,
              olcAmount,
              payAsset: record.payAsset || open?.payAsset,
              payAmount: payAmt,
              chain: payChain,
            }),
          });
          if (res.status === 404) {
            // Soft try legacy order confirm; ignore Order not found
            const orderRes = await fetch(
              `/api/presale/orders/${encodeURIComponent(orderId)}/confirm`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              },
            );
            if (orderRes.status !== 404) res = orderRes;
          }
        }
      } else {
        // Real payment tx/signature → always deliver (all chains, like BDAG)
        res = await fetch("/api/presale/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyer,
            olcAmount,
            paymentTxHash,
            payChain,
            chain: payChain,
            batchPriceUsed: record.batchPriceUsed ?? record.batchPriceUsdt,
            usdRateUsed: record.usdRateUsed,
            usdPaid: record.usdPaid ?? record.usdEstimated,
            payAsset: record.payAsset,
            payAmount: record.payAmount,
          }),
        });
      }
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        creditTxHash?: string;
        message?: string;
        error?: string;
        olcAmount?: number;
      };
      if (isDeliverOk(data.status) && data.creditTxHash) {
        setPurchases(
          updatePurchase(paymentTxHash, {
            status: "delivered",
            creditTxHash: data.creditTxHash,
            olcAmount: typeof data.olcAmount === "number" ? data.olcAmount : olcAmount,
            from: buyer,
            deliveryNote: undefined,
          }),
        );
        setPendingLockRetryTx(null);
        setSuccessNote(
          `${formatNum(olcAmount, 4)} OLC delivered to your BlockDAG wallet.`,
        );
        setSuccessExplorer(explorerTxUrl(data.creditTxHash));
        void walletBal.refetch();
      } else {
        setPurchases(
          updatePurchase(paymentTxHash, {
            status: "locked_pending_chain",
            olcAmount,
            from: buyer,
            deliveryNote: data.message || data.error || "Still pending on-chain credit",
          }),
        );
        setPendingLockRetryTx(paymentTxHash);
        setSuccessNote(
          `Still pending on-chain credit. ${data.error || data.message || ""}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryBusy(false);
      setPurchases(loadPurchasesForWallet(address));
    }
  }

  async function resolveBuyProvider() {
    if (connector) {
      try {
        const p = (await connector.getProvider()) as { request?: unknown } | undefined;
        if (p && typeof p.request === "function") {
          return p as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
        }
      } catch {
        /* fall through to injected */
      }
    }
    return (
      (getEthereumPaymentProvider() as
        | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined) ??
      (getAnyInjectedProvider() as
        | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined) ??
      null
    );
  }

  function isWalletConnectSession(): boolean {
    return connector?.id === "walletConnect";
  }

  async function ensureOnBlockdag(opts?: { forceRpcRefresh?: boolean }) {
    const provider = await resolveBuyProvider();
    const force = opts?.forceRpcRefresh ?? false;
    const wc = isWalletConnectSession();
    const needSwitch = chainId !== TOKEN.chainId;
    // Only show "Switching network…" when we actually need to leave/enter a chain or force RPC.
    if (needSwitch || force) setProgress("switching_network");
    try {
      await ensureBlockdagNetwork(provider, {
        forceRpcRefresh: force,
        isWalletConnect: wc,
      });
    } catch (e) {
      // User rejected the RPC/network update — don't proceed to a doomed send.
      if (isUserRejection(e) || /rejected|canceled|cancelled/i.test(formatWalletError(e, ""))) {
        throw e instanceof Error ? e : new Error(formatWalletError(e, "Network update canceled."));
      }
      // WalletConnect often cannot update RPC — surface clear next step (don't pretend send will work).
      if (wc && force) {
        throw e instanceof Error ? e : new Error(blockdagRpcManualFixMessage(true));
      }
      /* injected: fall through to wagmi switch; buy path will force+retry on no-send errors */
    }
    try {
      if (chainId !== TOKEN.chainId) {
        await switchChainAsync({ chainId: blockdag.id });
      }
    } catch (e) {
      if (isUserRejection(e)) {
        throw new Error("Switch to BlockDAG was canceled in wallet.");
      }
      throw new Error(
        formatWalletError(
          e,
          `Switch to BlockDAG Mainnet (chainId ${TOKEN.chainId}) to buy with ${selected?.symbol ?? "BDAG"}.`,
        ),
      );
    }
  }

  async function sendNativeBdagViaProvider(
    provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
    from: string,
    to: Address,
    valueWei: bigint,
  ): Promise<Hash> {
    const valueHex = `0x${valueWei.toString(16)}` as `0x${string}`;
    const chainHex = `0x${TOKEN.chainId.toString(16).padStart(4, "0")}`;
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from, to, value: valueHex, chainId: chainHex }],
    })) as string;
    if (!hash || typeof hash !== "string" || !hash.startsWith("0x")) {
      throw new Error("Wallet did not return a transaction hash.");
    }
    return hash as Hash;
  }

  async function sendOnChainPayment(): Promise<Hash> {
    const treasury = SITE.treasuryAddress as Address;
    const payStr =
      selected!.onChain!.kind === "native"
        ? Number(derived.payAmount).toFixed(18).replace(/\.?0+$/, "") || "0"
        : Number(derived.payAmount).toFixed(Math.min(decimals, 18));

    if (selected!.onChain!.kind === "native") {
      const valueWei = parseEther(payStr);
      // Prefer direct eth_sendTransaction on the active injected provider.
      // WalletConnect (mobile deep-link) needs wagmi's sendTransactionAsync so the
      // sign request actually reaches the wallet app — the raw eth_sendTransaction
      // path there opens the wallet but never prompts to sign ("return to app").
      const provider = await resolveBuyProvider();
      const from = address;
      if (provider?.request && from && !isWalletConnectSession()) {
        try {
          return await sendNativeBdagViaProvider(provider, from, treasury, valueWei);
        } catch (directErr) {
          if (isUserRejection(directErr)) throw directErr;
          // Fall through to wagmi once; caller may forceRpcRefresh + retry.
          try {
            return await sendTransactionAsync({
              to: treasury,
              value: valueWei,
              chainId: TOKEN.chainId,
            });
          } catch (wagmiErr) {
            // Prefer the more specific RPC-ish error for retry detection.
            if (isNoSendRpcError(directErr) || isNoSendRpcError(wagmiErr)) {
              throw isNoSendRpcError(directErr) ? directErr : wagmiErr;
            }
            throw wagmiErr;
          }
        }
      }
      return await sendTransactionAsync({
        to: treasury,
        value: valueWei,
        chainId: TOKEN.chainId,
      });
    }
    return await writeContractAsync({
      address: selected!.onChain!.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [treasury, parseUnits(payStr, decimals)],
      chainId: TOKEN.chainId,
    });
  }

  function isNoSendRpcError(err: unknown): boolean {
    const raw = formatWalletError(err, "");
    return /sendRawTransaction|method not found|does not exist\/is not available|Internal JSON-RPC|JSON-RPC error|rpc .*can.?t send|can.?t send tx|cannot send|failed to fetch|network error|http request failed|\-32601|\-32603|\-32005|\-32002/i.test(
      raw,
    );
  }

  async function onBuyOnChain() {
    if (!selected?.onChain) {
      setError("No BlockDAG payment path for this asset.");
      return;
    }
    if (!isConnected || !address) {
      setError("Connect your BlockDAG wallet first — OLC delivers to that address.");
      return;
    }
    if (!buyRateReady) {
      setError(
        selected.id === "BDAG"
          ? "Live BDAG/USD price required. Wait for a fresh quote."
          : `Live ${selected.symbol}/USD price required.`,
      );
      return;
    }
    if (!(derived.olc > 0) || !(derived.payAmount > 0)) {
      setError("Enter a valid amount.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessNote(null);
    setSuccessExplorer(null);
    setPendingLockRetryTx(null);
    setBdagRpcBlocked(false);
    let hash: Hash | undefined;
    try {
      // Send-first when already on BlockDAG 1404 — no switch-away / re-add dance
      // before the wallet confirm (that dance was canceling buys). Soft-switch only
      // if we're on the wrong chain; forceRpcRefresh only after a no-send RPC failure.
      const alreadyOnBlockdag = chainId === TOKEN.chainId;
      // WalletConnect: send-first — the wallet handles the chain as part of the sign
      // request. A separate pre-switch deep-link is what shows "return to app" with
      // no sign prompt on mobile.
      if (!alreadyOnBlockdag && !isWalletConnectSession()) {
        await ensureOnBlockdag({ forceRpcRefresh: false });
      }
      setProgress("confirm_wallet");

      try {
        hash = await sendOnChainPayment();
      } catch (sendErr) {
        if (isUserRejection(sendErr)) throw sendErr;
        if (!isNoSendRpcError(sendErr)) throw sendErr;
        // Wallet still on a no-send RPC — force east→west once, then retry send once.
        setProgress("switching_network");
        const provider = await resolveBuyProvider();
        await ensureBlockdagNetwork(provider, {
          forceRpcRefresh: true,
          isWalletConnect: isWalletConnectSession(),
        });
        try {
          if (chainId !== TOKEN.chainId) {
            await switchChainAsync({ chainId: blockdag.id });
          }
        } catch {
          /* RPC refresh is the important step */
        }
        setProgress("confirm_wallet");
        hash = await sendOnChainPayment();
      }

      setPendingHash(hash);
      setPurchases(
        savePurchase({
          ...buildRecord({
            txHash: hash,
            status: "locked_pending_chain",
            payMethod: "onchain",
          }),
          from: address,
          olcAmount: derived.olc,
          deliveryNote: "Payment submitted — confirming on BlockDAG…",
        }),
      );
      setPendingLockRetryTx(hash);

      setProgress("confirming_payment");
      const waited = await waitForBlockdagReceipt(hash, { timeoutMs: 90_000, pollMs: 2_000 });
      if (waited.ok && waited.receipt.status === "reverted") {
        setError(
          `Transaction reverted on BlockDAG (${hash.slice(0, 10)}…). No OLC was locked — check balance/gas and retry.`,
        );
        setPurchases(
          updatePurchase(hash, {
            status: "pending_external",
            deliveryNote: "On-chain payment reverted",
          }),
        );
        setPendingLockRetryTx(null);
        return;
      }
      if (!waited.ok) {
        setSuccessNote(
          `Payment submitted (${hash.slice(0, 10)}…) but confirmation timed out. Attempting lock credit…`,
        );
      }

      await deliverLocked(hash, { retryOnce: true });
    } catch (e) {
      if (isUserRejection(e)) {
        setError("Transaction canceled in wallet.");
      } else if (isNoSendRpcError(e) || /WalletConnect can’t update|Set BlockDAG Mainnet RPC/i.test(formatWalletError(e, ""))) {
        // Clear path: manual send from wallet app + paste tx (same deliver path).
        setError(null);
        setBdagRpcBlocked(true);
        setDepositTxHash("");
      } else {
        setError(formatWalletError(e, "Transaction failed"));
      }
      if (hash) setPendingLockRetryTx(hash);
    } finally {
      setBusy(false);
      setProgress(null);
      setPendingHash(undefined);
    }
  }

  async function createPayOrder(): Promise<ActivePayOrder | null> {
    if (!isConnected || !address) {
      setError("Connect your BlockDAG wallet first — OLC delivers to that address.");
      return null;
    }
    if (!selected) return null;
    if (!buyRateReady) {
      setError(`Live ${selected.symbol}/USD price required before buying.`);
      return null;
    }
    if (!(derived.olc > 0) || !(derived.payAmount > 0)) {
      setError("Enter a valid amount.");
      return null;
    }
    if (!selected.depositAddress) {
      setError("No deposit address configured.");
      return null;
    }

    setProgress("creating_order");
    const body: Record<string, unknown> = {
      buyer: address,
      payAsset: selected.symbol,
    };
    if (mode === "olc") body.olcAmount = derived.olc;
    else body.payAmount = derived.payAmount;

    let res: Response;
    try {
      res = await fetch("/api/presale/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? `Network error creating order: ${e.message}`
          : "Network error creating pay order.",
      );
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as {
      orderId?: string;
      buyer?: string;
      payAsset?: string;
      payAmount?: number;
      olcAmount?: number;
      depositAddress?: string;
      depositNetwork?: string;
      expiresAt?: number;
      usdPaid?: number;
      error?: string;
    };
    if (!res.ok || !data.orderId || !data.depositAddress) {
      setError(
        friendlyPaymentError(data.error) ||
          `Could not create pay order (HTTP ${res.status}).`,
      );
      return null;
    }
    const order: ActivePayOrder = {
      orderId: data.orderId,
      buyer: data.buyer || address,
      payAsset: data.payAsset || selected.symbol,
      payAmount: data.payAmount ?? derived.payAmount,
      olcAmount: data.olcAmount ?? derived.olc,
      depositAddress: data.depositAddress,
      depositNetwork: data.depositNetwork || selected.depositNetwork || "",
      expiresAt: data.expiresAt ?? Date.now() + 45 * 60_000,
      usdPaid: data.usdPaid,
    };
    setActiveOrder(order);
    setDepositTxHash("");
    setAutoLooking(true);
    try {
      saveOpenPayOrder({
        orderId: order.orderId,
        buyer: order.buyer,
        payAsset: order.payAsset,
        payAmount: order.payAmount,
        olcAmount: order.olcAmount,
        depositAddress: order.depositAddress,
        depositNetwork: order.depositNetwork,
        expiresAt: order.expiresAt,
        usdPaid: order.usdPaid,
      });
    } catch {
      /* ignore localStorage */
    }
    return order;
  }

  async function confirmOrder(
    order: ActivePayOrder,
    paymentTxHash?: string,
    opts?: { silent?: boolean },
  ): Promise<boolean> {
    const silent = Boolean(opts?.silent);
    if (confirmInFlight.current) return false;
    confirmInFlight.current = true;

    if (!silent) {
      setProgress("locking_olc");
      setConfirmBusy(true);
    } else {
      setAutoLooking(true);
    }

    const pasted = paymentTxHash
      ? parsePaymentTxRef(paymentTxHash)
      : parsePaymentTxRef(depositTxHashRef.current || depositTxHash);
    const payChain = payChainForAsset(order.payAsset);
    const localKey = pasted || `order:${order.orderId}`;

    if (!silent) {
      const pending = {
        ...buildRecord({
          txHash: localKey,
          status: "locked_pending_chain" as const,
          payMethod: "deposit" as const,
          payAsset: order.payAsset,
          payAmount: order.payAmount,
          olc: order.olcAmount,
          usd: order.usdPaid ?? derived.usd,
          depositAddress: order.depositAddress,
          depositNetwork: order.depositNetwork,
        }),
        from: order.buyer,
        deliveryNote: pasted
          ? "Verifying payment on-chain…"
          : "Scanning for matching deposit…",
      };
      setPurchases(savePurchase(pending));
      setPendingLockRetryTx(localKey);
    }

    type CreditData = {
      status?: string;
      creditTxHash?: string;
      message?: string;
      error?: string;
      olcAmount?: number;
      verified?: boolean;
      paymentTxHash?: string;
    };

    const applyLocked = (data: CreditData, paymentKey: string) => {
      const olc =
        typeof data.olcAmount === "number" ? data.olcAmount : order.olcAmount;
      const existingPending = {
        ...buildRecord({
          txHash: localKey,
          status: "delivered" as const,
          payMethod: "deposit" as const,
          payAsset: order.payAsset,
          payAmount: order.payAmount,
          olc,
          usd: order.usdPaid ?? derived.usd,
          depositAddress: order.depositAddress,
          depositNetwork: order.depositNetwork,
        }),
        from: order.buyer,
        creditTxHash: data.creditTxHash,
        deliveryNote: undefined,
      };
      if (paymentKey !== localKey) {
        // Drop the `order:<id>` reminder stub now that we know the real payment hash.
        removePurchase(localKey);
        setPurchases(
          savePurchase({
            ...existingPending,
            txHash: paymentKey,
            id: `${Date.now()}-${paymentKey.slice(0, 12)}`,
            status: "delivered",
            creditTxHash: data.creditTxHash,
            olcAmount: olc,
            deliveryNote: undefined,
          }),
        );
      } else {
        setPurchases(
          savePurchase({
            ...existingPending,
            status: "delivered",
            creditTxHash: data.creditTxHash,
            olcAmount: olc,
            deliveryNote: undefined,
          }),
        );
      }
      clearOpenPayOrder(order.orderId);
      setPendingLockRetryTx(null);
      setActiveOrder(null);
      setAutoLooking(false);
      setError(null);
      setSuccessNote(
        `${formatNum(olc, 4)} OLC sent to your BlockDAG wallet. Tap Add OLC if needed.`,
      );
      setSuccessExplorer(
        paymentKey.startsWith("0x")
          ? explorerTxUrl(paymentKey)
          : explorerTxUrl(data.creditTxHash!),
      );
      void walletBal.refetch();
    };

    const applyPendingChain = (data: CreditData, paymentKey: string) => {
      const olc =
        typeof data.olcAmount === "number" ? data.olcAmount : order.olcAmount;
      if (paymentKey !== localKey) {
        // Drop the `order:<id>` reminder stub now that we know the real payment hash.
        removePurchase(localKey);
      }
      setPurchases(
        savePurchase({
          ...buildRecord({
            txHash: paymentKey,
            status: "locked_pending_chain" as const,
            payMethod: "deposit" as const,
            payAsset: order.payAsset,
            payAmount: order.payAmount,
            olc,
            usd: order.usdPaid ?? derived.usd,
            depositAddress: order.depositAddress,
            depositNetwork: order.depositNetwork,
          }),
          from: order.buyer,
          deliveryNote:
            data.message ||
            data.error ||
            "Payment verified — awaiting OLC wallet delivery.",
        }),
      );
      setPendingLockRetryTx(paymentKey);
      if (data.paymentTxHash || pasted) {
        try {
          updateOpenPayOrderHint(
            order.orderId,
            data.paymentTxHash || pasted!,
          );
        } catch {
          /* ignore */
        }
      }
      setSuccessNote(
        `Payment verified. ${formatNum(olc, 4)} OLC pending wallet delivery. ${data.error || data.message || ""}`,
      );
      void walletBal.refetch();
    };

    try {
      let res: Response;
      let data: CreditData;

      if (pasted) {
        // Primary credit path (same as BDAG): deliver by payment tx — never depend on order store.
        const deliverBody = {
          buyer: order.buyer,
          paymentTxHash: pasted,
          payChain,
          payAsset: order.payAsset,
          olcAmount: order.olcAmount,
          payAmount: String(order.payAmount),
        };
        res = await fetch("/api/presale/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deliverBody),
        });
        data = (await res.json().catch(() => ({}))) as CreditData & {
          retryable?: boolean;
        };

        // Poll/retry deliver on indexing lag (409)
        for (let i = 0; i < 5; i++) {
          const lag =
            res.status === 409 ||
            data.status === "pending_confirmation" ||
            (data as { retryable?: boolean }).retryable === true;
          if (isDeliverOk(data.status) && data.creditTxHash) break;
          if (data.verified && data.status === "locked_pending_chain") break;
          if (!lag && res.status !== 409) break;
          await new Promise((r) => setTimeout(r, Math.min(8_000, 1500 * (i + 1))));
          res = await fetch("/api/presale/deliver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(deliverBody),
          });
          data = (await res.json().catch(() => ({}))) as CreditData;
        }

        // Optional Redis order status update — 404 must not fail the buy
        if (
          !(isDeliverOk(data.status) && data.creditTxHash) &&
          !(data.verified && data.status === "locked_pending_chain") &&
          res.status !== 429
        ) {
          const orderRes = await fetch(
            `/api/presale/orders/${encodeURIComponent(order.orderId)}/confirm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentTxHash: pasted }),
            },
          );
          const orderData = (await orderRes.json().catch(() => ({}))) as CreditData;
          if (
            (isDeliverOk(orderData.status) && orderData.creditTxHash) ||
            (orderData.verified && orderData.status === "locked_pending_chain")
          ) {
            res = orderRes;
            data = orderData;
          } else if (orderRes.status === 404 || /order not found/i.test(orderData.error || "")) {
            // Order missing on this instance is OK — deliver is the credit path
          }
        }
      } else {
        // No hash yet: amount-matched scan via confirm-deposit (client fields; no order id).
        res = await fetch("/api/presale/confirm-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyer: order.buyer,
            payAsset: order.payAsset,
            payAmount: order.payAmount,
            chain: payChain,
            olcAmount: order.olcAmount,
          }),
        });
        data = (await res.json().catch(() => ({}))) as CreditData;

        // Legacy order confirm as soft fallback; on 404 ignore (ephemeral store).
        if (
          !(isDeliverOk(data.status) && data.creditTxHash) &&
          !(data.verified && data.status === "locked_pending_chain") &&
          res.status !== 429
        ) {
          const orderRes = await fetch(
            `/api/presale/orders/${encodeURIComponent(order.orderId)}/confirm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            },
          );
          const orderData = (await orderRes.json().catch(() => ({}))) as CreditData;
          if (
            (isDeliverOk(orderData.status) && orderData.creditTxHash) ||
            (orderData.verified && orderData.status === "locked_pending_chain") ||
            orderData.status === "expired" ||
            orderRes.status === 410
          ) {
            res = orderRes;
            data = orderData;
          }
        }
      }

      if (res.status === 410 || data.status === "expired") {
        clearOpenPayOrder(order.orderId);
        setActiveOrder(null);
        setAutoLooking(false);
        if (!silent) {
          setError(
            friendlyPaymentError(data.error || data.message) ||
              "This pay order expired — create a new Buy order.",
          );
        } else {
          setError("Pay order expired — create a new Buy order with a fresh quote.");
        }
        return false;
      }

      const paymentKey = data.paymentTxHash || pasted || localKey;
      if (isDeliverOk(data.status) && data.creditTxHash) {
        applyLocked(data, paymentKey);
        return true;
      }

      if (data.verified && data.status === "locked_pending_chain") {
        applyPendingChain(data, paymentKey);
        // Keep polling — deliver may succeed on a later attempt
        return false;
      }

      // Not found / unverified yet
      if (silent) {
        // Soft status only — do not flash hard errors every poll tick
        return false;
      }

      setError(
        friendlyPaymentError(data.error || data.message) ||
          "No matching payment found yet — wait a minute and try again.",
      );
      setPurchases(
        savePurchase({
          ...buildRecord({
            txHash: localKey,
            status: "pending_external" as const,
            payMethod: "deposit" as const,
            payAsset: order.payAsset,
            payAmount: order.payAmount,
            olc: order.olcAmount,
            usd: order.usdPaid ?? derived.usd,
            depositAddress: order.depositAddress,
            depositNetwork: order.depositNetwork,
          }),
          from: order.buyer,
          deliveryNote: data.error || "Unverified",
        }),
      );
      return false;
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Confirm request failed");
      }
      return false;
    } finally {
      confirmInFlight.current = false;
      if (!silent) {
        setConfirmBusy(false);
        setPurchases(loadPurchasesForWallet(address));
      }
    }
  }

  async function payWithEvmWallet(order: ActivePayOrder): Promise<"paid" | "manual" | "canceled"> {
    const asset = order.payAsset.toUpperCase();
    if (!isEvmDepositAsset(asset)) return "manual";

    const eth = getEthereumPaymentProvider() ?? getAnyInjectedProvider();
    if (!eth?.request) {
      setError(
        isMobileSafariNoWallet()
          ? "Safari mobile: use the deposit address / QR below, then tap I’ve paid. (Or open this page in MetaMask / OKX in-app browser for one-tap pay.)"
          : noInjectedProviderMessage(asset, order.payAmount),
      );
      return "manual";
    }

    setProgress("confirm_wallet");
    try {
      await ensureEthereumMainnet(eth);

      let from: string | undefined;
      try {
        const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        from = accounts?.[0];
      } catch (e) {
        if (walletErrorCode(e) === 4001) throw new Error("Wallet connect was rejected.");
        throw new Error(formatWalletError(e, "Could not access wallet accounts."));
      }
      if (!from) throw new Error("No wallet account available.");

      const to = order.depositAddress as Address;
      let txHash: string | undefined;

      if (asset === "ETH") {
        const valueWei = parseEther(Number(order.payAmount).toFixed(18));
        const valueHex = `0x${valueWei.toString(16)}` as `0x${string}`;
        txHash = (await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to, value: valueHex }],
        })) as string;
      } else {
        const token = asset === "USDT" ? ETH_MAINNET_USDT : ETH_MAINNET_USDC;
        const amount = parseUnits(Number(order.payAmount).toFixed(6), 6);
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, amount],
        });
        txHash = (await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to: token, data, value: "0x0" }],
        })) as string;
      }

      if (!txHash) throw new Error("Wallet did not return a transaction hash.");
      setDepositTxHash(txHash);
      // Credit path = deliver by tx hash (do NOT depend on ephemeral order confirm)
      setProgress("locking_olc");
      setSuccessNote("Delivering OLC…");

      try {
        updateOpenPayOrderHint(order.orderId, txHash);
      } catch {
        /* ignore */
      }
      setAutoLooking(true);

      // Brief pause so explorers/indexers can see the tx, then deliver with 409 retries
      await new Promise((r) => setTimeout(r, 2000));
      const delivered = await deliverLocked(txHash, {
        olc: order.olcAmount,
        usd: order.usdPaid ?? derived.usd,
        payAmount: order.payAmount,
        payAsset: order.payAsset,
        retryOnce: true,
      });

      // Best-effort: update Redis order status if the order is still findable
      void fetch(`/api/presale/orders/${encodeURIComponent(order.orderId)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentTxHash: txHash }),
      }).catch(() => {});

      if (delivered) {
        clearOpenPayOrder(order.orderId);
        setActiveOrder(null);
        setAutoLooking(false);
        return "paid";
      }

      // Deliver pending (indexing lag) — keep hash + auto-poll; credit still via deliver
      setAutoLooking(true);
      setError(
        "Payment submitted — still delivering OLC. We’ll keep retrying automatically.",
      );
      return "manual";
    } catch (e) {
      if (isUserRejection(e)) {
        setError("Payment rejected in wallet.");
        return "canceled";
      }
      const msg = formatWalletError(e);
      if (/No Ethereum wallet detected|No injected wallet/i.test(msg)) {
        setError(msg);
        return "manual";
      }
      setError(msg || "Wallet payment failed.");
      return "manual";
    }
  }

  async function payWithSolana(order: ActivePayOrder): Promise<"paid" | "manual" | "canceled"> {
    // Always keep the order card reachable — never open solana: / window.open / location.href.

    const provider = getInjectedSolanaProvider();
    if (!provider) {
      // No injected wallet (typical mobile Safari): QR + copy only. Never deep-link.
      setProgress(null);
      setError(null);
      return "manual";
    }

    setProgress("confirm_wallet");
    try {
      const signature = await sendNativeSolTransfer({
        provider,
        toAddress: order.depositAddress,
        solAmount: order.payAmount,
      });
      setDepositTxHash(signature);
      // Credit path = deliver by signature (do NOT depend on order confirm)
      setProgress("locking_olc");
      setSuccessNote("Delivering OLC…");

      try {
        updateOpenPayOrderHint(order.orderId, signature);
      } catch {
        /* ignore */
      }
      setAutoLooking(true);

      await new Promise((r) => setTimeout(r, 2000));
      const delivered = await deliverLocked(signature, {
        olc: order.olcAmount,
        usd: order.usdPaid ?? derived.usd,
        payAmount: order.payAmount,
        payAsset: order.payAsset,
        retryOnce: true,
      });

      void fetch(`/api/presale/orders/${encodeURIComponent(order.orderId)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentTxHash: signature }),
      }).catch(() => {});

      if (delivered) {
        clearOpenPayOrder(order.orderId);
        setActiveOrder(null);
        setAutoLooking(false);
        return "paid";
      }

      setAutoLooking(true);
      setError(
        "Payment submitted — still delivering OLC. We’ll keep retrying automatically.",
      );
      return "manual";
    } catch (e) {
      if (isUserRejection(e)) {
        setError("Payment rejected in wallet.");
        return "canceled";
      }
      const msg = formatWalletError(e);
      setError(
        msg ||
          "Solana wallet payment failed. Stay on this page — send the exact SOL from your wallet app, then tap I’ve paid.",
      );
      return "manual";
    }
  }

  /** Single primary Buy / Pay action for all assets. */
  async function onBuy() {
    if (!selected) return;
    setError(null);
    setSuccessNote(null);
    setSuccessExplorer(null);
    try {
      if (onChain) {
        await onBuyOnChain();
        return;
      }

      setBusy(true);
      const order = await createPayOrder();
      if (!order) return;

      if (isEvmDepositAsset(order.payAsset)) {
        const result = await payWithEvmWallet(order);
        if (result === "paid") return;
        // manual / canceled — keep order card visible with clear next step
        return;
      }

      if (order.payAsset.toUpperCase() === "SOL") {
        const result = await payWithSolana(order);
        if (result === "paid") return;
        // manual / canceled — keep order card visible with clear next step
        return;
      }

      // BTC and anything else: copy/QR + I’ve paid
    } catch (e) {
      setError(formatWalletError(e, e instanceof Error ? e.message : "Buy failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const buyDisabled =
    busy ||
    confirmBusy ||
    !selected ||
    !buyRateReady ||
    !(derived.olc > 0) ||
    !(derived.payAmount > 0) ||
    !isConnected;

  const primaryLabel = (() => {
    const prog = progressLabel(progress);
    if (prog) return prog;
    if (!isConnected) return "Connect wallet to buy";
    if (!buyRateReady) return "Waiting for live price…";
    if (!(derived.olc > 0)) return "Enter OLC amount";
    const pay = formatNum(derived.payAmount, selected?.id === "BTC" ? 8 : 6);
    return `Buy — Pay ${pay} ${selected?.symbol ?? ""}`;
  })();

  const orderExpiresInMin = activeOrder
    ? Math.max(0, Math.ceil((activeOrder.expiresAt - Date.now()) / 60_000))
    : 0;

  const showOrderCard = Boolean(activeOrder);

  return (
    <section className="card min-w-0 w-full max-w-full overflow-hidden border-gold/40 shadow-gold !p-5 sm:!p-7">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-white">Buy OLC</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Live batch {batch.batch}:{" "}
          <span className="font-semibold text-gold-bright">${batchPrice.toFixed(3)}</span> / OLC.
          Crypto-only checkout — pick how you pay; verified buys deliver OLC to your BlockDAG wallet. No KYC.
        </p>
      </div>

      {/* Destination only — balances live in site header; no second wallet panel */}
      <div className="mt-6 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-bg-panel/60 px-3.5 py-3.5">
        {isConnected && address ? (
          <>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Deliver to</p>
              <p className="font-mono text-sm text-cyan-100">{shortAddr(address)}</p>
            </div>
            {!onCorrectChain && (
              <button
                type="button"
                className="ml-auto rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100"
                onClick={() => void ensureOnBlockdag({ forceRpcRefresh: true }).catch((e) => setError(formatWalletError(e)))}
              >
                Switch / Fix BlockDAG
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Connect via the header — purchased OLC delivers to that BlockDAG address.
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-100/90 space-y-1">
        <p>
          <strong>Safety:</strong> OLC is delivered to your wallet only after on-chain payment verify. Wrong network = lost funds.
          Treasury{" "}
          <a
            className="link-accent break-all font-mono text-[11px]"
            href={explorerAddressUrl(SITE.treasuryAddress)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {SITE.treasuryAddress}
          </a>
          .
        </p>
      </div>

      {/* I want OLC */}
      <div className="mt-7 space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
              mode === "olc"
                ? "border-gold/60 bg-gold/10 text-gold-bright"
                : "border-border text-slate-400"
            }`}
            onClick={() => setMode("olc")}
          >
            I want OLC
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
              mode === "pay"
                ? "border-gold/60 bg-gold/10 text-gold-bright"
                : "border-border text-slate-400"
            }`}
            onClick={() => setMode("pay")}
          >
            Enter {selected?.symbol ?? "pay"} amount
          </button>
        </div>

        {mode === "olc" ? (
          <label className="block text-sm">
            <span className="text-slate-400">I want ___ OLC</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={olcInput}
              onChange={(e) => setOlcInput(e.target.value)}
              className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg-panel px-3 py-3 font-mono text-lg text-white"
            />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="text-slate-400">{selected?.symbol} to send</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={payInput}
              onChange={(e) => setPayInput(e.target.value)}
              className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg-panel px-3 py-3 font-mono text-lg text-white"
            />
          </label>
        )}
      </div>

      {/* Pay with chips */}
      <div className="mt-6">
        <p className="text-sm text-slate-400">Pay with</p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-2">
          {assets.map((a) => {
            const active = a.id === selected?.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAssetId(a.id)}
                className={`min-w-[4.5rem] flex-1 rounded-full border px-3 py-2 text-sm font-semibold sm:flex-none ${
                  active
                    ? "border-gold/70 bg-gold/15 text-gold-bright"
                    : "border-border bg-bg-panel text-slate-300 hover:border-slate-500"
                }`}
              >
                {a.symbol}
              </button>
            );
          })}
        </div>
        {selected && (
          <p className="mt-1.5 text-[11px] font-mono text-cyan-accent/90">
            Live {selected.symbol}/USD: ${formatUsdPrice(usdPerPayUnit, fracDigits)}
            {rateSource ? ` (${rateSource})` : ""}
          </p>
        )}
      </div>

      {/* ROI / live quote calculator */}
      <div className="mt-6 rounded-xl border border-gold/30 bg-bg-panel/80 p-4 text-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-bright">
            You get X OLC for $Y
          </p>
          <p className="text-[10px] text-slate-500">Live prices · batch {batch.batch}</p>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <span className="text-slate-400">Presale batch</span>
          <span className="font-mono text-gold-bright">${batchPrice.toFixed(3)} / OLC</span>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <span className="shrink-0 text-slate-400">You pay ($Y)</span>
          <span className="min-w-0 break-all text-right font-mono text-slate-100">
            {formatNum(derived.payAmount, 8)} {selected?.symbol} ≈ ${formatNum(derived.usd, 4)}
          </span>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-1.5 text-sm">
          <span className="text-slate-300">You get (X OLC)</span>
          <span className="font-semibold text-gold-bright">
            {formatNum(derived.olc, 4)} OLC{" "}
            <span className="text-[10px] font-normal text-slate-400">(to your wallet)</span>
          </span>
        </div>
        {derived.usd > 0 && derived.olc > 0 && (
          <p className="text-[11px] text-slate-400">
            ≈ {formatNum(derived.olc / derived.usd, 2)} OLC per $1 at current live rates.
          </p>
        )}
        {selected?.id === "BDAG" && !prices.hasLiveBdag && (
          <p className="text-[11px] text-amber-300">
            Live BDAG price unavailable — Buy is blocked until a fresh quote loads.
          </p>
        )}
      </div>

      {/* Crypto-only + card stub (does not claim card works) */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-semibold text-gold-bright">
          Crypto only
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-slate-500">
          Card pay — coming soon (not available)
        </span>
        <span className="text-slate-500">No KYC</span>
      </div>

      {/* Primary Buy — compact wallet reminder only (full chip stays in site header) */}
      <div className="mt-7 space-y-4">
        {isConnected && address ? (
          <p className="text-center text-[11px] text-slate-500">
            Paying as{" "}
            <span className="font-mono text-slate-300">{shortAddr(address)}</span>
            {onCorrectChain && walletBal.bdagFormatted != null && (
              <>
                {" · "}
                <span className="font-mono text-gold-bright/90">{walletBal.bdagFormatted} BDAG</span>
              </>
            )}
          </p>
        ) : (
          <div className="flex justify-center">
            <ConnectWallet compact />
          </div>
        )}
        <button
          type="button"
          className="btn-primary w-full py-3 text-base"
          disabled={buyDisabled}
          onClick={() => {
            if (!isConnected) return;
            void onBuy();
          }}
        >
          {primaryLabel}
        </button>
        {bdagRpcBlocked && selected?.id === "BDAG" && (
          <div className="rounded-xl border border-cyan-accent/40 bg-cyan-accent/5 p-4 text-sm text-cyan-50 space-y-3">
            <p className="font-semibold text-white">
              Send {formatNum(derived.payAmount, 8)} BDAG to treasury from your wallet app
            </p>
            <p className="text-xs text-slate-300">
              Wallet send didn’t go through (often a stuck RPC). Send the exact amount below on
              BlockDAG Mainnet, then paste the tx hash — we’ll deliver{" "}
              {formatNum(derived.olc, 4)} OLC the same way as external pays.
            </p>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Treasury</p>
              <CopyAddress address={SITE.treasuryAddress} className="w-full" />
              <p className="font-mono text-xs text-gold-bright">
                Amount: {formatNum(derived.payAmount, 8)} BDAG → {formatNum(derived.olc, 4)} OLC
              </p>
            </div>
            <label className="block text-xs text-slate-300">
              <span className="text-slate-500">Payment tx hash / explorer URL</span>
              <input
                type="text"
                value={depositTxHash}
                onChange={(e) => setDepositTxHash(e.target.value)}
                placeholder="0x… or bdagscan URL"
                className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-sm text-white break-all"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                disabled={confirmBusy || busy || !isConnected}
                onClick={() => {
                  const pasted = parsePaymentTxRef(depositTxHash);
                  if (!pasted) {
                    setError("Paste your BDAG payment tx hash (0x…), then tap I’ve paid.");
                    return;
                  }
                  setError(null);
                  setConfirmBusy(true);
                  void deliverLocked(pasted, {
                    olc: derived.olc,
                    usd: derived.usd,
                    payAmount: derived.payAmount,
                    payAsset: "BDAG",
                    retryOnce: true,
                  })
                    .then((ok) => {
                      if (ok) setBdagRpcBlocked(false);
                    })
                    .finally(() => setConfirmBusy(false));
                }}
              >
                {confirmBusy ? "Delivering OLC…" : "I’ve paid — credit my OLC"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-50"
                disabled={busy}
                onClick={() =>
                  void ensureOnBlockdag({ forceRpcRefresh: true })
                    .then(() => {
                      setBdagRpcBlocked(false);
                      setError(null);
                    })
                    .catch((e) => setError(formatWalletError(e)))
                }
              >
                Fix RPC & retry Buy
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Optional: set BlockDAG RPC to{" "}
              <span className="font-mono text-[10px] text-slate-200">{EAST_RPC}</span> in your
              wallet, or pay another way:
            </p>
            <div className="flex flex-wrap gap-2">
              {(["ETH", "USDT", "USDC", "SOL", "BTC"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="rounded-full border border-border bg-bg-deep/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200"
                  onClick={() => {
                    setBdagRpcBlocked(false);
                    setError(null);
                    setAssetId(id);
                  }}
                >
                  Pay with {id}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className="text-xs text-slate-400 underline-offset-2 hover:underline"
          onClick={() => void prices.refresh()}
        >
          Refresh prices
        </button>
      </div>

      {/* Order / manual pay card (deposit assets) — same product, not a second panel */}
      {showOrderCard && activeOrder && (
        <div className="mt-7 min-w-0 rounded-xl border border-cyan-accent/30 bg-cyan-accent/5 p-4 space-y-4 sm:p-5">
          <p className="text-sm font-semibold text-cyan-100">
            Send exactly {formatNum(activeOrder.payAmount, 8)} {activeOrder.payAsset}
          </p>
          <p className="text-xs text-slate-400">
            → {formatNum(activeOrder.olcAmount, 4)} OLC to your wallet
            {activeOrder.usdPaid != null ? ` · ≈ $${formatNum(activeOrder.usdPaid, 4)}` : ""}
            {" · "}
            Network: <strong className="text-amber-200">{activeOrder.depositNetwork}</strong>
          </p>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0 space-y-2">
              <CopyAddress address={activeOrder.depositAddress} className="w-full" />
              <p className="text-[10px] text-slate-500">
                Order {activeOrder.orderId} · expires in ~{orderExpiresInMin} min
              </p>
              {isEvmDepositAsset(activeOrder.payAsset) && (
                <p className="text-[11px] text-slate-400">
                  Open in MetaMask browser or send manually on Ethereum mainnet.
                </p>
              )}
              {activeOrder.payAsset === "SOL" && (
                <>
                  <p className="text-[11px] text-slate-300">
                    Stay on this page. Send the exact SOL from your wallet app to the
                    address above — we’ll auto-detect it (or tap I’ve paid to accelerate).
                  </p>
                  {hasInjectedSolana && (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-purple-400/50 bg-purple-500/10 px-4 py-2.5 text-sm font-semibold text-purple-100 sm:w-auto"
                      disabled={busy}
                      onClick={() => void payWithSolana(activeOrder)}
                    >
                      Pay with Phantom
                    </button>
                  )}
                </>
              )}
              {isEvmDepositAsset(activeOrder.payAsset) && (
                <button
                  type="button"
                  className="w-full rounded-xl border border-sky-400/50 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 sm:w-auto"
                  disabled={busy}
                  onClick={() => void payWithEvmWallet(activeOrder)}
                >
                  Retry wallet pay
                </button>
              )}
            </div>
            <div className="mx-auto flex w-full max-w-[168px] flex-col items-center gap-1 sm:mx-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl(activeOrder.depositAddress)}
                alt="Deposit address QR"
                width={168}
                height={168}
                className="h-auto w-full max-w-[168px] rounded-lg border border-border bg-white p-1"
              />
            </div>
          </div>

          <label className="block text-xs text-slate-300">
            <span className="text-slate-500">Tx hash / explorer URL (optional)</span>
            <input
              type="text"
              value={depositTxHash}
              onChange={(e) => setDepositTxHash(e.target.value)}
              placeholder={
                activeOrder.payAsset === "BTC"
                  ? "Bitcoin txid or mempool.space URL"
                  : activeOrder.payAsset === "SOL"
                    ? "Solana signature or solscan URL"
                    : "0x… or etherscan URL"
              }
              className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-sm text-white break-all"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {(autoLooking || confirmBusy) && (
            <p className="text-xs text-cyan-200/90 animate-pulse">
              Looking for payment…{" "}
              <span className="text-slate-400">
                (auto-checks every ~12s — you can still tap I’ve paid)
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              disabled={confirmBusy || !isConnected}
              onClick={() => void confirmOrder(activeOrder)}
            >
              {confirmBusy
                ? depositTxHash.trim()
                  ? "Verifying…"
                  : "Scanning for payment…"
                : "I’ve paid — credit my OLC"}
            </button>
            <button
              type="button"
              className="text-[11px] text-slate-400 underline-offset-2 hover:underline"
              onClick={() => {
                try {
                  clearOpenPayOrder(activeOrder.orderId);
                } catch {
                  /* ignore */
                }
                setActiveOrder(null);
                setDepositTxHash("");
                setAutoLooking(false);
              }}
            >
              Cancel / change amount
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 break-words rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {successNote && (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100 space-y-2">
          <p>{successNote}</p>
          <div className="flex flex-wrap items-center gap-2">
            {successExplorer && (
              <a
                className="link-accent font-mono text-xs"
                href={successExplorer}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on explorer
              </a>
            )}
            {!pendingLockRetryTx && <AddOlcButton />}
            {pendingLockRetryTx && (
              <button
                type="button"
                className="btn-primary !text-xs !px-3 !py-1.5"
                disabled={retryBusy}
                onClick={() => void retryLockCredit(pendingLockRetryTx)}
              >
                {retryBusy ? "Retrying…" : "Retry deliver"}
              </button>
            )}
          </div>
        </div>
      )}
      {pendingHash && (
        <p className="mt-2 text-xs text-slate-400">
          Tx pending:{" "}
          <a
            className="link-accent font-mono"
            href={explorerTxUrl(pendingHash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {pendingHash.slice(0, 10)}…
          </a>
        </p>
      )}

      <div className="mt-10 border-t border-border pt-8">
        <h3 className="text-sm font-semibold text-white">Purchase history</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          From your local purchases ledger (account-scoped). Reminder only — new buys deliver OLC
          ERC-20 to your BlockDAG wallet after on-chain verify. Full status + retry on Claim / Token Distribution.
        </p>
        {purchases.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No local purchases yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {purchases.slice(0, 8).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-panel/50 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono text-slate-200">
                    {p.payAmount} {p.payAsset}
                  </span>
                  <span className="text-slate-500"> → </span>
                  <span className="text-gold-bright">{p.olcEstimated} OLC</span>
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-cyan-accent">
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === "locked_pending_chain" &&
                    p.txHash &&
                    !p.txHash.startsWith("external:") && (
                      <button
                        type="button"
                        className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-500/10"
                        disabled={retryBusy}
                        onClick={() => void retryLockCredit(p.txHash)}
                      >
                        {retryBusy && pendingLockRetryTx === p.txHash ? "…" : "Retry deliver"}
                      </button>
                    )}
                  {p.txHash.startsWith("0x") ? (
                    <a
                      className="link-accent font-mono"
                      href={explorerTxUrl(p.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View tx
                    </a>
                  ) : (
                    <span className="font-mono text-slate-500 text-[10px]">
                      {p.txHash.startsWith("order:") ? "order" : p.txHash.slice(0, 12)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
