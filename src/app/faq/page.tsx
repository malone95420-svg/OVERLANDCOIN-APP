import type { Metadata } from "next";
import Link from "next/link";
import { PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about OVERLANDCOIN.",
};

const livePrice = PRESALE_BATCHES.find((b) => b.status === "LIVE")?.priceUsdt ?? 0.001;

const FAQS = [
  {
    q: "What is OVERLANDCOIN?",
    a: "OVERLANDCOIN (OLC) is an adventure/overlanding token on BlockDAG focused on maps, location rewards, and proof-of-adventure — Move. Explore. Earn. Fuel for the Journey.",
  },
  {
    q: "Which chain is OLC on?",
    a: `OLC is deployed only on ${TOKEN.chainName} (chainId ${TOKEN.chainId}). The same address on Base or Ethereum is an empty EOA — do not use those networks for OLC.`,
  },
  {
    q: "What is the contract address?",
    a: TOKEN.contractAddress,
  },
  {
    q: "What is the total supply?",
    a: `On-chain total supply is ${TOKEN.totalSupplyFormatted} OLC with ${TOKEN.decimals} decimals. (Older UI incorrectly showed 5B — trust the chain.)`,
  },
  {
    q: "What is the current presale price?",
    a: `Batch 1 is LIVE at $${livePrice.toFixed(3)} USDT per OLC. Later batches: $0.002, $0.004, $0.007, then $0.010 at Batch 5 / TGE.`,
  },
  {
    q: "Where is the treasury / receiving wallet?",
    a: SITE.treasuryAddress,
  },
  {
    q: "Where can I trade OLC?",
    a: "No official DEX pairs are listed yet. Do not trust unofficial swap links. Official market links will be published when available.",
  },
  {
    q: "Is staking live?",
    a: "No. The staking page shows example plans (30d 15%, 90d 35%, 180d 65%, 365d 120% APY) as a UI mock only.",
  },
  {
    q: "Are allocation percentages final?",
    a: "They mirror the live public site but are labeled draft pending founder confirmation against the 9B on-chain supply.",
  },
  {
    q: "How do I get support?",
    a: `Email ${SITE.supportEmail}`,
  },
];

export default function FaqPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Help</span>
      <h1 className="section-title mt-4">FAQ</h1>
      <p className="section-sub">Straight answers. No invented prices, socials, or DEX links.</p>

      <div className="mt-10 space-y-4">
        {FAQS.map((item) => (
          <details key={item.q} className="card group open:shadow-gold">
            <summary className="cursor-pointer list-none font-semibold text-white marker:content-none">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span className="text-gold-bright transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 break-all">{item.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <a href={`mailto:${SITE.supportEmail}`} className="link-accent">
          {SITE.supportEmail}
        </a>
        <a href={explorerAddressUrl()} className="link-accent" target="_blank" rel="noopener noreferrer">
          View on Explorer
        </a>
        <Link href="/presale" className="link-accent">
          Presale & wallet setup
        </Link>
        <Link href="/docs" className="link-accent">
          Docs hub
        </Link>
      </div>
    </div>
  );
}
