import Image from "next/image";
import Link from "next/link";
import { TokenStrip } from "@/components/TokenStrip";
import { HOW_IT_WORKS, PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerAddressUrl } from "@/lib/token";

const FEATURES = [
  {
    title: "Proof-of-Adventure",
    body: "Turn real-world exploration into verifiable check-ins. Move. Explore. Earn.",
  },
  {
    title: "Location Rewards",
    body: "Quest map waypoints reward overlanders for showing up where the trail leads.",
  },
  {
    title: "Built on BlockDAG",
    body: `OLC lives on ${TOKEN.chainName} (chainId ${TOKEN.chainId}) — fast settlement for the journey ahead.`,
  },
  {
    title: "Fuel for the Journey",
    body: "A community token designed around maps, routes, and the overland lifestyle.",
  },
];

export default function HomePage() {
  const liveBatch = PRESALE_BATCHES.find((b) => b.status === "LIVE");

  return (
    <>
      <section className="relative overflow-hidden bg-hero-glow">
        <div className="container-page grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="badge border-gold/30 text-gold-bright">Explore. Discover. Earn.</span>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              <span className="gold-text" style={{ textShadow: "0 0 40px rgba(201,149,42,0.35)" }}>
                OVERLAND
              </span>
              <span className="text-white">COIN</span>
            </h1>
            <p className="mt-3 text-xl font-semibold text-gold-bright">{SITE.tagline}</p>
            <p className="section-sub">
              Complete real-world quests, visit hidden locations, and earn{" "}
              <span className="font-semibold text-gold-bright">$OLC</span> — proof-of-adventure on
              BlockDAG. {SITE.homeHook}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/presale" className="btn-primary !px-8 !py-3.5 text-base">
                Join Presale
              </Link>
              <Link href="/map" className="btn-secondary !px-8 !py-3.5 text-base">
                Explore Quest Map
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              <Link href="/dashboard" className="link-accent">
                Open Dashboard
              </Link>
              {" · "}
              <a href={explorerAddressUrl()} target="_blank" rel="noopener noreferrer" className="link-accent">
                View Contract
              </a>
            </p>
            {liveBatch && (
              <p className="mt-6 text-sm text-slate-400">
                Presale Batch {liveBatch.batch}:{" "}
                <span className="font-semibold text-gold-bright">
                  ${liveBatch.priceUsdt.toFixed(3)} USDT
                </span>{" "}
                <span className="badge !ml-2">LIVE</span>
              </p>
            )}
            <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-bg-panel/70 p-4">
                <dt className="text-xs text-slate-500">Symbol</dt>
                <dd className="text-lg font-bold text-gold-bright">{TOKEN.symbol}</dd>
              </div>
              <div className="rounded-xl border border-border bg-bg-panel/70 p-4">
                <dt className="text-xs text-slate-500">On-chain supply</dt>
                <dd className="text-lg font-bold text-white">{TOKEN.totalSupplyFormatted}</dd>
              </div>
              <div className="rounded-xl border border-border bg-bg-panel/70 p-4 col-span-2 sm:col-span-1">
                <dt className="text-xs text-slate-500">Decimals</dt>
                <dd className="text-lg font-bold text-white">{TOKEN.decimals}</dd>
              </div>
            </dl>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-gold/20 via-transparent to-cyan-accent/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-border shadow-gold">
              <Image
                src="/hero.jpeg"
                alt="OVERLANDCOIN — Land Cruiser adventure art with coin"
                width={1200}
                height={900}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
            <div className="absolute -bottom-4 -left-2 sm:left-4">
              <Image src="/logo.png" alt="OLC" width={88} height={88} className="rounded-full border-2 border-gold shadow-gold" />
            </div>
          </div>
        </div>
      </section>

      <TokenStrip />

      <section className="container-page py-16">
        <h2 className="section-title">How It Works</h2>
        <p className="section-sub">Find → Visit → Earn</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <article key={s.step} className="card relative">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-accent">
                Step {i + 1}
              </span>
              <h3 className="mt-2 text-xl font-bold text-gold-bright">{s.step}</h3>
              <p className="mt-2 text-sm text-slate-400">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-page pb-16">
        <h2 className="section-title">Why OVERLANDCOIN</h2>
        <p className="section-sub">Adventure powered. Location rewarded. Built for people who go farther.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="card">
              <h3 className="text-lg font-semibold text-gold-bright">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/presale" className="btn-primary">Presale</Link>
          <Link href="/tokenomics" className="btn-secondary">Tokenomics</Link>
          <Link href="/roadmap" className="btn-secondary">Roadmap</Link>
          <Link href="/docs" className="btn-secondary">Docs</Link>
        </div>
      </section>
    </>
  );
}
