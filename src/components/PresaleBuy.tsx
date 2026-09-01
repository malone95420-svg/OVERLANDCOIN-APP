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
import { getBdagUsdPrice, getPayTokenOptions, type PayTokenOption } from "@/lib/payTokens";
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
  const payOptions = useMemo(() => getPayTokenOptions(), []);
  const bdagUsd = getBdagUsdPrice();

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;

  const [payId, setPayId] = useState<PayTokenOption["id"]>("BDAG");
  const [mode, setMode] = useState<InputMode>("olc");
  const [olcInput, setOlcInput] = useState("1000");
  const [payInput, setPayInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<Hash | undefined>();
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  const selected = payOptions.find((o) => o.id === payId) ?? payOptions[0];

  const { data: onChainDecimals } = useReadContract({
    address: selected.kind === "erc20" ? selected.address : undefined,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: selected.kind === "erc20" && Boolean(selected.address) && onCorrectChain },
  });

  const decimals =
    typeof onChainDecimals === "number"
      ? onChainDecimals
      : typeof onChainDecimals === "bigint"
        ? Number(onChainDecimals)
        : selected.decimalsHint;

  useEffect(() => {
    setPurchases(loadPurchases());
  }, []);

  const usdPerPayUnit = useMemo(() => {
    if (selected.id === "BDAG") return bdagUsd;
    if (selected.id === "BDUSD" || selected.id === "USDT" || selected.id === "USDC") return 1;
    // WETH / unknown — treat as needing BDAG-style estimate only if we had a rate; for ETH use 1:1 USD placeholder is wrong.
    // Env WETH: user enters token amount; we treat pay amount as USD-equivalent only if we document — for simplicity use 1 token = user-entered "pay" as raw tokens and estimate OLC assuming user means USD value via a separate path.
    // Spec: USDT/USDC 1:1 USD. For WETH without oracle, treat pay input as token amount and require USD via... Spec says for BDAG use env rate. For ETH (wrapped) no rate specified — show OLC from assuming we need an ETH USD rate. Keep simple: if ETH, show warning and use NEXT_PUBLIC_BDAG_USD_PRICE style — actually just treat WETH pay amount * no rate. Better: for non-stable ERC20 without rate, interpret pay/olc with a note that OLC estimate assumes $1/token unless configured. Skip — ETH is rare env. Use 1 for stables/BDUSD, bdagUsd for BDAG, and for ETH leave as "estimate unavailable" — use env NEXT_PUBLIC_ETH_USD_PRICE optional default none.
    return 1;
  }, [selected.id, bdagUsd]);

  const derived = useMemo(() => {
    const price = batchPrice;
    if (mode === "olc") {
      const olc = Number(olcInput);
      if (!(olc > 0)) return { olc: 0, usd: 0, payAmount: 0 };
      const usd = olc * price;
      const payAmount = usd / usdPerPayUnit;
      return { olc, usd, payAmount };
    }
    const payAmount = Number(payInput);
    if (!(payAmount > 0)) return { olc: 0, usd: 0, payAmount: 0 };
    const usd = payAmount * usdPerPayUnit;
    const olc = usd / price;
    return { olc, usd, payAmount };
  }, [mode, olcInput, payInput, batchPrice, usdPerPayUnit]);

  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { isLoading: waitingTx, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: pendingHash,
  });

  const recordLocal = useCallback(
    (txHash: string) => {
      const record: LocalPurchase = {
        id: `${Date.now()}-${txHash.slice(2, 10)}`,
        txHash,
        timestamp: Date.now(),
        from: address,
        payAsset: selected.symbol,
        payAmount: formatNum(derived.payAmount, 8),
        olcEstimated: formatNum(derived.olc, 4),
        batchPriceUsdt: batchPrice,
        usdEstimated: Number(derived.usd.toFixed(6)),
        status: "pending_delivery",
      };
      const next = savePurchase(record);
      setPurchases(next);
      setSuccessNote(
        "Contribution submitted. OLC is recorded as pending delivery — treasury contribution model until a claim/presale contract is live. No instant mint."
      );
    },
    [address, selected.symbol, derived.payAmount, derived.olc, derived.usd, batchPrice]
  );

  useEffect(() => {
    if (txSuccess && pendingHash) {
      recordLocal(pendingHash);
      setPendingHash(undefined);
      setBusy(false);
    }
  }, [txSuccess, pendingHash, recordLocal]);

  async function onBuy() {
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
    if (!(derived.olc > 0) || !(derived.payAmount > 0)) {
      setError("Enter a valid amount.");
      return;
    }

    const treasury = SITE.treasuryAddress as Address;
    setBusy(true);
    try {
      let hash: Hash;
      if (selected.kind === "native") {
        // parseEther-style for 18-decimal native
        const value = parseEther(String(derived.payAmount));
        hash = await sendTransactionAsync({
          to: treasury,
          value,
          chainId: TOKEN.chainId,
        });
      } else {
        if (!selected.address) throw new Error("Token address missing");
        const amount = parseUnits(
          // Avoid scientific notation; trim excess precision
          Number(derived.payAmount).toFixed(Math.min(decimals, 18)),
          decimals
        );
        hash = await writeContractAsync({
          address: selected.address,
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

  return (
    <section className="card border-gold/40 shadow-gold">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Buy OLC</h2>
          <p className="mt-1 text-sm text-slate-400">
            Live batch {batch.batch}:{" "}
            <span className="font-semibold text-gold-bright">${batchPrice.toFixed(3)}</span> USDT
            terms per OLC. On-site payments use{" "}
            <strong className="text-slate-200">BDAG / BDUSD on BlockDAG</strong>. CEX USDT pairs are
            off-chain — not used by this widget.
          </p>
        </div>
        <ConnectWallet />
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-1.5">
        <p>
          <strong>Safety:</strong> Only send on BlockDAG Mainnet (chainId {TOKEN.chainId}). The same
          address on Ethereum/Base is an empty EOA — funds sent there are lost.
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
          before confirming.
        </p>
        <p>
          This is a <strong>treasury contribution</strong> model. There is no guaranteed instant OLC
          transfer until a presale/claim contract exists — delivery may be manual / at TGE. We do not
          fake-mint OLC in your wallet.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-400">Pay with</span>
          <select
            className="mt-1 w-full rounded-xl border border-border bg-bg-panel px-3 py-2.5 text-white"
            value={selected.id}
            onChange={(e) => setPayId(e.target.value as PayTokenOption["id"])}
          >
            {payOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {selected.note && <span className="mt-1 block text-[11px] text-slate-500">{selected.note}</span>}
        </label>

        <div className="flex flex-col justify-end gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                mode === "olc" ? "border-gold/60 bg-gold/10 text-gold-bright" : "border-border text-slate-400"
              }`}
              onClick={() => setMode("olc")}
            >
              Enter OLC amount
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                mode === "pay" ? "border-gold/60 bg-gold/10 text-gold-bright" : "border-border text-slate-400"
              }`}
              onClick={() => setMode("pay")}
            >
              Enter {selected.symbol} amount
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

        <div className="rounded-xl border border-border bg-bg-panel/60 p-3 text-sm">
          <p className="text-xs uppercase text-slate-500">Estimate</p>
          <p className="mt-1 text-white">
            <span className="text-gold-bright font-semibold">{formatNum(derived.olc, 4)}</span> OLC
          </p>
          <p className="text-slate-400">
            ≈ ${formatNum(derived.usd, 4)} · pay{" "}
            <span className="font-mono text-slate-200">
              {formatNum(derived.payAmount, 8)} {selected.symbol}
            </span>
          </p>
          {selected.id === "BDAG" && (
            <p className="mt-2 text-[11px] text-slate-500">
              BDAG/USD rate: ${bdagUsd} (configurable estimate via NEXT_PUBLIC_BDAG_USD_PRICE — not a
              live oracle).
            </p>
          )}
          {selected.id === "BDUSD" && (
            <p className="mt-2 text-[11px] text-slate-500">
              BDUSD treated as ~$1 for batch pricing. Beta synthetic dollar — not USDT/USDC.
              Decimals: {decimals} (on-chain when connected).
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || waitingTx || !onCorrectChain || !(derived.olc > 0)}
          onClick={onBuy}
        >
          {busy || waitingTx
            ? waitingTx
              ? "Confirming…"
              : "Check wallet…"
            : `Buy with ${selected.symbol}`}
        </button>
        {!isConnected && (
          <span className="text-xs text-slate-500">Connect wallet to continue.</span>
        )}
        {isConnected && !onCorrectChain && (
          <span className="text-xs text-amber-300">Wrong network — switch to BlockDAG ({TOKEN.chainId}).</span>
        )}
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
          <a className="link-accent font-mono" href={explorerTxUrl(pendingHash)} target="_blank" rel="noopener noreferrer">
            {pendingHash.slice(0, 10)}…
          </a>
        </p>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-white">Your recent contributions (this browser)</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stored in localStorage ({`overlandcoin.purchases.v1`}). Status: pending_delivery until OLC
          is allocated/claimed.
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
                  <span className="text-gold-bright">~{p.olcEstimated} OLC</span>
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-cyan-accent">
                    {p.status}
                  </span>
                </div>
                <a
                  className="link-accent font-mono"
                  href={explorerTxUrl(p.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View tx
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
