import type { Metadata } from "next";
import Link from "next/link";
import { PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about OVERLANDCOIN.",
};

const livePrice = PRESALE_BATCHES.find((b) => b.status === "LIVE")?.priceUsdt ?? 0.001;

type FaqItem = { q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const SECTIONS: FaqSection[] = [
  {
    title: "General",
    items: [
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
        a: `On-chain total supply is ${TOKEN.totalSupplyFormatted} OLC with ${TOKEN.decimals} decimals.`,
      },
      {
        q: "Are allocation percentages final?",
        a: "Yes. Allocations are set against the full 9B supply: Presale 10% (900M), Ecosystem 35%, Team 15%, Treasury 20%, Liquidity 10%, Marketing 5%, Locked Reserve 5%.",
      },
      {
        q: "Is staking available?",
        a: "Not available. Staking has been removed from the app for now — there is no live staking contract and no mock plans page.",
      },
      {
        q: "How do I get support?",
        a: `Email ${SITE.supportEmail}`,
      },
    ],
  },
  {
    title: "Quests",
    items: [
      {
        q: "How do quest rewards work?",
        a: "Visit a quest on the Quest Map, check in with GPS + photo proof, then claim OLC to your connected wallet via the Claim page. Rewards pay from the Overland rewards wallet and are never marked claimed without a real tx hash.",
      },
      {
        q: "Can I complete the same quest twice?",
        a: "No. Completions are once per device (and once per account ledger). Switching accounts on the same device will not re-earn the same quest.",
      },
      {
        q: "Where do I claim pending quest OLC?",
        a: "Use Claim (/claim) or Garage / Profile adventure ledger. Pending OLC stays local until the claim API succeeds.",
      },
      {
        q: "What is Community / Adventure Feed?",
        a: "Community (/feed) is the shared GPS + photo verified wall of check-ins. Guest empty states prompt sign-in; posts also sync via /api/feed when available.",
      },
    ],
  },
  {
    title: "Presale",
    items: [
      {
        q: "What is the current presale price?",
        a: `Batch 1 is LIVE at $${livePrice.toFixed(3)} USDT per OLC. Later batches: $0.002, $0.004, $0.007, then $0.010 at Batch 5 / TGE.`,
      },
      {
        q: "How do I buy?",
        a: "Crypto only via the unified Buy on Presale — BDAG/BDUSD on BlockDAG or external USDT/ETH/BTC/SOL deposits. No KYC. Card pay is not live (coming soon stub only).",
      },
      {
        q: "Where is the treasury / receiving wallet?",
        a: SITE.treasuryAddress,
      },
      {
        q: "When can I sell or transfer presale OLC?",
        a: "After payment verifies on-chain, bought OLC is delivered as ERC-20 to your BlockDAG wallet. Quest rewards are separate and also claim straight to your wallet. Official markets will be published when available — do not trust unofficial swap links.",
      },
      {
        q: "Where can I trade OLC?",
        a: "No official DEX pairs are listed yet. Do not trust unofficial swap links. Official market links will be published when available. Presale OLC is already in your wallet after verified delivery.",
      },
      {
        q: "Where do I see my allocation?",
        a: "Token Distribution (/token-distribution) shows batch/price context and your local purchase ledger (wallet deliveries). Your OLC balance also appears in the site header when connected on BlockDAG.",
      },
    ],
  },
  {
    title: "Wallet / Security",
    items: [
      {
        q: "Which wallet networks should I use?",
        a: `OLC and on-site BDAG/BDUSD buys require BlockDAG Mainnet (chainId ${TOKEN.chainId}). External deposits use the networks shown in checkout (Ethereum, Bitcoin, Solana). Wrong network = lost funds.`,
      },
      {
        q: "Do you require KYC?",
        a: "No. OVERLANDCOIN does not run KYC in this app.",
      },
      {
        q: "How are payments verified?",
        a: "Presale OLC credits only after on-chain payment verification (deliver / confirm-deposit / pay-orders). Local purchase rows are reminders — never sole proof of credit.",
      },
      {
        q: "How do I add the OLC token?",
        a: "Use Add OLC in the header or Presale page while connected on BlockDAG, or import the contract address manually.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Help</span>
      <h1 className="section-title mt-4">FAQ</h1>
      <p className="section-sub">
        Straight answers by category. No invented prices, socials, or DEX links. Staking is not
        available.
      </p>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-bold text-gold-bright">{section.title}</h2>
            <div className="mt-4 space-y-3">
              {section.items.map((item) => (
                <details key={item.q} className="card group open:shadow-gold !p-4 sm:!p-5">
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
          </section>
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
          Presale
        </Link>
        <Link href="/claim" className="link-accent">
          Claim
        </Link>
        <Link href="/docs" className="link-accent">
          Docs hub
        </Link>
      </div>
    </div>
  );
}
