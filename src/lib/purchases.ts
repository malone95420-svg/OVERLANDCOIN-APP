/**
 * Local purchase records (browser localStorage).
 * Status is pending_delivery — treasury contribution model until a
 * presale contract can mint/claim OLC automatically.
 */
export const PURCHASES_STORAGE_KEY = "overlandcoin.purchases.v1";

export type LocalPurchase = {
  id: string;
  txHash: string;
  timestamp: number;
  from?: string;
  payAsset: string;
  payAmount: string;
  olcEstimated: string;
  batchPriceUsdt: number;
  usdEstimated: number;
  status: "pending_delivery";
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
