import type { Metadata } from "next";
import { CopyAddress } from "@/components/CopyAddress";
import { fetchTokenInfo } from "@/lib/rpc";
import { ALLOCATIONS, TOKENOMICS_DISCLAIMER } from "@/lib/tokenomics";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

export const metadata: Metadata = {
  title: "Tokenomics",
  description: "OVERLANDCOIN on-chain supply and draft allocation overview.",
};

export default async function TokenomicsPage() {
  const info = await fetchTokenInfo();

  return (
    <div className="container-page py-14">
      <span className="badge">On-chain supply verified</span>
      <h1 className="section-title mt-4">Tokenomics</h1>
      <p className="section-sub">
        Total supply is fixed on BlockDAG at {TOKEN.totalSupplyFormatted} OLC. Allocation bars below are draft/example only.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Name", value: info.name },
          { label: "Symbol", value: info.symbol },
          { label: "Decimals", value: String(info.decimals) },
          { label: "Total Supply", value: `${info.totalSupply} OLC` },
        ].map((x) => (
          <div key={x.label} className="card !p-4">
            <p className="text-xs uppercase text-slate-500">{x.label}</p>
            <p className="mt-1 text-xl font-bold text-white">{x.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CopyAddress />
        <a href={explorerAddressUrl()} className="link-accent text-sm" target="_blank" rel="noopener noreferrer">
          View on Explorer
        </a>
        <span className="text-xs text-slate-600">Data source: {info.source}</span>
      </div>

      <div className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-bold text-white">Allocation (draft)</h2>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold-bright">
            Example / not finalized
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-400">{TOKENOMICS_DISCLAIMER}</p>

        <div className="mt-6 space-y-4">
          {ALLOCATIONS.map((a) => (
            <div key={a.label} className="card !py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white">{a.label}</h3>
                  <p className="text-sm text-slate-400">{a.description}</p>
                </div>
                <span className="text-lg font-bold text-gold-bright">{a.percent}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-deep">
                <div className="h-full rounded-full" style={{ width: `${a.percent}%`, background: a.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
