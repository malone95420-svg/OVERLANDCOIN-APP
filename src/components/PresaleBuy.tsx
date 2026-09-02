"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  savePurchase,
  updatePurchase,
  type LocalPurchase,
} from "@/lib/purchases";
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
  solanaPayUri,
} from "@/components/presale/checkoutAssets";
import {
  ensureBlockdagNetwork,
  ensureEthereumMainnet,
  noInjectedProviderMessage,
} from "@/components/presale/ensureNetworks";
import {
  formatWalletError,
  isUserRejection,
  walletErrorCode,
} from "@/components/presale/walletErrors";
import { useLockedOlcBalance } from "@/components/presale/useLockedOlcBalance";

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
      return "Locking OLC…";
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
    };
  }
}

export function PresaleBuy() {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-6 text-sm text-slate-400">
        Loading wallet…
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

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;
  const { switchChainAsync } = useSwitchChain();
  const lockedBal = useLockedOlcBalance(address);

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
  const [manualFallback, setManualFallback] = useState(false);

  const selected = assets.find((a) => a.id === assetId) ?? assets[0];
  const onChain = selected ? isOnChainAsset(selected) : false;

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
    setPurchases(loadPurchases());
    const pending = listPendingLockCredits();
    if (pending.length > 0) {
      setPendingLockRetryTx(pending[0].txHash);
      setSuccessNote(
        `You have ${pending.length} purchase(s) with payment confirmed but PresaleLock credit still pending. Use Retry credit to recover.`,
      );
    }
    const t = setInterval(() => setPurchases(loadPurchases()), 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setError(null);
    setActiveOrder(null);
    setDepositTxHash("");
    setManualFallback(false);
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
          deliveryNote: "Delivering to PresaleLock…",
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
          },
        };
      };

      setProgress("locking_olc");
      let { res, data } = await attempt();
      if (!(data.status === "locked" && data.creditTxHash) && opts?.retryOnce !== false) {
        await new Promise((r) => setTimeout(r, 1500));
        ({ res, data } = await attempt());
      }

      const olcLabel = formatNum(olc, 4);
      if (data.status === "locked" && data.creditTxHash) {
        const next = updatePurchase(paymentTxHash, {
          status: "locked",
          creditTxHash: data.creditTxHash,
          olcAmount: typeof data.olcAmount === "number" ? data.olcAmount : olc,
          from: address,
          deliveryNote: undefined,
        });
        setPurchases(next);
        setPendingLockRetryTx(null);
        setSuccessExplorer(explorerTxUrl(paymentTxHash));
        setSuccessNote(
          `${olcLabel} OLC locked to your wallet. Non-transferable until listing.`,
        );
        void lockedBal.refresh();
        return true;
      }

      const next = updatePurchase(paymentTxHash, {
        status: "locked_pending_chain",
        olcAmount: olc,
        from: address,
        deliveryNote:
          data.message ||
          data.error ||
          "Awaiting lock contract — payment is on-chain; use Retry credit.",
      });
      setPurchases(next);
      setPendingLockRetryTx(paymentTxHash);
      setSuccessExplorer(explorerTxUrl(paymentTxHash));
      setSuccessNote(
        `Payment confirmed (${paymentTxHash.slice(0, 10)}…). ${olcLabel} OLC recorded locally but PresaleLock credit failed — tap Retry credit. ${
          data.notConfigured || res.status === 503
            ? "Deliver service may need fund/RPC config."
            : data.error || data.message || ""
        }`,
      );
      void lockedBal.refresh();
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
      lockedBal,
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
      const endpoint =
        payChain === "blockdag" ? "/api/presale/deliver" : "/api/presale/confirm-deposit";
      const res = await fetch(endpoint, {
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
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        creditTxHash?: string;
        message?: string;
        error?: string;
        olcAmount?: number;
      };
      if (data.status === "locked" && data.creditTxHash) {
        setPurchases(
          updatePurchase(paymentTxHash, {
            status: "locked",
            creditTxHash: data.creditTxHash,
            olcAmount: typeof data.olcAmount === "number" ? data.olcAmount : olcAmount,
            from: buyer,
            deliveryNote: undefined,
          }),
        );
        setPendingLockRetryTx(null);
        setSuccessNote(
          `PresaleLock credit confirmed for ${formatNum(olcAmount, 4)} OLC.`,
        );
        setSuccessExplorer(explorerTxUrl(data.creditTxHash));
        void lockedBal.refresh();
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
      setPurchases(loadPurchases());
    }
  }

  async function ensureOnBlockdag() {
    setProgress("switching_network");
    try {
      await ensureBlockdagNetwork();
    } catch {
      /* fall through to wagmi switch */
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

  async function onBuyOnChain() {
    if (!selected?.onChain) {
      setError("No BlockDAG payment path for this asset.");
      return;
    }
    if (!isConnected || !address) {
      setError("Connect your BlockDAG wallet first — OLC locks to that address.");
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
    let hash: Hash | undefined;
    try {
      await ensureOnBlockdag();
      setProgress("confirm_wallet");

      const treasury = SITE.treasuryAddress as Address;
      const payStr =
        selected.onChain.kind === "native"
          ? Number(derived.payAmount).toFixed(18).replace(/\.?0+$/, "") || "0"
          : Number(derived.payAmount).toFixed(Math.min(decimals, 18));

      if (selected.onChain.kind === "native") {
        hash = await sendTransactionAsync({
          to: treasury,
          value: parseEther(payStr),
          chainId: TOKEN.chainId,
        });
      } else {
        hash = await writeContractAsync({
          address: selected.onChain.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [treasury, parseUnits(payStr, decimals)],
          chainId: TOKEN.chainId,
        });
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
      if (!waited.ok) {
        setSuccessNote(
          `Payment submitted (${hash.slice(0, 10)}…) but confirmation timed out. Attempting lock credit…`,
        );
      }

      await deliverLocked(hash, { retryOnce: true });
    } catch (e) {
      if (isUserRejection(e)) {
        setError("Transaction canceled in wallet.");
      } else {
        const raw = formatWalletError(e, "Transaction failed");
        if (/sendRawTransaction|method not found/i.test(raw)) {
          setError(
            "Your wallet’s BlockDAG RPC can’t send txs. Tap Connect → Switch/Add BlockDAG (uses rpc.west / rpc.east) or set RPC to https://rpc.west.bdag-us.org/ or https://rpc.east.bdag-us.org/",
          );
        } else {
          setError(raw);
        }
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
      setError("Connect your BlockDAG wallet first — OLC locks to that address.");
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

    const res = await fetch("/api/presale/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
      setError(friendlyPaymentError(data.error) || "Could not create pay order.");
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
    return order;
  }

  async function confirmOrder(
    order: ActivePayOrder,
    paymentTxHash?: string,
  ): Promise<boolean> {
    setProgress("locking_olc");
    setConfirmBusy(true);
    const pasted = paymentTxHash ? parsePaymentTxRef(paymentTxHash) : parsePaymentTxRef(depositTxHash);
    const localKey = pasted || `order:${order.orderId}`;

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
      deliveryNote: pasted ? "Verifying payment on-chain…" : "Scanning for matching deposit…",
    };
    setPurchases(savePurchase(pending));
    setPendingLockRetryTx(localKey);

    try {
      const res = await fetch(`/api/presale/orders/${order.orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pasted ? { paymentTxHash: pasted } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        creditTxHash?: string;
        message?: string;
        error?: string;
        olcAmount?: number;
        verified?: boolean;
        paymentTxHash?: string;
      };

      const paymentKey = data.paymentTxHash || pasted || localKey;
      if (data.status === "locked" && data.creditTxHash) {
        const olc =
          typeof data.olcAmount === "number" ? data.olcAmount : order.olcAmount;
        if (paymentKey !== localKey) {
          setPurchases(
            savePurchase({
              ...pending,
              txHash: paymentKey,
              id: `${Date.now()}-${paymentKey.slice(0, 12)}`,
              status: "locked",
              creditTxHash: data.creditTxHash,
              olcAmount: olc,
              deliveryNote: undefined,
            }),
          );
        } else {
          setPurchases(
            updatePurchase(localKey, {
              status: "locked",
              creditTxHash: data.creditTxHash,
              olcAmount: olc,
              deliveryNote: undefined,
            }),
          );
        }
        setPendingLockRetryTx(null);
        setActiveOrder(null);
        setManualFallback(false);
        setSuccessNote(
          `${formatNum(olc, 4)} OLC locked to your wallet. Non-transferable until listing.`,
        );
        setSuccessExplorer(
          paymentKey.startsWith("0x") ? explorerTxUrl(paymentKey) : explorerTxUrl(data.creditTxHash),
        );
        void lockedBal.refresh();
        return true;
      }

      if (data.verified && data.status === "locked_pending_chain") {
        const olc =
          typeof data.olcAmount === "number" ? data.olcAmount : order.olcAmount;
        setPurchases(
          updatePurchase(localKey, {
            status: "locked_pending_chain",
            olcAmount: olc,
            deliveryNote:
              data.message || data.error || "Payment verified — awaiting PresaleLock credit.",
          }),
        );
        setPendingLockRetryTx(data.paymentTxHash || localKey);
        setSuccessNote(
          `Payment verified. ${formatNum(olc, 4)} OLC pending PresaleLock credit. ${data.error || data.message || ""}`,
        );
        void lockedBal.refresh();
        return false;
      }

      setError(
        friendlyPaymentError(data.error || data.message) ||
          "No matching payment found yet — wait a minute and try again.",
      );
      setPurchases(
        updatePurchase(localKey, {
          status: "pending_external",
          deliveryNote: data.error || "Unverified",
        }),
      );
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm request failed");
      return false;
    } finally {
      setConfirmBusy(false);
      setPurchases(loadPurchases());
    }
  }

  async function payWithEvmWallet(order: ActivePayOrder): Promise<"paid" | "manual" | "canceled"> {
    const asset = order.payAsset.toUpperCase();
    if (!isEvmDepositAsset(asset)) return "manual";

    const eth = getEthereumPaymentProvider() ?? getAnyInjectedProvider();
    if (!eth?.request) {
      setManualFallback(true);
      setError(noInjectedProviderMessage(asset, order.payAmount));
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
      setProgress("confirming_payment");
      await new Promise((r) => setTimeout(r, 2500));
      await confirmOrder(order, txHash);
      return "paid";
    } catch (e) {
      if (isUserRejection(e)) {
        setError("Payment rejected in wallet.");
        return "canceled";
      }
      const msg = formatWalletError(e);
      if (/No Ethereum wallet detected|No injected wallet/i.test(msg)) {
        setManualFallback(true);
        setError(msg);
        return "manual";
      }
      setError(msg || "Wallet payment failed.");
      setManualFallback(true);
      return "manual";
    }
  }

  async function payWithSolana(order: ActivePayOrder) {
    setProgress("confirm_wallet");
    const uri = solanaPayUri(order.depositAddress, order.payAmount);
    const phantom = typeof window !== "undefined" ? window.solana : undefined;
    if (phantom?.isPhantom) {
      try {
        await phantom.connect();
      } catch {
        /* still open URI */
      }
    }
    window.location.href = uri;
    setTimeout(() => {
      try {
        window.open(uri, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
    }, 400);
    setManualFallback(true);
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
        // manual / canceled — keep order card visible
        setManualFallback(true);
        return;
      }

      if (order.payAsset.toUpperCase() === "SOL") {
        await payWithSolana(order);
        return;
      }

      // BTC and anything else: copy/QR only
      setManualFallback(true);
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

  const showOrderCard = Boolean(
    activeOrder &&
      (manualFallback ||
        activeOrder.payAsset.toUpperCase() === "BTC" ||
        activeOrder.payAsset.toUpperCase() === "SOL" ||
        // Keep card visible while confirming / after wallet submit so I've paid is reachable
        confirmBusy ||
        Boolean(depositTxHash)),
  );

  return (
    <section className="card min-w-0 w-full max-w-full overflow-hidden border-gold/40 shadow-gold !p-4 sm:!p-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white">Buy OLC</h2>
          <p className="mt-1 text-sm text-slate-400">
            Live batch {batch.batch}:{" "}
            <span className="font-semibold text-gold-bright">${batchPrice.toFixed(3)}</span> / OLC.
            One checkout — pick how you pay, OLC locks to your BlockDAG wallet.
          </p>
        </div>
        <ConnectWallet />
      </div>

      {/* Connected wallet + locked balance */}
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-panel/60 px-3 py-2.5">
        {isConnected && address ? (
          <>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Lock to</p>
              <p className="font-mono text-sm text-cyan-100">{shortAddr(address)}</p>
            </div>
            <div className="min-w-0 border-l border-border pl-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Locked OLC</p>
              <p className="font-semibold text-gold-bright">
                {lockedBal.locked != null ? formatNum(lockedBal.locked, 4) : lockedBal.loading ? "…" : "0"}
              </p>
            </div>
            {isConnected && !onCorrectChain && (
              <button
                type="button"
                className="ml-auto rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100"
                onClick={() => void ensureOnBlockdag().catch((e) => setError(formatWalletError(e)))}
              >
                Switch to BlockDAG
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Connect a BlockDAG wallet — purchased OLC locks to that address.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-1">
        <p>
          <strong>Safety:</strong> OLC credits only after on-chain payment verify. Wrong network = lost funds.
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
      <div className="mt-5 space-y-3">
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
      <div className="mt-4">
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

      {/* Quote breakdown */}
      <div className="mt-4 rounded-xl border border-gold/30 bg-bg-panel/80 p-3 text-sm space-y-1.5">
        <div className="flex justify-between gap-2 text-xs">
          <span className="text-slate-400">Presale batch</span>
          <span className="font-mono text-gold-bright">${batchPrice.toFixed(3)} / OLC</span>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <span className="shrink-0 text-slate-400">You pay</span>
          <span className="min-w-0 break-all text-right font-mono text-slate-100">
            {formatNum(derived.payAmount, 8)} {selected?.symbol} ≈ ${formatNum(derived.usd, 4)}
          </span>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-1.5 text-sm">
          <span className="text-slate-300">You receive</span>
          <span className="font-semibold text-gold-bright">
            {formatNum(derived.olc, 4)} OLC{" "}
            <span className="text-[10px] font-normal text-slate-400">(locked)</span>
          </span>
        </div>
        {selected?.id === "BDAG" && !prices.hasLiveBdag && (
          <p className="text-[11px] text-amber-300">
            Live BDAG price unavailable — Buy is blocked until a fresh quote loads.
          </p>
        )}
      </div>

      {/* Primary Buy */}
      <div className="mt-5 space-y-3">
        <button
          type="button"
          className="btn-primary w-full py-3 text-base"
          disabled={buyDisabled && isConnected}
          onClick={() => {
            if (!isConnected) return;
            void onBuy();
          }}
        >
          {primaryLabel}
        </button>
        {!isConnected && (
          <div className="flex justify-center">
            <ConnectWallet />
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
        <div className="mt-5 min-w-0 rounded-xl border border-cyan-accent/30 bg-cyan-accent/5 p-3 space-y-3 sm:p-4">
          <p className="text-sm font-semibold text-cyan-100">
            Send exactly {formatNum(activeOrder.payAmount, 8)} {activeOrder.payAsset}
          </p>
          <p className="text-xs text-slate-400">
            → {formatNum(activeOrder.olcAmount, 4)} OLC locked
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
                <button
                  type="button"
                  className="w-full rounded-xl border border-purple-400/50 bg-purple-500/10 px-4 py-2.5 text-sm font-semibold text-purple-100 sm:w-auto"
                  onClick={() => void payWithSolana(activeOrder)}
                >
                  Open Phantom / Solana Pay
                </button>
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
                setActiveOrder(null);
                setDepositTxHash("");
                setManualFallback(false);
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
          {pendingLockRetryTx && (
            <button
              type="button"
              className="btn-primary !text-xs !px-3 !py-1.5"
              disabled={retryBusy}
              onClick={() => void retryLockCredit(pendingLockRetryTx)}
            >
              {retryBusy ? "Retrying…" : "Retry credit"}
            </button>
          )}
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

      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-white">Recent purchases (this browser)</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Local reminder only — OLC credits only after on-chain verify.
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
                    !p.txHash.startsWith("external:") &&
                    !p.txHash.startsWith("order:") && (
                      <button
                        type="button"
                        className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-500/10"
                        disabled={retryBusy}
                        onClick={() => void retryLockCredit(p.txHash)}
                      >
                        {retryBusy && pendingLockRetryTx === p.txHash ? "…" : "Retry credit"}
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
