import type { Metadata } from "next";
import { CopyAddress } from "@/components/CopyAddress";
import { LiveMarketPrices } from "@/components/LiveMarketPrices";
import { PresaleBuy } from "@/components/PresaleBuy";
import { PRESALE_BATCHES, PRESALE_META, SITE } from "@/lib/site";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

export const metadata: Metadata = {
  title: "Presale",
  description: "OVERLANDCOIN presale batches, treasury wallet, and BlockDAG wallet setup.",
};

const networkRows = [
  { label: "Network name", value: TOKEN.chainName },
  { label: "Chain ID", value: String(TOKEN.chainId) },
  { label: "Currency symbol", value: TOKEN.nativeCurrency.symbol },
  { label: "RPC URL", value: TOKEN.rpcUrl },
  { label: "RPC alt", value: TOKEN.rpcAlt },
  { label: "RPC fallback", value: TOKEN.rpcFallback },
  { label: "Block explorer", value: TOKEN.explorers.primary },
];

export default function PresalePage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Presale</span>
      <h1 className="section-title mt-4">Get OVERLANDCOIN</h1>
      <p className="section-sub">
        Connect a wallet on BlockDAG Mainnet and contribute BDAG or BDUSD. Batch pricing uses USDT
        terms; CEX USDT is off-chain. No fake checkout — verify addresses before sending.
      </p>

      <div className="mt-8 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-gold-bright">
        OLC exists only on BlockDAG (chainId {TOKEN.chainId}). The same contract address on
        Base/Ethereum is an empty EOA — do not send funds there.
      </div>

      <div className="mt-10">
        <LiveMarketPrices />
      </div>

      <div className="mt-6">
        <PresaleBuy />
      </div>

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-white">Presale batches</h2>
        <p className="mt-2 text-sm text-slate-400">
          Prices in USDT terms. Batch 1 is LIVE. On-site buys settle in BDAG/BDUSD on BlockDAG.
          Presale allocation: {PRESALE_META.allocationOlC.toLocaleString()} OLC (10% of 9B) · hard
          cap ${PRESALE_META.hardCapUsd.toLocaleString()} USD.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PRESALE_BATCHES.map((b) => (
            <div
              key={b.batch}
              className={`card !p-4 ${b.status === "LIVE" ? "border-gold/60 shadow-gold" : ""}`}
            >
              <p className="text-xs uppercase text-slate-500">
                {"label" in b && b.label ? b.label : `Batch ${b.batch}`}
              </p>
              <p className="mt-2 text-2xl font-bold text-gold-bright">
                ${b.priceUsdt.toFixed(3)}
              </p>
              <p className="text-xs text-slate-500">USDT terms per OLC</p>
              <span className="badge mt-3">{b.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 card">
        <h2 className="text-xl font-bold text-white">Treasury / receiving wallet</h2>
        <p className="mt-2 text-sm text-slate-400">
          Published receiving address for presale contributions. Always double-check against
          official channels.
        </p>
        <div className="mt-4">
          <CopyAddress address={SITE.treasuryAddress} />
        </div>
        <a
          href={explorerAddressUrl(SITE.treasuryAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary mt-4 !text-xs"
        >
          View treasury on Explorer
        </a>
      </section>

      <section className="mt-6 card">
        <h2 className="text-xl font-bold text-white">1. Add BlockDAG Mainnet</h2>
        <p className="mt-2 text-sm text-slate-400">
          Use <strong className="text-slate-200">Connect Wallet → Switch / Add BlockDAG</strong>, or
          add manually in MetaMask: Settings → Networks → Add network.
        </p>
        <dl className="mt-6 space-y-3">
          {networkRows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 rounded-lg border border-border bg-bg-panel/60 p-3 sm:grid-cols-3"
            >
              <dt className="text-xs uppercase text-slate-500">{row.label}</dt>
              <dd className="sm:col-span-2 break-all font-mono text-sm text-slate-200">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 card">
        <h2 className="text-xl font-bold text-white">2. Add OLC token</h2>
        <p className="mt-2 text-sm text-slate-400">
          Import token: {TOKEN.name} / {TOKEN.symbol} / {TOKEN.decimals} decimals.
        </p>
        <div className="mt-4">
          <CopyAddress />
        </div>
        <a
          href={explorerAddressUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary mt-4 !text-xs"
        >
          View OLC contract on Explorer
        </a>
      </section>

      <section className="mt-6 card">
        <h2 className="text-xl font-bold text-white">3. Markets</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          <li>• On-site purchases use native BDAG and official BDUSD on BlockDAG — not CEX USDT.</li>
          <li>• No DEX pairs are listed yet — do not trust unofficial swap links.</li>
          <li>• When liquidity launches, links will be published in site config and official channels.</li>
          <li>• Always verify contract and treasury addresses character-for-character.</li>
        </ul>
      </section>
    </div>
  );
}
