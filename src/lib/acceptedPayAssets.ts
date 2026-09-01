/**
 * Allowlisted cryptos accepted for OLC purchases.
 * OLC = payAmount * liveUsd(asset) / batchPrice — always proportional to live value.
 *
 * Payment paths:
 * - onChain BlockDAG (native BDAG / ERC-20): wallet transfer via PresaleBuy
 * - externalDeposit: optional NEXT_PUBLIC_DEPOSIT_* address + instructions
 * - quoteOnly: accepted for quote; on-chain/deposit coming soon
 */
import type { Address } from "viem";
import { BDUSD_ADDRESS } from "@/lib/payTokens";
import type { LivePricesResponse } from "@/lib/livePrices";

export type LivePriceKey =
  | "bdagUsd"
  | "bdusdUsd"
  | "usdtUsd"
  | "usdcUsd"
  | "ethUsd"
  | "btcUsd"
  | "solUsd"
  | "bnbUsd";

export type AcceptedAssetId =
  | "BDAG"
  | "BDUSD"
  | "USDT"
  | "USDC"
  | "ETH"
  | "BTC"
  | "SOL"
  | "BNB";

export type OnChainBlockdag =
  | { kind: "native"; decimalsHint: number }
  | { kind: "erc20"; address: Address; decimalsHint: number };

export type AcceptedPayAsset = {
  id: AcceptedAssetId;
  symbol: string;
  label: string;
  livePriceKey: LivePriceKey;
  accepted: true;
  /** BlockDAG Mainnet transfer path when available */
  onChain?: OnChainBlockdag;
  /** External deposit address (BTC / ETH mainnet / etc.) from env */
  depositAddress?: string;
  depositNetwork?: string;
  depositNote?: string;
  /** Shown when neither on-chain nor deposit is ready */
  comingSoonNote?: string;
};

function envStr(key: string): string | undefined {
  const raw = process.env[key]?.trim();
  return raw || undefined;
}

function envEvmAddress(key: string): Address | undefined {
  const raw = envStr(key);
  if (!raw) return undefined;
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return undefined;
  return raw as Address;
}

/**
 * Full allowlist. On-chain ERC-20 extras use NEXT_PUBLIC_PAY_TOKEN_*;
 * external deposits use NEXT_PUBLIC_DEPOSIT_*.
 */
export function getAcceptedPayAssets(): AcceptedPayAsset[] {
  const assets: AcceptedPayAsset[] = [
    {
      id: "BDAG",
      symbol: "BDAG",
      label: "BDAG (BlockDAG native)",
      livePriceKey: "bdagUsd",
      accepted: true,
      onChain: { kind: "native", decimalsHint: 18 },
    },
    {
      id: "BDUSD",
      symbol: "BDUSD",
      label: "BDUSD (BlockDAG)",
      livePriceKey: "bdusdUsd",
      accepted: true,
      onChain: { kind: "erc20", address: BDUSD_ADDRESS, decimalsHint: 18 },
      depositNote: "Official BlockDAG Labs beta synthetic dollar — treated as $1",
    },
    {
      id: "USDT",
      symbol: "USDT",
      label: "USDT",
      livePriceKey: "usdtUsd",
      accepted: true,
      onChain: (() => {
        const addr = envEvmAddress("NEXT_PUBLIC_PAY_TOKEN_USDT");
        return addr
          ? { kind: "erc20" as const, address: addr, decimalsHint: 6 }
          : undefined;
      })(),
      depositAddress: envStr("NEXT_PUBLIC_DEPOSIT_USDT"),
      depositNetwork: envStr("NEXT_PUBLIC_DEPOSIT_USDT_NETWORK") || "as published",
      depositNote: "Tether — $1 peg for OLC math",
      comingSoonNote: "Accepted — on-chain / deposit pay coming soon",
    },
    {
      id: "USDC",
      symbol: "USDC",
      label: "USDC",
      livePriceKey: "usdcUsd",
      accepted: true,
      onChain: (() => {
        const addr = envEvmAddress("NEXT_PUBLIC_PAY_TOKEN_USDC");
        return addr
          ? { kind: "erc20" as const, address: addr, decimalsHint: 6 }
          : undefined;
      })(),
      depositAddress: envStr("NEXT_PUBLIC_DEPOSIT_USDC"),
      depositNetwork: envStr("NEXT_PUBLIC_DEPOSIT_USDC_NETWORK") || "as published",
      depositNote: "USD Coin — $1 peg for OLC math",
      comingSoonNote: "Accepted — on-chain / deposit pay coming soon",
    },
    {
      id: "ETH",
      symbol: "ETH",
      label: "ETH",
      livePriceKey: "ethUsd",
      accepted: true,
      onChain: (() => {
        const addr = envEvmAddress("NEXT_PUBLIC_PAY_TOKEN_ETH");
        return addr
          ? { kind: "erc20" as const, address: addr, decimalsHint: 18 }
          : undefined;
      })(),
      depositAddress: envStr("NEXT_PUBLIC_DEPOSIT_ETH"),
      depositNetwork: envStr("NEXT_PUBLIC_DEPOSIT_ETH_NETWORK") || "Ethereum",
      depositNote: "Live ETH/USD ÷ batch price",
      comingSoonNote: "Accepted — on-chain / deposit pay coming soon",
    },
    {
      id: "BTC",
      symbol: "BTC",
      label: "BTC",
      livePriceKey: "btcUsd",
      accepted: true,
      depositAddress: envStr("NEXT_PUBLIC_DEPOSIT_BTC"),
      depositNetwork: envStr("NEXT_PUBLIC_DEPOSIT_BTC_NETWORK") || "Bitcoin",
      depositNote: "Live BTC/USD ÷ batch price",
      comingSoonNote: "Accepted — on-chain pay coming soon",
    },
  ];

  // Optional extras via env flags (easy to extend)
  if (envStr("NEXT_PUBLIC_ACCEPT_SOL") === "1") {
    assets.push({
      id: "SOL",
      symbol: "SOL",
      label: "SOL",
      livePriceKey: "solUsd",
      accepted: true,
      depositAddress: envStr("NEXT_PUBLIC_DEPOSIT_SOL"),
      depositNetwork: "Solana",
      comingSoonNote: "Accepted — deposit pay coming soon",
    });
  }
  if (envStr("NEXT_PUBLIC_ACCEPT_BNB") === "1") {
    assets.push({
      id: "BNB",
      symbol: "BNB",
      label: "BNB",
      livePriceKey: "bnbUsd",
      accepted: true,
      depositAddress: envStr("NEXT_PUBLIC_DEPOSIT_BNB"),
      depositNetwork: "BNB Chain",
      comingSoonNote: "Accepted — deposit pay coming soon",
    });
  }

  return assets;
}

export function paymentMode(
  asset: AcceptedPayAsset
): "onchain" | "deposit" | "quote_only" {
  if (asset.onChain) return "onchain";
  if (asset.depositAddress) return "deposit";
  return "quote_only";
}

export function liveUsdForAsset(
  asset: AcceptedPayAsset,
  prices: LivePricesResponse | null
): number | null {
  if (!prices) return null;
  const v = prices[asset.livePriceKey];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export function sourceLabelForAsset(
  asset: AcceptedPayAsset,
  prices: LivePricesResponse | null
): string {
  if (!prices) return "—";
  const key = asset.livePriceKey.replace(/Usd$/, "");
  if (prices.sources?.[key]) return prices.sources[key];
  if (asset.livePriceKey === "bdagUsd") return prices.source ?? "—";
  if (
    asset.livePriceKey === "usdtUsd" ||
    asset.livePriceKey === "usdcUsd" ||
    asset.livePriceKey === "bdusdUsd"
  ) {
    return "peg $1";
  }
  return "—";
}

/** True when Buy math may proceed (live rate present; BDAG must be fresh CEX quote). */
export function rateReadyForBuy(
  asset: AcceptedPayAsset,
  prices: LivePricesResponse & { hasLiveBdag?: boolean }
): boolean {
  const usd = liveUsdForAsset(asset, prices);
  if (usd == null || !(usd > 0)) return false;
  if (asset.id === "BDAG") return Boolean(prices.hasLiveBdag ?? prices.bdagUsd);
  return true;
}
