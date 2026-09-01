export type RoadmapPhase = {
  id: string;
  title: string;
  timing: string;
  status: "Done" | "In Progress" | "Upcoming";
  items: string[];
};

export const ROADMAP_DISCLAIMER =
  "Timelines are estimates and may change. Nothing here is a guarantee of delivery, token value, or financial return.";

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: "phase-1",
    title: "Foundation",
    timing: "Phase 1",
    status: "Done",
    items: [
      "OLC token deployed on BlockDAG Mainnet (chainId 1404)",
      "Brand identity and adventure positioning",
      "Public website and docs hub",
      "Explorer listings for contract verification path",
    ],
  },
  {
    id: "phase-2",
    title: "Discovery & Community",
    timing: "Phase 2 (est.)",
    status: "In Progress",
    items: [
      "Quest map demo and location reward concepts",
      "Community channels (placeholders until official handles)",
      "Education: how to add BlockDAG + OLC to wallets",
      "Tokenomics publication (9B on-chain supply + final allocations)",
    ],
  },
  {
    id: "phase-3",
    title: "Markets & Utility",
    timing: "Phase 3 (est.)",
    status: "Upcoming",
    items: [
      "Liquidity / DEX listing when ready (none live yet)",
      "Proof-of-adventure check-ins",
      "Leaderboard seasons",
      "Staking design (research; no live contract yet)",
    ],
  },
  {
    id: "phase-4",
    title: "Scale the Journey",
    timing: "Phase 4 (est.)",
    status: "Upcoming",
    items: [
      "Expanded global quest catalog",
      "Partner overland routes and events",
      "Mobile-friendly adventure tooling",
      "Governance / community proposals (TBD)",
    ],
  },
];
