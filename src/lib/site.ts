/**
 * Site-wide configurable values + placeholders.
 * Do NOT invent social handles or DEX links — leave empty until real.
 */
export const SITE = {
  name: "OVERLANDCOIN",
  tagline: "Adventure Powered. Location Rewarded.",
  homeHook: "Explore. Discover. Earn.",
  description:
    "OVERLANDCOIN (OLC) is adventure/overlanding crypto built on BlockDAG — Move. Explore. Earn. Fuel for the Journey. Proof-of-adventure with maps and location rewards.",
  url: (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://overlandcoin-app-kohl.vercel.app"),
  supportEmail: "overlanders.official@gmail.com",
  keywords: [
    "OVERLANDCOIN",
    "OLC",
    "BlockDAG",
    "overlanding",
    "adventure crypto",
    "location rewards",
    "proof-of-adventure",
    "presale",
  ],
  /** Placeholder — replace when official accounts launch */
  social: {
    twitter: "",
    telegram: "",
    discord: "",
  },
  /** Placeholder — no DEX pairs yet */
  dex: {
    swapUrl: "",
    pairAddress: "",
  },
  /**
   * Treasury / receiving wallet published on the live Presale page.
   * Not a staking contract.
   */
  treasuryAddress: "0x310a612db74456cbc25a1f4f86fa0c265d98af99",
  /**
   * External deposit receive addresses (also defaulted in acceptedPayAssets).
   * EVM assets share the BlockDAG treasury key on Ethereum.
   */
  deposits: {
    ethereumEvm: "0x310a612db74456cbc25a1f4f86fa0c265d98af99",
    ethereumNetwork: "Ethereum",
    usdtNetwork: "Ethereum (ERC-20)",
    solana: "FEUnNerfhepyz2fR7Dg5gV59hxpJ92VYg9Yv9LbmP5tJ",
    solanaNetwork: "Solana",
    bitcoin: "bc1qp6m0apc0mx6y88xw3ustezwaf7wfyvhvurs9ug",
    bitcoinNetwork: "Bitcoin (native SegWit)",
  },
  /** Placeholder — staking is UI mock only; no live staking contract */
  stakingContract: "",
} as const;

/** Presale batch pricing (USDT) — normalized from Home/Presale/Tokenomics (not FAQ $0.0005 bug). */
export const PRESALE_BATCHES = [
  { batch: 1, priceUsdt: 0.001, status: "LIVE" as const },
  { batch: 2, priceUsdt: 0.002, status: "Upcoming" as const },
  { batch: 3, priceUsdt: 0.004, status: "Upcoming" as const },
  { batch: 4, priceUsdt: 0.007, status: "Upcoming" as const },
  { batch: 5, priceUsdt: 0.01, status: "TGE" as const, label: "Batch 5 / TGE" },
] as const;

export const PRESALE_META = {
  /** 10% of 9B on-chain supply */
  allocationOlC: 900_000_000,
  hardCapUsd: 500_000,
} as const;

/** Staking plan mock APYs (illustrative only — no live contract). */
export const STAKING_PLANS = [
  { days: 30, apyPercent: 15 },
  { days: 90, apyPercent: 35 },
  { days: 180, apyPercent: 65 },
  { days: 365, apyPercent: 120 },
] as const;

export const HOW_IT_WORKS = [
  { step: "Find", body: "Browse quests on the map and pick your next waypoint." },
  { step: "Visit", body: "Get out there — overland to the location." },
  { step: "Earn", body: "Check in with GPS + photo proof. OLC is recorded as pending claim until the reward contract is live." },
  { step: "Stake", body: "Optionally stake OLC when staking goes live (mock UI today)." },
] as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/presale", label: "Presale" },
  { href: "/map", label: "Quest Map" },
  { href: "/feed", label: "Feed" },
  { href: "/garage", label: "Garage" },
  { href: "/ranger", label: "Ranger" },
  { href: "/staking", label: "Staking" },
  { href: "/tokenomics", label: "Tokenomics" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
  { href: "/news", label: "News" },
] as const;
