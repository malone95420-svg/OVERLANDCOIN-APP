import {
  getAcceptedPayAssets,
  paymentMode,
  type AcceptedPayAsset,
  type AcceptedAssetId,
} from "@/lib/acceptedPayAssets";

/** Chip order for the unified checkout. Hide quote-only / broken assets. */
const CHECKOUT_ORDER: AcceptedAssetId[] = [
  "BDAG",
  "ETH",
  "USDT",
  "USDC",
  "SOL",
  "BTC",
];

export function getCheckoutPayAssets(): AcceptedPayAsset[] {
  const all = getAcceptedPayAssets();
  const byId = new Map(all.map((a) => [a.id, a]));
  const out: AcceptedPayAsset[] = [];
  for (const id of CHECKOUT_ORDER) {
    const a = byId.get(id);
    if (!a) continue;
    const mode = paymentMode(a);
    if (mode === "quote_only") continue;
    // Require a real pay path
    if (mode === "onchain" || (mode === "deposit" && a.depositAddress)) {
      out.push(a);
    }
  }
  return out;
}

export function payChainForAsset(
  id: AcceptedAssetId | string,
): "blockdag" | "ethereum" | "bitcoin" | "solana" {
  switch (id) {
    case "BDAG":
    case "BDUSD":
      return "blockdag";
    case "ETH":
    case "USDT":
    case "USDC":
      return "ethereum";
    case "BTC":
      return "bitcoin";
    case "SOL":
      return "solana";
    default:
      return "ethereum";
  }
}

export function isOnChainAsset(asset: AcceptedPayAsset): boolean {
  return paymentMode(asset) === "onchain";
}

export function isEvmDepositAsset(id: string): boolean {
  const u = id.toUpperCase();
  return u === "ETH" || u === "USDT" || u === "USDC";
}

export function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=168x168&margin=8&data=${encodeURIComponent(data)}`;
}

export function solanaPayUri(depositAddress: string, solAmount: number): string {
  const amount = Number(solAmount.toFixed(9)).toString();
  const params = new URLSearchParams({
    amount,
    label: "OVERLANDCOIN Presale",
    message: "OLC locked until listing",
  });
  return `solana:${depositAddress}?${params.toString()}`;
}
