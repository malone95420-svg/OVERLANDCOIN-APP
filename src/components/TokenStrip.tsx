import { fetchTokenInfo } from "@/lib/rpc";
import { TOKEN, explorerAddressUrl } from "@/lib/token";
import { CopyAddress } from "./CopyAddress";

export async function TokenStrip() {
  const info = await fetchTokenInfo();

  const items = [
    { label: "Name", value: info.name },
    { label: "Symbol", value: info.symbol },
    { label: "Decimals", value: String(info.decimals) },
    { label: "Total Supply", value: `${info.totalSupply} OLC` },
    { label: "Chain", value: `${TOKEN.chainName} (${TOKEN.chainId})` },
  ];

  return (
    <section className="border-y border-border bg-bg-card/60">
      <div className="container-page py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold">Live token</p>
            <p className="text-sm text-slate-400">
              On-chain data {info.source === "rpc" ? "via BlockDAG RPC" : "(static fallback — RPC unavailable)"}
            </p>
          </div>
          <a href={explorerAddressUrl()} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 !text-xs">
            View on Explorer
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-bg-panel/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="mt-1 truncate font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">Contract</span>
          <CopyAddress />
        </div>
      </div>
    </section>
  );
}
