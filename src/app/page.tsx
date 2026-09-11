import Image from "next/image";
import Link from "next/link";
import { TokenStrip } from "@/components/TokenStrip";
import { HOW_IT_WORKS, PRESALE_BATCHES, SITE } from "@/lib/site";
import { TOKEN, explorerAddressUrl } from "@/lib/token";
import { QUEST_COUNT } from "@/lib/quests";
import { REWARD_BY_DIFFICULTY } from "@/lib/questRewards";

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
  const tge = PRESALE_BATCHES[PRESALE_BATCHES.length - 1];
  const fdvUsd = Number(TOKEN.totalSupply) * tge.priceUsdt;

  return (
    <>
      <section className="relative overflow-hidden bg-hero-glow">
        <div className="container-page grid items-center gap-10 py-20 lg:grid-cols-2 lg:py-28">
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
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-bg-panel px-3 py-1 text-xs text-slate-300">
                TGE: <span className="font-semibold text-gold-bright">${tge.priceUsdt.toFixed(4)}</span>
              </span>
              <span className="rounded-full border border-border bg-bg-panel px-3 py-1 text-xs text-slate-300">
                Est. FDV: <span className="font-semibold text-gold-bright">${(fdvUsd / 1_000_000).toFixed(0)}M</span>
              </span>
            </div>
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

      <section className="border-b border-border bg-bg-card/30">
        <div className="container-page grid items-center gap-8 py-16 lg:grid-cols-2">
          <div>
            <span className="badge">Quest Map</span>
            <h2 className="section-title mt-4">Explore the map</h2>
            <p className="section-sub">
              Hundreds of real-world waypoints. Visit, check in with GPS, and earn OLC for showing up.
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Active Quests</dt>
                <dd className="mt-1 text-2xl font-bold text-gold-bright">{QUEST_COUNT}</dd>
              </div>
              <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Difficulty</dt>
                <dd className="mt-1 text-sm font-semibold text-white">Easy → Legendary</dd>
              </div>
              <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Rewards</dt>
                <dd className="mt-1 text-sm font-semibold text-white">225–600 OLC</dd>
              </div>
            </dl>
            <Link href="/map" className="btn-primary mt-8">Explore Quest Map</Link>
          </div>
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-accent">Difficulty tiers</p>
            <ul className="mt-4 space-y-3 text-sm">
              {Object.entries(REWARD_BY_DIFFICULTY).map(([d, r]) => (
                <li key={d} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
                  <span className="text-slate-300">{d}</span>
                  <span className="font-semibold text-gold-bright">{r} OLC</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="section-title">How It Works</h2>
        <p className="section-sub">Find → Visit → Earn</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
