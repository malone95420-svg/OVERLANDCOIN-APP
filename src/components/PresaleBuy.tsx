"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { erc20Abi, parseEther, parseUnits, type Address, type Hash } from "viem";
import { ConnectWallet } from "@/components/ConnectWallet";
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
import { loadPurchases, savePurchase, type LocalPurchase } from "@/lib/purchases";
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

export function PresaleBuy() {
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
  const [depositAck, setDepositAck] = useState(false);

  const selected = assets.find((a) => a.id === assetId) ?? assets[0];
  const payMode = paymentMode(selected);
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
  }, []);

  useEffect(() => {
    setDepositAck(false);
    setError(null);
    setSuccessNote(null);
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
  const { isLoading: waitingTx, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: pendingHash,
  });

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

  const recordLocal = useCallback(
    (txHash: string) => {
      const next = savePurchase(
        buildRecord({ txHash, status: "pending_delivery", payMethod: "onchain" })
      );
      setPurchases(next);
      setSuccessNote(
        "Contribution submitted. OLC is recorded as pending delivery — treasury contribution model until a claim/presale contract is live. No instant mint."
      );
    },
    [buildRecord]
  );

  useEffect(() => {
    if (txSuccess && pendingHash) {
      recordLocal(pendingHash);
      setPendingHash(undefined);
      setBusy(false);
    }
  }, [txSuccess, pendingHash, recordLocal]);

  async function onBuyOnChain() {
    setError(null);
    setSuccessNote(null);
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
    try {
      let hash: Hash;
      if (selected.onChain.kind === "native") {
        const value = parseEther(String(derived.payAmount));
        hash = await sendTransactionAsync({
          to: treasury,
          value,
          chainId: TOKEN.chainId,
        });
      } else {
        const amount = parseUnits(
          Number(derived.payAmount).toFixed(Math.min(decimals, 18)),
          decimals
        );
        hash = await writeContractAsync({
          address: selected.onChain.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [treasury, amount],
          chainId: TOKEN.chainId,
        });
      }
      setPendingHash(hash);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  function onRecordExternalDeposit() {
    setError(null);
    setSuccessNote(null);
    if (!buyRateReady) {
      setError(`Live ${selected.symbol}/USD price required before recording a deposit.`);
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
      setError("Confirm you will send exactly the quoted amount to the deposit address.");
      return;
    }
    const stub = `external:pending:${selected.symbol}:${Date.now()}`;
    const next = savePurchase(
      buildRecord({ txHash: stub, status: "pending_external", payMethod: "deposit" })
    );
    setPurchases(next);
    setSuccessNote(
      `Pending external ${selected.symbol} deposit recorded locally. Send ${formatNum(derived.payAmount, 8)} ${selected.symbol} on ${selected.depositNetwork ?? "the published network"} to the deposit address. OLC (~${formatNum(derived.olc, 4)}) is pending delivery after confirmation — not an instant mint.`
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
          External deposits (BTC/ETH/USDT) use published deposit addresses — wrong network = lost
          funds.
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
          Treasury contribution model — no instant OLC mint until a claim/presale contract is live.
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
              {formatNum(derived.olc, 4)} OLC
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

      {/* Payment actions by mode */}
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

        {payMode === "deposit" && (
          <div className="rounded-xl border border-cyan-accent/30 bg-cyan-accent/5 p-4 space-y-3">
            <p className="text-sm text-cyan-100">
              Pay with <strong>{selected.symbol}</strong> via external deposit (
              {selected.depositNetwork}).
            </p>
            <p className="font-mono text-xs break-all text-white bg-bg-panel/80 rounded-lg px-3 py-2 border border-border">
              {selected.depositAddress}
            </p>
            <p className="text-[11px] text-slate-400">
              Send exactly{" "}
              <span className="font-mono text-slate-200">
                {formatNum(derived.payAmount, 8)} {selected.symbol}
              </span>{" "}
              (≈ ${formatNum(derived.usd, 4)}) for{" "}
              <span className="text-gold-bright">{formatNum(derived.olc, 4)} OLC</span> at the live
              rate. Wrong network or amount may delay or lose funds.
            </p>
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={depositAck}
                onChange={(e) => setDepositAck(e.target.checked)}
              />
              <span>
                I will send {formatNum(derived.payAmount, 8)} {selected.symbol} on{" "}
                {selected.depositNetwork} to the address above at the quoted live rate.
              </span>
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={!buyRateReady || !(derived.olc > 0) || !depositAck}
              onClick={onRecordExternalDeposit}
            >
              {!buyRateReady
                ? "Waiting for live price…"
                : `Pay with ${selected.symbol} — record pending`}
            </button>
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
        <p className="mt-3 rounded-lg border border-cyan-accent/30 bg-cyan-accent/5 p-3 text-sm text-cyan-100">
          {successNote}
        </p>
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
        <h3 className="text-sm font-semibold text-white">Your recent contributions (this browser)</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stored in localStorage ({`overlandcoin.purchases.v1`}). Includes on-chain and external
          pending records.
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
                </div>
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
                  <span className="font-mono text-slate-500 text-[10px]">external</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
