/**
 * Pay tokens for OLC presale on BlockDAG Mainnet (1404).
 * - Native BDAG: always enabled
 * - Official BDUSD (BlockDAG Labs beta stablecoin): hardcoded verified address
 * - USDT/USDC/WETH: env-only — do NOT hardcode unofficial community addresses
 * CEX USDT pairs are off-chain; on-site buys use BDAG/BDUSD on BlockDAG.
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
      note: "Uses configurable BDAG/USD estimate",
    },
    {
      id: "BDUSD",
      symbol: "BDUSD",
      label: "BDUSD",
      address: BDUSD_ADDRESS,
      kind: "erc20",
      decimalsHint: 18,
      note: "Official BlockDAG Labs beta stablecoin (not USDT/USDC)",
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
    });
  }

  return options;
}

/**
 * Configurable BDAG/USD estimate for converting native payments to OLC.
 * Label clearly as an estimate — not an oracle.
 */
export function getBdagUsdPrice(): number {
  const raw = process.env.NEXT_PUBLIC_BDAG_USD_PRICE?.trim();
  const n = raw ? Number(raw) : 0.05;
  return Number.isFinite(n) && n > 0 ? n : 0.05;
}
