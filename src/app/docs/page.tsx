import type { Metadata } from "next";
import Link from "next/link";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

export const metadata: Metadata = {
  title: "Docs",
  description: "OVERLANDCOIN documentation hub — whitepaper coming soon.",
};

const DOCS = [
  {
    title: "Whitepaper",
    status: "Coming soon",
    body: "Full protocol and adventure-economy whitepaper is in progress.",
  },
  {
    title: "Token reference",
    status: "Live",
    body: `Contract ${TOKEN.contractAddress} on ${TOKEN.chainName} (chainId ${TOKEN.chainId}).`,
    href: "/tokenomics",
  },
  {
    title: "Wallet setup",
    status: "Live",
    body: "Add BlockDAG RPC + import OLC — step by step.",
    href: "/presale",
  },
  {
    title: "PresaleLock",
    status: "Deploy",
    body: "Instant locked delivery: deploy contracts/PresaleLock.sol on BlockDAG 1404, fund with OLC, set NEXT_PUBLIC_PRESALE_LOCK_ADDRESS + PRESALE_DELIVER_PRIVATE_KEY. Owner calls enableTrading() after exchange listings. See contracts/README.md.",
    href: "/presale",
  },
  {
    title: "Quest & map concepts",
    status: "Demo",
    body: "Explore the demo quest map and leaderboard UX.",
    href: "/map",
  },
  {
    title: "Roadmap",
    status: "Live",
    body: "Phased plan with estimate disclaimer.",
    href: "/roadmap",
  },
  {
    title: "Explorer",
    status: "External",
    body: "Verify the contract on BlockDAG explorer.",
    href: explorerAddressUrl(),
    external: true,
  },
];

export default function DocsPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Documentation</span>
      <h1 className="section-title mt-4">Docs hub</h1>
      <p className="section-sub">
        Whitepaper landing soon. Meanwhile, use these references for the token, wallet setup, and product demos.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {DOCS.map((doc) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-white">{doc.title}</h2>
                <span className="badge !text-[10px]">{doc.status}</span>
              </div>
              <p className="mt-3 text-sm text-slate-400 break-all">{doc.body}</p>
            </>
          );

          if (doc.href) {
            if (doc.external) {
              return (
                <a
                  key={doc.title}
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card transition hover:border-gold/40"
                >
                  {inner}
                </a>
              );
            }
            return (
              <Link key={doc.title} href={doc.href} className="card transition hover:border-gold/40">
                {inner}
              </Link>
            );
          }

          return (
            <div key={doc.title} className="card opacity-80">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
