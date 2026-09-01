/**
 * Tokenomics allocation config from the live public site.
 *
 * IMPORTANT: Percentages are DRAFT relative to the old 5B UI narrative.
 * On-chain total supply is 9,000,000,000 OLC — founders must confirm whether
 * these % still apply to the full 9B or to a subset. UI labels this clearly.
 */
export type Allocation = {
  label: string;
  percent: number;
  description: string;
  color: string;
};

/** @draft Live-site buckets — confirm against 9B on-chain supply. */
export const ALLOCATIONS: Allocation[] = [
  {
    label: "Presale",
    percent: 10,
    description: "Public presale allocation (old UI claimed ~500M OLC against a prior 5B frame).",
    color: "#f5a623",
  },
  {
    label: "Ecosystem Rewards",
    percent: 35,
    description: "Location rewards, quests, and community incentives.",
    color: "#c9952a",
  },
  {
    label: "Team & Advisors",
    percent: 15,
    description: "3-year vest, 1-year cliff (as published on live site).",
    color: "#b8821f",
  },
  {
    label: "Treasury",
    percent: 20,
    description: "Operations / treasury reserve.",
    color: "#38c4e8",
  },
  {
    label: "Liquidity",
    percent: 10,
    description: "DEX liquidity when markets go live (no pairs yet).",
    color: "#1a8aab",
  },
  {
    label: "Marketing",
    percent: 5,
    description: "Growth and partnerships.",
    color: "#6b7280",
  },
  {
    label: "Locked Reserve",
    percent: 5,
    description: "2-year lock (as published on live site).",
    color: "#1a2a3a",
  },
];

export const TOKENOMICS_DISCLAIMER =
  "Allocation percentages mirror the live public site and are a draft plan pending founder confirmation. On-chain total supply is 9,000,000,000 OLC (the old UI incorrectly showed 5B). Absolute token amounts for each bucket need confirmation against the 9B supply.";
