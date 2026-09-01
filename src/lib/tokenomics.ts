/**
 * OVERLANDCOIN tokenomics — allocations against on-chain total supply
 * of 9,000,000,000 OLC on BlockDAG (chain ID 1404).
 */
export type Allocation = {
  label: string;
  percent: number;
  /** Absolute OLC amount (whole tokens) */
  amount: number;
  amountFormatted: string;
  description: string;
  color: string;
};

const TOTAL = 9_000_000_000;

function amountFor(percent: number) {
  const amount = Math.round((TOTAL * percent) / 100);
  return {
    amount,
    amountFormatted: amount.toLocaleString("en-US"),
  };
}

export const TOTAL_SUPPLY = TOTAL;
export const TOTAL_SUPPLY_FORMATTED = "9,000,000,000";

export const ALLOCATIONS: Allocation[] = [
  {
    label: "Presale",
    percent: 10,
    ...amountFor(10),
    description: "Public presale allocation — 900M OLC (10%).",
    color: "#f5a623",
  },
  {
    label: "Ecosystem Rewards",
    percent: 35,
    ...amountFor(35),
    description: "Location rewards, quests, and community incentives.",
    color: "#c9952a",
  },
  {
    label: "Team & Advisors",
    percent: 15,
    ...amountFor(15),
    description: "3-year vest, 1-year cliff.",
    color: "#b8821f",
  },
  {
    label: "Treasury",
    percent: 20,
    ...amountFor(20),
    description: "Operations and treasury reserve.",
    color: "#38c4e8",
  },
  {
    label: "Liquidity",
    percent: 10,
    ...amountFor(10),
    description: "DEX liquidity when markets go live.",
    color: "#1a8aab",
  },
  {
    label: "Marketing",
    percent: 5,
    ...amountFor(5),
    description: "Growth and partnerships.",
    color: "#6b7280",
  },
  {
    label: "Locked Reserve",
    percent: 5,
    ...amountFor(5),
    description: "2-year on-chain time lock.",
    color: "#1a2a3a",
  },
];

export const PRESALE_ALLOCATION = ALLOCATIONS[0];
