import type { Metadata } from "next";
import { CopyAddress } from "@/components/CopyAddress";
import { fetchTokenInfo } from "@/lib/rpc";
import { ALLOCATIONS, TOTAL_SUPPLY_FORMATTED } from "@/lib/tokenomics";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

export const metadata: Metadata = {
  title: "Tokenomics",
  description: "OVERLANDCOIN 9B on-chain supply and token allocation on BlockDAG.",
};

export default async function TokenomicsPage() {
  const info = await fetchTokenInfo();

  return (
    <div className="container-page py-14">
      <span className="badge">On-chain supply verified</span>
      <h1 className="section-title mt-4">Tokenomics</h1>
      <p className="section-sub">
        Total supply is fixed on BlockDAG at {TOTAL_SUPPLY_FORMATTED} OLC. Allocation below is the
        full 9B breakdown.
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
        <h2 className="text-2xl font-bold text-white">Token Allocation — {TOTAL_SUPPLY_FORMATTED} OLC</h2>
        <p className="mt-2 text-sm text-slate-400">
          Percentages applied to the on-chain 9B supply. Presale is 900M OLC (10%) with a $500K USD hard
          cap.
        </p>

        <div className="mt-6 space-y-4">
          {ALLOCATIONS.map((a) => (
            <div key={a.label} className="card !py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white">{a.label}</h3>
                  <p className="text-sm text-slate-400">{a.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gold-bright">{a.percent}%</p>
                  <p className="text-sm text-slate-400">{a.amountFormatted} OLC</p>
                </div>
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
