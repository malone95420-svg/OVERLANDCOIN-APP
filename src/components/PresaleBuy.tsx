"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSendTransaction,
  useWriteContract,
} from "wagmi";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits, type Address, type Hash } from "viem";
import { waitForBlockdagReceipt } from "@/lib/waitForBlockdagReceipt";
import { ConnectWallet } from "@/components/ConnectWallet";
import { CopyAddress } from "@/components/CopyAddress";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { useLivePrices } from "@/hooks/useLivePrices";
import {
  getAcceptedPayAssets,
  liveUsdForAsset,
  paymentMode,
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
import { getAnyInjectedProvider } from "@/lib/injectedWallets";
import { PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerTxUrl, explorerAddressUrl } from "@/lib/token";

type InputMode = "olc" | "pay";

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

function liveBatch() {
  return PRESALE_BATCHES.find((b) => b.status === "LIVE") ?? PRESALE_BATCHES[0];
}

function formatNum(n: number, maxFrac = 6): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

function payChainForAsset(id: AcceptedPayAsset["id"]): "blockdag" | "ethereum" | "bitcoin" | "solana" {
  switch (id) {
    case "BDAG":
    case "BDUSD":
      return "blockdag";
    case "ETH":
    case "USDT":
    case "USDC":
      return "ethereum";
    case "BTC":
      return "bitcoin";
    case "SOL":
      return "solana";
    default:
      return "ethereum";
  }
}

function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=168x168&margin=8&data=${encodeURIComponent(data)}`;
}

/** Ethereum mainnet ERC-20 deposit tokens (exact amounts for pay orders). */
const ETH_MAINNET_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address;
const ETH_MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;
const ETHEREUM_MAINNET_HEX = "0x1";

async function ensureEthereumMainnet(): Promise<void> {
  const eth = getAnyInjectedProvider();
  if (!eth?.request) {
    throw new Error("No injected wallet found (MetaMask / OKX / etc.).");
  }
  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (current?.toLowerCase() === ETHEREUM_MAINNET_HEX) return;
  } catch {
    /* proceed to switch */
  }
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ETHEREUM_MAINNET_HEX }],
    });
  } catch (switchErr) {
    const code =
      switchErr && typeof switchErr === "object" && "code" in switchErr
        ? Number((switchErr as { code: unknown }).code)
        : undefined;
    if (code === 4001) {
      throw new Error("Switch to Ethereum mainnet was rejected in wallet.");
    }
    throw new Error(
      "Could not switch wallet to Ethereum mainnet (chainId 1). Switch manually, then retry.",
    );
  }
}

function solanaPayUri(depositAddress: string, solAmount: number): string {
  const amount = Number(solAmount.toFixed(9)).toString();
  const params = new URLSearchParams({
    amount,
    label: "OVERLANDCOIN Presale",
    message: "OLC locked until listing",
  });
  return `solana:${depositAddress}?${params.toString()}`;
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
  const assets = useMemo(() => getAcceptedPayAssets(), []);
  const prices = useLivePrices();

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;

  const [assetId, setAssetId] = useState<AcceptedPayAsset["id"]>("BDAG");
  const [mode, setMode] = useState<InputMode>("olc");
  const [olcInput, setOlcInput] = useState("1000");
  const [payInput, setPayInput] = useState("10000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<Hash | undefined>();
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [pendingLockRetryTx, setPendingLockRetryTx] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActivePayOrder | null>(null);
  const [phantomBusy, setPhantomBusy] = useState(false);
  const [evmPayBusy, setEvmPayBusy] = useState(false);

  const selected = assets.find((a) => a.id === assetId) ?? assets[0];
  const payMode = paymentMode(selected);

  useEffect(() => {
    setDepositTxHash("");
    setActiveOrder(null);
    // Deposit flow is amount-of-OLC first ("I want 45 OLC")
    if (paymentMode(selected) === "deposit") {
      setMode("olc");
    }
  }, [selected.id]);

  const usdPerPayUnit = liveUsdForAsset(selected, prices);
  const rateSource = sourceLabelForAsset(selected, prices);
  const buyRateReady = rateReadyForBuy(selected, prices);
  const fracDigits = selected.id === "BDAG" ? 8 : selected.id === "BTC" ? 2 : 4;

  const onChainAddress =
    selected.onChain?.kind === "erc20" ? selected.onChain.address : undefined;
  const decimalsHint =
    selected.onChain?.kind === "native"
      ? selected.onChain.decimalsHint
      : selected.onChain?.kind === "erc20"
        ? selected.onChain.decimalsHint
        : 18;

  const { data: onChainDecimals } = useReadContract({
    address: onChainAddress,
    abi: erc20Abi,
    functionName: "decimals",
    query: {
      enabled: Boolean(onChainAddress) && onCorrectChain && payMode === "onchain",
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
        `You have ${pending.length} purchase(s) with payment confirmed but PresaleLock credit still pending. Use Retry lock credit to recover.`,
      );
    }
    const t = setInterval(() => setPurchases(loadPurchases()), 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setError(null);
    if (!pendingLockRetryTx) setSuccessNote(null);
  }, [assetId, pendingLockRetryTx]);

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
  const [waitingTx, setWaitingTx] = useState(false);

  const buildRecord = useCallback(
    (opts: {
      txHash: string;
      status: LocalPurchase["status"];
      payMethod: "onchain" | "deposit";
    }): LocalPurchase => {
      const rate = usdPerPayUnit ?? 0;
      return {
        id: `${Date.now()}-${opts.txHash.slice(0, 12)}`,
        txHash: opts.txHash,
        timestamp: Date.now(),
        from: address,
        payAsset: selected.symbol,
        payAmount: formatNum(derived.payAmount, 8),
        olcEstimated: formatNum(derived.olc, 4),
        batchPriceUsdt: batchPrice,
        batchPriceUsed: batchPrice,
        usdRateUsed: rate,
        usdPaid: Number(derived.usd.toFixed(8)),
        usdEstimated: Number(derived.usd.toFixed(8)),
        status: opts.status,
        payMethod: opts.payMethod,
        depositAddress: selected.depositAddress,
        depositNetwork: selected.depositNetwork,
      };
    },
    [
      address,
      selected.symbol,
      selected.depositAddress,
      selected.depositNetwork,
      derived.payAmount,
      derived.olc,
      derived.usd,
      batchPrice,
      usdPerPayUnit,
    ]
  );

  const deliverLocked = useCallback(
    async (paymentTxHash: string) => {
      const base = buildRecord({
        txHash: paymentTxHash,
        status: "locked_pending_chain",
        payMethod: "onchain",
      });
      const withAmount: LocalPurchase = {
        ...base,
        from: address,
        olcAmount: derived.olc,
        deliveryNote: "Delivering to PresaleLock…",
      };
      setPurchases(savePurchase(withAmount));

      try {
        const res = await fetch("/api/presale/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyer: address,
            olcAmount: derived.olc,
            paymentTxHash,
            payChain: payChainForAsset(selected.id),
            batchPriceUsed: batchPrice,
            usdRateUsed: usdPerPayUnit ?? 0,
            usdPaid: Number(derived.usd.toFixed(8)),
            payAsset: selected.symbol,
            payAmount: formatNum(derived.payAmount, 8),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          creditTxHash?: string;
          message?: string;
          error?: string;
          notConfigured?: boolean;
          olcAmount?: number;
        };

        const olcLabel = formatNum(derived.olc, 4);
        if (data.status === "locked" && data.creditTxHash) {
          const next = updatePurchase(paymentTxHash, {
            status: "locked",
            creditTxHash: data.creditTxHash,
            olcAmount: typeof data.olcAmount === "number" ? data.olcAmount : derived.olc,
            from: address,
            deliveryNote: undefined,
          });
          setPurchases(next);
          setPendingLockRetryTx(null);
          setSuccessNote(
            `Payment confirmed. ${olcLabel} OLC credited to PresaleLock (non-transferable until listing). Credit tx ${data.creditTxHash.slice(0, 10)}…`
          );
          return;
        }

        const next = updatePurchase(paymentTxHash, {
          status: "locked_pending_chain",
          olcAmount: derived.olc,
          from: address,
          deliveryNote:
            data.message ||
            data.error ||
            "Awaiting lock contract config — not transferable wallet delivery.",
        });
        setPurchases(next);
        setPendingLockRetryTx(paymentTxHash);
        setSuccessNote(
          `Payment confirmed. ${olcLabel} OLC recorded as locked locally. On-chain PresaleLock credit is still pending — use Retry lock credit below (Locked balance shows max of on-chain and local). ${
            data.notConfigured || res.status === 503
              ? "Deliver service may need contract/key config."
              : data.error || data.message || ""
          }`
        );
      } catch (e) {
        const next = updatePurchase(paymentTxHash, {
          status: "locked_pending_chain",
          olcAmount: derived.olc,
          from: address,
          deliveryNote: e instanceof Error ? e.message : "Deliver request failed",
        });
        setPurchases(next);
        setPendingLockRetryTx(paymentTxHash);
        setSuccessNote(
          `Payment confirmed. ${formatNum(derived.olc, 4)} OLC recorded as locked locally. Deliver API unreachable — use Retry lock credit when ready.`
        );
      }
    },
    [
      buildRecord,
      address,
      derived.olc,
      derived.usd,
      derived.payAmount,
      batchPrice,
      usdPerPayUnit,
      selected.symbol,
      selected.id,
    ]
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
      const assetIdRetry = (record.payAsset as AcceptedPayAsset["id"]) || selected.id;
      const payChain = payChainForAsset(assetIdRetry);
      const endpoint =
        payChain === "blockdag"
          ? "/api/presale/deliver"
          : "/api/presale/confirm-deposit";
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
        const next = updatePurchase(paymentTxHash, {
          status: "locked",
          creditTxHash: data.creditTxHash,
          olcAmount: typeof data.olcAmount === "number" ? data.olcAmount : olcAmount,
          from: buyer,
          deliveryNote: undefined,
        });
        setPurchases(next);
        setPendingLockRetryTx(null);
        setSuccessNote(
          `PresaleLock credit confirmed for ${formatNum(olcAmount, 4)} OLC. Credit tx ${data.creditTxHash.slice(0, 10)}…`
        );
      } else {
        const next = updatePurchase(paymentTxHash, {
          status: "locked_pending_chain",
          olcAmount,
          from: buyer,
          deliveryNote: data.message || data.error || "Still pending on-chain credit",
        });
        setPurchases(next);
        setPendingLockRetryTx(paymentTxHash);
        setSuccessNote(
          `Still pending on-chain credit. Local locked OLC remains visible. ${data.error || data.message || ""}`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryBusy(false);
      setPurchases(loadPurchases());
    }
  }

  async function onBuyOnChain() {
    setError(null);
    setSuccessNote(null);
    setPendingLockRetryTx(null);
    if (!isConnected || !address) {
      setError("Connect a wallet first.");
      return;
    }
    if (!onCorrectChain) {
      setError(`Switch to BlockDAG Mainnet (chainId ${TOKEN.chainId}) before buying.`);
      return;
    }
    if (!buyRateReady) {
      setError(
        selected.id === "BDAG"
          ? "Live BDAG/USD price required to Buy. Wait for a fresh quote or refresh prices — Buy is blocked until a live rate is available."
          : `Live ${selected.symbol}/USD price required to Buy.`
      );
      return;
    }
    if (!(derived.olc > 0) || !(derived.payAmount > 0)) {
      setError("Enter a valid amount.");
      return;
    }
    if (!selected.onChain) {
      setError("No BlockDAG payment path for this asset.");
      return;
    }

    const treasury = SITE.treasuryAddress as Address;
    setBusy(true);
    setWaitingTx(false);
    let hash: Hash | undefined;
    try {
      const payStr =
        selected.onChain.kind === "native"
          ? Number(derived.payAmount).toFixed(18).replace(/\.?0+$/, "") || "0"
          : Number(derived.payAmount).toFixed(Math.min(decimals, 18));

      if (selected.onChain.kind === "native") {
        const value = parseEther(payStr);
        hash = await sendTransactionAsync({
          to: treasury,
          value,
          chainId: TOKEN.chainId,
        });
      } else {
        const amount = parseUnits(payStr, decimals);
        hash = await writeContractAsync({
          address: selected.onChain.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [treasury, amount],
          chainId: TOKEN.chainId,
        });
      }

      setPendingHash(hash);

      const pendingRecord = {
        ...buildRecord({
          txHash: hash,
          status: "locked_pending_chain" as const,
          payMethod: "onchain" as const,
        }),
        from: address,
        olcAmount: derived.olc,
        deliveryNote: "Payment submitted — confirming on BlockDAG…",
      };
      setPurchases(savePurchase(pendingRecord));
      setPendingLockRetryTx(hash);
      setSuccessNote(
        `Payment submitted (${hash.slice(0, 10)}…). Confirming on BlockDAG, then crediting PresaleLock…`
      );

      setWaitingTx(true);
      const waited = await waitForBlockdagReceipt(hash, { timeoutMs: 90_000, pollMs: 2_000 });
      setWaitingTx(false);

      if (!waited.ok) {
        setSuccessNote(
          `Payment submitted (${hash.slice(0, 10)}…) but confirmation timed out on public RPCs. Attempting PresaleLock credit anyway — use Retry lock credit if needed.`
        );
      }

      await deliverLocked(hash);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      if (/rejected|denied|canceled|cancelled/i.test(raw)) {
        setError("Transaction canceled in wallet");
      } else if (/sendRawTransaction|method not found/i.test(raw)) {
        setError(
          "Your wallet’s BlockDAG RPC can’t send txs. Tap Switch/Add BlockDAG (uses rpc.west / rpc.east) or in OKX/MetaMask set BlockDAG RPC to https://rpc.west.bdag-us.org/ or https://rpc.east.bdag-us.org/",
        );
      } else {
        setError(raw);
      }
      if (hash) {
        setPendingLockRetryTx(hash);
      }
    } finally {
      setWaitingTx(false);
      setBusy(false);
      setPendingHash(undefined);
    }
  }

  async function onCreatePayOrder() {
    setError(null);
    setSuccessNote(null);
    if (!isConnected || !address) {
      setError("Step 1: Connect your BlockDAG wallet first — OLC locks to that address.");
      return;
    }
    if (!buyRateReady) {
      setError(`Live ${selected.symbol}/USD price required before buying.`);
      return;
    }
    if (!(derived.olc > 0) || !(derived.payAmount > 0)) {
      setError("Enter a valid amount.");
      return;
    }
    if (!selected.depositAddress) {
      setError("No deposit address configured.");
      return;
    }

    setOrderBusy(true);
    try {
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
        return;
      }
      setActiveOrder({
        orderId: data.orderId,
        buyer: data.buyer || address,
        payAsset: data.payAsset || selected.symbol,
        payAmount: data.payAmount ?? derived.payAmount,
        olcAmount: data.olcAmount ?? derived.olc,
        depositAddress: data.depositAddress,
        depositNetwork: data.depositNetwork || selected.depositNetwork || "",
        expiresAt: data.expiresAt ?? Date.now() + 45 * 60_000,
        usdPaid: data.usdPaid,
      });
      setDepositTxHash("");
      setSuccessNote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create pay order");
    } finally {
      setOrderBusy(false);
    }
  }

  async function onPayWithSolanaWallet() {
    if (!activeOrder || activeOrder.payAsset !== "SOL") return;
    setPhantomBusy(true);
    setError(null);
    try {
      const uri = solanaPayUri(activeOrder.depositAddress, activeOrder.payAmount);
      const phantom = typeof window !== "undefined" ? window.solana : undefined;
      if (phantom?.isPhantom) {
        try {
          await phantom.connect();
        } catch {
          /* user may reject connect — still open pay URI */
        }
      }
      // Solana Pay transfer request — Phantom / Solflare handle this
      window.location.href = uri;
      // Fallback: also try opening in new tab after a tick if still on page
      setTimeout(() => {
        try {
          window.open(uri, "_blank", "noopener,noreferrer");
        } catch {
          /* ignore */
        }
      }, 400);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open Solana wallet — copy the address and send manually.",
      );
    } finally {
      setPhantomBusy(false);
    }
  }

  async function onPayWithEvmWallet() {
    if (!activeOrder) return;
    const asset = activeOrder.payAsset.toUpperCase();
    if (asset !== "ETH" && asset !== "USDT" && asset !== "USDC") return;

    setEvmPayBusy(true);
    setError(null);
    setSuccessNote(null);
    try {
      await ensureEthereumMainnet();
      const eth = getAnyInjectedProvider();
      if (!eth?.request) {
        throw new Error("No injected wallet found.");
      }

      let from: string | undefined;
      try {
        const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        from = accounts?.[0];
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e
            ? Number((e as { code: unknown }).code)
            : undefined;
        if (code === 4001) throw new Error("Wallet connect was rejected.");
        throw e instanceof Error ? e : new Error("Could not access wallet accounts.");
      }
      if (!from) throw new Error("No wallet account available.");

      const to = activeOrder.depositAddress as Address;
      let txHash: string | undefined;

      if (asset === "ETH") {
        const fixed = Number(activeOrder.payAmount).toFixed(18);
        const valueWei = parseEther(fixed);
        const valueHex = `0x${valueWei.toString(16)}` as `0x${string}`;
        txHash = (await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to, value: valueHex }],
        })) as string;
      } else {
        const token = asset === "USDT" ? ETH_MAINNET_USDT : ETH_MAINNET_USDC;
        const amount = parseUnits(Number(activeOrder.payAmount).toFixed(6), 6);
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

      if (txHash) {
        setDepositTxHash(txHash);
        setSuccessNote(
          `Wallet payment submitted on Ethereum. Tx ${txHash.slice(0, 10)}… — wait a moment, then tap I’ve paid.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wallet payment failed.";
      if (/4001|user rejected|denied/i.test(msg)) {
        setError("Payment rejected in wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setEvmPayBusy(false);
    }
  }

  async function onConfirmPayOrder() {
    if (!activeOrder) return;
    setError(null);
    setSuccessNote(null);
    setConfirmBusy(true);

    const pasted = parsePaymentTxRef(depositTxHash);
    const localKey = pasted || `order:${activeOrder.orderId}`;

    const pending = {
      ...buildRecord({
        txHash: localKey,
        status: "locked_pending_chain" as const,
        payMethod: "deposit" as const,
      }),
      payAsset: activeOrder.payAsset,
      payAmount: formatNum(activeOrder.payAmount, 8),
      olcEstimated: formatNum(activeOrder.olcAmount, 4),
      olcAmount: activeOrder.olcAmount,
      from: activeOrder.buyer,
      depositAddress: activeOrder.depositAddress,
      depositNetwork: activeOrder.depositNetwork,
      deliveryNote: pasted
        ? "Verifying payment on-chain…"
        : "Scanning for matching deposit…",
    };
    setPurchases(savePurchase(pending));
    setPendingLockRetryTx(localKey);

    try {
      const res = await fetch(`/api/presale/orders/${activeOrder.orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pasted ? { paymentTxHash: pasted } : {},
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        creditTxHash?: string;
        message?: string;
        error?: string;
        olcAmount?: number;
        verified?: boolean;
        paymentTxHash?: string;
        payAmount?: number;
      };

      const paymentKey = data.paymentTxHash || pasted || localKey;

      if (data.status === "locked" && data.creditTxHash) {
        const olc =
          typeof data.olcAmount === "number" ? data.olcAmount : activeOrder.olcAmount;
        // Re-key local purchase to real payment hash when auto-found
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
        setSuccessNote(
          `Payment verified. ${formatNum(olc, 4)} OLC credited to PresaleLock for ${activeOrder.buyer.slice(0, 8)}… Credit tx ${data.creditTxHash.slice(0, 10)}…`,
        );
        return;
      }

      if (data.verified && data.status === "locked_pending_chain") {
        const olc =
          typeof data.olcAmount === "number" ? data.olcAmount : activeOrder.olcAmount;
        setPurchases(
          updatePurchase(localKey, {
            status: "locked_pending_chain",
            olcAmount: olc,
            deliveryNote:
              data.message ||
              data.error ||
              "Payment verified — awaiting PresaleLock credit config.",
          }),
        );
        setPendingLockRetryTx(data.paymentTxHash || localKey);
        setSuccessNote(
          `Payment verified on-chain. ${formatNum(olc, 4)} OLC pending PresaleLock credit. ${data.error || data.message || ""}`,
        );
        return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm request failed");
    } finally {
      setConfirmBusy(false);
      setPurchases(loadPurchases());
    }
  }

  const onChainBuyDisabled =
    busy ||
    waitingTx ||
    !onCorrectChain ||
    !(derived.olc > 0) ||
    !buyRateReady;

  const orderExpiresInMin = activeOrder
    ? Math.max(0, Math.ceil((activeOrder.expiresAt - Date.now()) / 60_000))
    : 0;

  return (
    <section className="card border-gold/40 shadow-gold">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Buy OLC</h2>
          <p className="mt-1 text-sm text-slate-400">
            Live batch {batch.batch}:{" "}
            <span className="font-semibold text-gold-bright">${batchPrice.toFixed(3)}</span> / OLC.
            Prefer <strong className="text-slate-200">BDAG / BDUSD</strong> on BlockDAG for instant
            verify → lock. USDT / USDC / ETH / BTC / SOL use a simple 3-step deposit.
          </p>
        </div>
        <ConnectWallet />
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-1.5">
        <p>
          <strong>Safety:</strong> OLC only credits after we see your payment on-chain. Wrong
          network = lost funds.
        </p>
        <p>
          On-chain Buy is BlockDAG Mainnet only (chainId {TOKEN.chainId}). Treasury{" "}
          <a
            className="link-accent font-mono"
            href={explorerAddressUrl(SITE.treasuryAddress)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {SITE.treasuryAddress}
          </a>
          .
        </p>
        <p>
          Successful buys credit OLC into a <strong>PresaleLock</strong> — yours immediately, but
          non-transferable until exchange listing unlock.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-400">Pay with (accepted only)</span>
          <select
            className="mt-1 w-full rounded-xl border border-border bg-bg-panel px-3 py-2.5 text-white"
            value={selected.id}
            onChange={(e) => setAssetId(e.target.value as AcceptedPayAsset["id"])}
          >
            {assets.map((o) => {
              const m = paymentMode(o);
              const tag =
                m === "onchain" ? "instant" : m === "deposit" ? "deposit" : "quote";
              return (
                <option key={o.id} value={o.id}>
                  {o.label} ({tag})
                </option>
              );
            })}
          </select>
          <span className="mt-1 block text-[11px] font-mono text-cyan-accent/90">
            Live {selected.symbol}/USD: ${formatUsdPrice(usdPerPayUnit, fracDigits)}
            {rateSource ? ` (${rateSource})` : ""}
          </span>
          {selected.depositNote && (
            <span className="mt-1 block text-[11px] text-slate-500">{selected.depositNote}</span>
          )}
        </label>

        <div className="flex flex-col justify-end gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                mode === "pay"
                  ? "border-gold/60 bg-gold/10 text-gold-bright"
                  : "border-border text-slate-400"
              }`}
              onClick={() => setMode("pay")}
            >
              Enter {selected.symbol} amount
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                mode === "olc"
                  ? "border-gold/60 bg-gold/10 text-gold-bright"
                  : "border-border text-slate-400"
              }`}
              onClick={() => setMode("olc")}
            >
              I want OLC amount
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {mode === "olc" ? (
          <label className="block text-sm">
            <span className="text-slate-400">I want this many OLC</span>
            <input
              type="number"
              min="0"
              step="any"
              value={olcInput}
              onChange={(e) => setOlcInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-white"
            />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="text-slate-400">{selected.symbol} to send</span>
            <input
              type="number"
              min="0"
              step="any"
              value={payInput}
              onChange={(e) => setPayInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-white"
            />
          </label>
        )}

        <div className="rounded-xl border border-gold/30 bg-bg-panel/80 p-3 text-sm space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Breakdown</p>
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-slate-400">Live {selected.symbol} price</span>
            <span className="font-mono text-slate-100">
              ${formatUsdPrice(usdPerPayUnit, fracDigits)}
              <span className="text-slate-500"> ({rateSource})</span>
            </span>
          </div>
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-slate-400">Presale batch price</span>
            <span className="font-mono text-gold-bright">${batchPrice.toFixed(3)} / OLC</span>
          </div>
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-slate-400">You pay</span>
            <span className="font-mono text-slate-100">
              {formatNum(derived.payAmount, 8)} {selected.symbol} ≈ ${formatNum(derived.usd, 4)}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-1.5 text-sm">
            <span className="text-slate-300">You receive</span>
            <span className="font-semibold text-gold-bright">
              {formatNum(derived.olc, 4)} OLC{" "}
              <span className="text-[10px] font-normal text-slate-400">(locked)</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            Exact: ${formatNum(derived.usd, 6)} ÷ ${batchPrice} = {formatNum(derived.olc, 4)} OLC
          </p>
          {selected.id === "BDAG" && !prices.hasLiveBdag && (
            <p className="text-[11px] text-amber-300">
              Live BDAG price unavailable — Buy is blocked until a fresh quote loads.
              {prices.staleEstimateUsd != null && (
                <>
                  {" "}
                  Stale estimate only: ${formatUsdPrice(prices.staleEstimateUsd, 6)} (not used for
                  Buy).
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {payMode === "onchain" && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={onChainBuyDisabled}
              onClick={() => void onBuyOnChain()}
            >
              {busy || waitingTx
                ? waitingTx
                  ? "Confirming…"
                  : "Check wallet…"
                : !buyRateReady
                  ? "Waiting for live price…"
                  : `Buy with ${selected.symbol}`}
            </button>
            {!isConnected && (
              <span className="text-xs text-slate-500">Connect wallet to continue.</span>
            )}
            {isConnected && !onCorrectChain && (
              <span className="text-xs text-amber-300">
                Wrong network — switch to BlockDAG ({TOKEN.chainId}).
              </span>
            )}
          </div>
        )}

        {payMode === "deposit" && selected.depositAddress && (
          <div className="rounded-xl border border-cyan-accent/30 bg-cyan-accent/5 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-cyan-100">
                Deposit buy — {selected.symbol}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                3 steps. OLC locks to your connected BlockDAG wallet after we verify payment.
              </p>
            </div>

            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-accent/50 bg-bg-panel text-xs font-bold text-cyan-100">
                1
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-white">
                  Connect BlockDAG wallet (where OLC will lock)
                </p>
                {isConnected && address ? (
                  <p className="font-mono text-xs text-cyan-100/90">
                    {address.slice(0, 10)}…{address.slice(-6)}
                  </p>
                ) : (
                  <ConnectWallet />
                )}
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-accent/50 bg-bg-panel text-xs font-bold text-cyan-100">
                2
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm font-medium text-white">
                  Send exact quoted amount to the deposit address
                </p>

                {!activeOrder ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      orderBusy ||
                      !buyRateReady ||
                      !(derived.olc > 0) ||
                      !isConnected
                    }
                    onClick={() => void onCreatePayOrder()}
                  >
                    {orderBusy
                      ? "Creating order…"
                      : !buyRateReady
                        ? "Waiting for live price…"
                        : !isConnected
                          ? "Connect wallet first"
                          : `Buy — create ${selected.symbol} pay order`}
                  </button>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-start">
                      <div className="space-y-2">
                        <div className="rounded-lg border border-border bg-bg-panel/80 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">
                            Send exactly
                          </p>
                          <p className="mt-0.5 font-mono text-base text-white">
                            {formatNum(activeOrder.payAmount, 8)} {activeOrder.payAsset}
                          </p>
                          <p className="text-xs text-slate-400">
                            → {formatNum(activeOrder.olcAmount, 4)} OLC locked
                            {activeOrder.usdPaid != null
                              ? ` · ≈ $${formatNum(activeOrder.usdPaid, 4)}`
                              : ""}
                          </p>
                        </div>
                        <CopyAddress
                          address={activeOrder.depositAddress}
                          className="w-full"
                        />
                        <p className="text-[11px] text-amber-200/90">
                          Network: <strong>{activeOrder.depositNetwork}</strong> only — wrong
                          network = lost funds.
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Order {activeOrder.orderId} · expires in ~{orderExpiresInMin} min
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrUrl(activeOrder.depositAddress)}
                          alt="Deposit address QR"
                          width={168}
                          height={168}
                          className="rounded-lg border border-border bg-white p-1"
                        />
                        <span className="text-[10px] text-slate-500">Scan to copy address</span>
                      </div>
                    </div>

                    {activeOrder.payAsset === "SOL" && (
                      <button
                        type="button"
                        className="rounded-xl border border-purple-400/50 bg-purple-500/10 px-4 py-2.5 text-sm font-semibold text-purple-100 hover:bg-purple-500/20 disabled:opacity-60"
                        disabled={phantomBusy}
                        onClick={() => void onPayWithSolanaWallet()}
                      >
                        {phantomBusy
                          ? "Opening wallet…"
                          : "Pay with Phantom / Solana wallet"}
                      </button>
                    )}

                    {(activeOrder.payAsset === "ETH" ||
                      activeOrder.payAsset === "USDT" ||
                      activeOrder.payAsset === "USDC") && (
                      <button
                        type="button"
                        className="rounded-xl border border-sky-400/50 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/20 disabled:opacity-60"
                        disabled={evmPayBusy}
                        onClick={() => void onPayWithEvmWallet()}
                      >
                        {evmPayBusy
                          ? "Confirm in wallet…"
                          : `Pay with wallet (${activeOrder.payAsset} on Ethereum)`}
                      </button>
                    )}

                    <button
                      type="button"
                      className="text-[11px] text-slate-400 underline-offset-2 hover:underline"
                      onClick={() => {
                        setActiveOrder(null);
                        setDepositTxHash("");
                      }}
                    >
                      Cancel order / change amount
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-accent/50 bg-bg-panel text-xs font-bold text-cyan-100">
                3
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-white">
                  Tap I’ve paid — credit my OLC
                </p>
                <p className="text-[11px] text-slate-400">
                  We auto-find a matching deposit when you leave the hash blank. Or paste a tx
                  hash / explorer URL.
                </p>
                <label className="block text-xs text-slate-300">
                  <span className="text-slate-500">Tx hash or explorer URL (optional)</span>
                  <input
                    type="text"
                    value={depositTxHash}
                    onChange={(e) => setDepositTxHash(e.target.value)}
                    placeholder={
                      selected.id === "BTC"
                        ? "Bitcoin txid or mempool.space URL"
                        : selected.id === "SOL"
                          ? "Solana signature or solscan URL"
                          : "0x… or etherscan URL"
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-sm text-white"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!activeOrder}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    !activeOrder ||
                    confirmBusy ||
                    !isConnected
                  }
                  onClick={() => void onConfirmPayOrder()}
                >
                  {confirmBusy
                    ? depositTxHash.trim()
                      ? "Verifying…"
                      : "Scanning for payment…"
                    : "I’ve paid — credit my OLC"}
                </button>
              </div>
            </div>
          </div>
        )}

        {payMode === "quote_only" && (
          <div className="rounded-xl border border-border bg-bg-panel/50 p-4 space-y-2">
            <p className="text-sm text-slate-200">
              {selected.comingSoonNote ??
                `Accepted — on-chain pay for ${selected.symbol} coming soon`}
            </p>
            <p className="text-xs text-slate-500">
              Quote still uses live {selected.symbol}/USD ÷ batch price. Set{" "}
              <code className="text-slate-400">NEXT_PUBLIC_DEPOSIT_{selected.symbol}</code> or a
              BlockDAG pay-token address to enable payment.
            </p>
            <button type="button" className="btn-primary opacity-60 cursor-not-allowed" disabled>
              Pay with {selected.symbol} — coming soon
            </button>
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

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {successNote && (
        <div className="mt-3 rounded-lg border border-cyan-accent/30 bg-cyan-accent/5 p-3 text-sm text-cyan-100 space-y-2">
          <p>{successNote}</p>
          {pendingLockRetryTx && (
            <button
              type="button"
              className="btn-primary !text-xs !px-3 !py-1.5"
              disabled={retryBusy}
              onClick={() => void retryLockCredit(pendingLockRetryTx)}
            >
              {retryBusy ? "Retrying…" : "Retry lock credit"}
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
        <h3 className="text-sm font-semibold text-white">Your recent purchases (this browser)</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stored in localStorage ({`overlandcoin.purchases.v1`}). On-chain buys show{" "}
          <code className="text-slate-400">locked</code> when PresaleLock credit succeeds.
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
                <div>
                  <span className="font-mono text-slate-200">
                    {p.payAmount} {p.payAsset}
                  </span>
                  <span className="text-slate-500"> → </span>
                  <span className="text-gold-bright">{p.olcEstimated} OLC</span>
                  <span className="ml-2 text-slate-500">
                    @ ${formatUsdPrice(p.usdRateUsed ?? null, 6)} · batch $
                    {p.batchPriceUsed ?? p.batchPriceUsdt}
                  </span>
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-cyan-accent">
                    {p.status}
                  </span>
                  {p.creditTxHash && (
                    <a
                      className="ml-2 link-accent font-mono text-[10px]"
                      href={explorerTxUrl(p.creditTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      lock tx
                    </a>
                  )}
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
                      {retryBusy && pendingLockRetryTx === p.txHash ? "…" : "Retry lock"}
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
                  ) : p.txHash.startsWith("external:") || p.txHash.startsWith("order:") ? (
                    <span className="font-mono text-slate-500 text-[10px]">
                      {p.txHash.startsWith("order:") ? "order" : "pending"}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-400 text-[10px]" title={p.txHash}>
                      {p.txHash.slice(0, 12)}…
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
