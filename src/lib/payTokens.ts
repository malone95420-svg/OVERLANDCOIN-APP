/**
 * Pay tokens for OLC presale on BlockDAG Mainnet (1404).
 * - Native BDAG: always enabled
 * - Official BDUSD (BlockDAG Labs beta stablecoin): hardcoded verified address
 * - USDT/USDC/WETH: env-only — do NOT hardcode unofficial community addresses
 * CEX USDT pairs are off-chain; on-site buys use BDAG/BDUSD on BlockDAG.
 *
 * OLC amounts use live USD value ÷ live batch price (see livePrices + PresaleBuy).
 * Never use a hard-coded BDAG rate as the primary Buy source.
 */
import type { Address } from "viem";

export type PayTokenId = "BDAG" | "BDUSD" | "USDT" | "USDC" | "ETH";

export type PayTokenOption = {
  id: PayTokenId;
  symbol: string;
  label: string;
  /** Native BDAG has no contract address */
  address?: Address;
  kind: "native" | "erc20";
  /** Hint only — decimals are read on-chain for ERC-20 when possible */
  decimalsHint: number;
  /** Short note shown in UI */
  note?: string;
};

/** Official BDUSD on BlockDAG Mainnet (BlockDAG Labs beta synthetic dollar). */
export const BDUSD_ADDRESS =
  "0x35ABC7f6Cdcd2eB99a7A6e6D1169bf915d972a1b" as const satisfies Address;

function envAddress(key: string): Address | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return undefined;
  return raw as Address;
}

/** Always-available native + official BDUSD + any env-configured extras. */
export function getPayTokenOptions(): PayTokenOption[] {
  const options: PayTokenOption[] = [
    {
      id: "BDAG",
      symbol: "BDAG",
      label: "BDAG (native)",
      kind: "native",
      decimalsHint: 18,
      note: "OLC amount uses live BDAG/USD ÷ batch price",
    },
    {
      id: "BDUSD",
      symbol: "BDUSD",
      label: "BDUSD",
      address: BDUSD_ADDRESS,
      kind: "erc20",
      decimalsHint: 18,
      note: "Official BlockDAG Labs beta stablecoin (not USDT/USDC) — treated as $1",
    },
  ];

  const usdt = envAddress("NEXT_PUBLIC_PAY_TOKEN_USDT");
  if (usdt) {
    options.push({
      id: "USDT",
      symbol: "USDT",
      label: "USDT",
      address: usdt,
      kind: "erc20",
      decimalsHint: 6,
      note: "Treated as $1 for batch pricing",
    });
  }

  const usdc = envAddress("NEXT_PUBLIC_PAY_TOKEN_USDC");
  if (usdc) {
    options.push({
      id: "USDC",
      symbol: "USDC",
      label: "USDC",
      address: usdc,
      kind: "erc20",
      decimalsHint: 6,
      note: "Treated as $1 for batch pricing",
    });
  }

  const eth = envAddress("NEXT_PUBLIC_PAY_TOKEN_ETH");
  if (eth) {
    options.push({
      id: "ETH",
      symbol: "WETH",
      label: "Wrapped ETH",
      address: eth,
      kind: "erc20",
      decimalsHint: 18,
      note: "OLC amount uses live ETH/USD ÷ batch price",
    });
  }

  return options;
}

/**
 * Env BDAG/USD estimate — display/stale fallback ONLY.
 * Buy math must use a fresh live rate from /api/prices (never this as primary).
 */
export function getBdagUsdStaleEstimate(): number | null {
  const raw = process.env.NEXT_PUBLIC_BDAG_USD_PRICE?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @deprecated Use live /api/prices — kept for any leftover imports */
export function getBdagUsdPrice(): number {
  return getBdagUsdStaleEstimate() ?? 0.05;
}
