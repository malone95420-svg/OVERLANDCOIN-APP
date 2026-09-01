/**
 * Local purchase records (browser localStorage).
 * Status is pending_delivery — treasury contribution model until a
 * presale contract can mint/claim OLC automatically.
 * External deposits (BTC/ETH/USDT off BlockDAG) use pending_external.
 */
export const PURCHASES_STORAGE_KEY = "overlandcoin.purchases.v1";

export type LocalPurchase = {
  id: string;
  /** On-chain tx hash, or external:pending:* placeholder */
  txHash: string;
  timestamp: number;
  from?: string;
  payAsset: string;
  payAmount: string;
  /** OLC credited from usdPaid / batchPriceUsed */
  olcEstimated: string;
  /** @deprecated prefer batchPriceUsed */
  batchPriceUsdt: number;
  /** Live batch price used for this purchase */
  batchPriceUsed: number;
  /** Live USD rate of the pay token used for this purchase */
  usdRateUsed: number;
  /** USD value paid = payAmount * usdRateUsed */
  usdPaid: number;
  /** @deprecated prefer usdPaid */
  usdEstimated: number;
  status: "pending_delivery" | "pending_external";
  /** deposit | onchain */
  payMethod?: "onchain" | "deposit";
  depositAddress?: string;
  depositNetwork?: string;
};

export function loadPurchases(): LocalPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PURCHASES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalPurchase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePurchase(purchase: LocalPurchase): LocalPurchase[] {
  const prev = loadPurchases();
  const next = [purchase, ...prev.filter((p) => p.txHash !== purchase.txHash)].slice(0, 50);
  localStorage.setItem(PURCHASES_STORAGE_KEY, JSON.stringify(next));
  return next;
}
