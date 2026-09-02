"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSendTransaction,
  useWriteContract,
} from "wagmi";
import { erc20Abi, parseEther, parseUnits, type Address, type Hash } from "viem";
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
import { PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerTxUrl, explorerAddressUrl } from "@/lib/token";

type InputMode = "olc" | "pay";

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
  const [mode, setMode] = useState<InputMode>("pay");
  const [olcInput, setOlcInput] = useState("1000");
  const [payInput, setPayInput] = useState("10000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<Hash | undefined>();
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [pendingLockRetryTx, setPendingLockRetryTx] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [depositAck, setDepositAck] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const selected = assets.find((a) => a.id === assetId) ?? assets[0];
  const payMode = paymentMode(selected);

  useEffect(() => {
    setDepositAck(false);
    setDepositTxHash("");
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
    setDepositAck(false);
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
      const assetId = (record.payAsset as AcceptedPayAsset["id"]) || selected.id;
      const payChain = payChainForAsset(assetId);
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

  async function onConfirmExternalDeposit() {
    setError(null);
    setSuccessNote(null);
    if (!isConnected || !address) {
      setError("Connect your BlockDAG wallet first — OLC is credited to that address.");
      return;
    }
    if (!buyRateReady) {
      setError(`Live ${selected.symbol}/USD price required before confirming a deposit.`);
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
    if (!depositAck) {
      setError("Confirm you sent (or will send) the quoted amount to the deposit address.");
      return;
    }
    const hash = depositTxHash.trim();
    if (!hash || hash.length < 10) {
      setError("Paste your payment transaction hash / txid after sending — required for verification.");
      return;
    }

    setConfirmBusy(true);
    const pending = {
      ...buildRecord({
        txHash: hash,
        status: "locked_pending_chain" as const,
        payMethod: "deposit" as const,
      }),
      from: address,
      olcAmount: derived.olc,
      deliveryNote: "Verifying payment on-chain…",
    };
    setPurchases(savePurchase(pending));
    setPendingLockRetryTx(hash);

    try {
      const res = await fetch("/api/presale/confirm-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: payChainForAsset(selected.id),
          paymentTxHash: hash,
          buyer: address,
          payAsset: selected.symbol,
          olcAmount: derived.olc,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        creditTxHash?: string;
        message?: string;
        error?: string;
        notConfigured?: boolean;
        olcAmount?: number;
        verified?: boolean;
        payAmount?: number;
      };

      if (data.status === "locked" && data.creditTxHash) {
        const olc =
          typeof data.olcAmount === "number" ? data.olcAmount : derived.olc;
        const next = updatePurchase(hash, {
          status: "locked",
          creditTxHash: data.creditTxHash,
          olcAmount: olc,
          from: address,
          deliveryNote: undefined,
        });
        setPurchases(next);
        setPendingLockRetryTx(null);
        setSuccessNote(
          `Payment verified. ${formatNum(olc, 4)} OLC credited to PresaleLock for ${address.slice(0, 8)}… Credit tx ${data.creditTxHash.slice(0, 10)}…`,
        );
        return;
      }

      if (data.verified && data.status === "locked_pending_chain") {
        const olc =
          typeof data.olcAmount === "number" ? data.olcAmount : derived.olc;
        const next = updatePurchase(hash, {
          status: "locked_pending_chain",
          olcAmount: olc,
          from: address,
          deliveryNote:
            data.message ||
            data.error ||
            "Payment verified — awaiting PresaleLock credit config.",
        });
        setPurchases(next);
        setPendingLockRetryTx(hash);
        setSuccessNote(
          `Payment verified on-chain. ${formatNum(olc, 4)} OLC pending PresaleLock credit. ${data.error || data.message || ""}`,
        );
        return;
      }

      setError(data.error || data.message || "Payment could not be verified.");
      const next = updatePurchase(hash, {
        status: "pending_external",
        from: address,
        deliveryNote: data.error || "Unverified",
      });
      setPurchases(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm request failed");
    } finally {
      setConfirmBusy(false);
      setPurchases(loadPurchases());
    }
  }

  /** Local reminder only — does NOT credit OLC (no tx hash verification). */
  function onSaveDepositReminder() {
    setError(null);
    setSuccessNote(null);
    if (!isConnected || !address) {
      setError("Connect your BlockDAG wallet first.");
      return;
    }
    if (!depositAck) {
      setError("Confirm the deposit amount/network checkbox first.");
      return;
    }
    const stub = `external:reminder:${selected.symbol}:${Date.now()}`;
    const next = savePurchase({
      ...buildRecord({
        txHash: stub,
        status: "pending_external",
        payMethod: "deposit",
      }),
      from: address,
      deliveryNote:
        "Reminder only — paste tx hash and tap Confirm payment to verify and credit OLC.",
    });
    setPurchases(next);
    setSuccessNote(
      `Reminder saved. Send ${formatNum(derived.payAmount, 8)} ${selected.symbol}, then paste the tx hash and tap Confirm payment. No OLC is credited from a reminder alone.`,
    );
  }

  const onChainBuyDisabled =
    busy ||
    waitingTx ||
    !onCorrectChain ||
    !(derived.olc > 0) ||
    !buyRateReady;

  return (
    <section className="card border-gold/40 shadow-gold">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Buy OLC</h2>
          <p className="mt-1 text-sm text-slate-400">
            Live batch {batch.batch}:{" "}
            <span className="font-semibold text-gold-bright">${batchPrice.toFixed(3)}</span> / OLC.
            We only accept listed cryptos. OLC received = (pay amount × live USD) ÷ batch price —
            never more than paid-for.
          </p>
        </div>
        <ConnectWallet />
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-1.5">
        <p>
          <strong>Safety:</strong> On-chain Buy is BlockDAG Mainnet only (chainId {TOKEN.chainId}).
          External deposits (ETH / USDT / USDC / SOL / BTC) use published deposit addresses —
          wrong network = lost funds. Paste the payment tx hash and Confirm — no credit without
          on-chain verification.
        </p>
        <p>
          Verify treasury{" "}
          <a
            className="link-accent font-mono"
            href={explorerAddressUrl(SITE.treasuryAddress)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {SITE.treasuryAddress}
          </a>{" "}
          for BlockDAG transfers.
        </p>
        <p>
          Successful buys credit OLC into a <strong>PresaleLock</strong> — yours immediately, but
          non-transferable until exchange listing unlock. Not a free-trading wallet transfer.
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
                m === "onchain" ? "on-chain" : m === "deposit" ? "deposit" : "quote";
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
              Enter OLC amount
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {mode === "olc" ? (
          <label className="block text-sm">
            <span className="text-slate-400">OLC amount</span>
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
          <div className="rounded-xl border border-cyan-accent/30 bg-cyan-accent/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-cyan-100">
                External deposit — {selected.symbol}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Network:{" "}
                <span className="font-semibold text-white">
                  {selected.depositNetwork}
                </span>
                {selected.id === "USDT" && (
                  <span className="text-amber-200">
                    {" "}
                    — send only USDT ERC-20 (not TRC-20 / BEP-20 / other chains)
                  </span>
                )}
                {selected.id === "USDC" && (
                  <span className="text-amber-200">
                    {" "}
                    — send only USDC on Ethereum
                  </span>
                )}
                {selected.id === "ETH" && (
                  <span className="text-amber-200">
                    {" "}
                    — send native ETH on Ethereum mainnet
                  </span>
                )}
                {selected.id === "SOL" && (
                  <span className="text-amber-200">
                    {" "}
                    — send native SOL on Solana only
                  </span>
                )}
                {selected.id === "BTC" && (
                  <span className="text-amber-200">
                    {" "}
                    — send BTC to native SegWit (bc1…) on Bitcoin only
                  </span>
                )}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border border-border bg-bg-panel/80 px-3 py-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px]">
                  Amount to send
                </p>
                <p className="mt-0.5 font-mono text-sm text-white">
                  {formatNum(derived.payAmount, 8)} {selected.symbol}
                </p>
                <p className="text-slate-400">≈ ${formatNum(derived.usd, 4)}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg-panel/80 px-3 py-2">
                <p className="text-slate-500 uppercase tracking-wide text-[10px]">
                  OLC you receive
                </p>
                <p className="mt-0.5 font-mono text-sm text-gold-bright">
                  {formatNum(derived.olc, 4)} OLC
                </p>
                <p className="text-slate-400">(locked until listing unlock)</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Deposit address
              </p>
              <CopyAddress address={selected.depositAddress} className="w-full" />
              <p className="text-[11px] text-amber-200/90">
                <strong>Warning:</strong> Send only {selected.symbol} on{" "}
                {selected.depositNetwork}. Wrong asset or network can permanently lose funds.
                {selected.depositNote ? ` ${selected.depositNote}.` : ""}
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={depositAck}
                onChange={(e) => setDepositAck(e.target.checked)}
              />
              <span>
                I sent (or will send) exactly {formatNum(derived.payAmount, 8)}{" "}
                {selected.symbol} on {selected.depositNetwork} to the deposit address above.
              </span>
            </label>

            <label className="block text-xs text-slate-300">
              <span className="text-slate-400">
                Payment tx hash / txid (required to credit OLC)
              </span>
              <input
                type="text"
                value={depositTxHash}
                onChange={(e) => setDepositTxHash(e.target.value)}
                placeholder={
                  selected.id === "BTC"
                    ? "Bitcoin txid (64 hex)"
                    : selected.id === "SOL"
                      ? "Solana signature"
                      : "0x… transaction hash"
                }
                className="mt-1 w-full rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-sm text-white"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            {!isConnected && (
              <p className="text-xs text-amber-200">
                Connect your BlockDAG wallet — verified OLC is locked to that address.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={
                  confirmBusy ||
                  !buyRateReady ||
                  !(derived.olc > 0) ||
                  !depositAck ||
                  !isConnected ||
                  !depositTxHash.trim()
                }
                onClick={() => void onConfirmExternalDeposit()}
              >
                {confirmBusy
                  ? "Verifying…"
                  : !buyRateReady
                    ? "Waiting for live price…"
                    : "Confirm payment"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border px-3 py-2 text-xs text-slate-300 hover:bg-bg-panel"
                disabled={!depositAck || !isConnected}
                onClick={onSaveDepositReminder}
              >
                Save reminder (no credit)
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              OLC is credited only after the server verifies your tx on{" "}
              {selected.depositNetwork}. A reminder alone never mints or locks OLC.
            </p>
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
                    !p.txHash.startsWith("external:") && (
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
                  ) : p.txHash.startsWith("external:") ? (
                    <span className="font-mono text-slate-500 text-[10px]">reminder</span>
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
