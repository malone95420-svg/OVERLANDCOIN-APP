/**
 * Local purchase records (browser localStorage).
 * On-chain BDAG/BDUSD buys attempt instant locked delivery via PresaleLock
 * (POST /api/presale/deliver). Status:
 *  - locked — credited on-chain into PresaleLock (non-transferable until listing)
 *  - locked_pending_chain — local credit only; lock contract/key not configured yet
 *  - pending_delivery — legacy / failed path (should migrate toward locked*)
 *  - pending_external — off-chain deposit awaiting confirmation
 *
 * Keys are namespaced by accountKey when signed in (see accountScope).
 */

import { scopedStorageKey } from "@/lib/auth/accountScope";

export const PURCHASES_STORAGE_KEY = "overlandcoin.purchases.v1";

export type PurchaseStatus =
  | "locked"
  | "locked_pending_chain"
  | "pending_delivery"
  | "pending_external";

export type LocalPurchase = {
  id: string;
  /** On-chain payment tx hash, or external:pending:* placeholder */
  txHash: string;
  timestamp: number;
  from?: string;
  payAsset: string;
  payAmount: string;
  /** OLC credited from usdPaid / batchPriceUsed */
  olcEstimated: string;
  /** Numeric OLC amount when known */
  olcAmount?: number;
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
  status: PurchaseStatus;
  /** deposit | onchain */
  payMethod?: "onchain" | "deposit";
  depositAddress?: string;
  depositNetwork?: string;
  /** PresaleLock credit tx when status === locked */
  creditTxHash?: string;
  /** Honest note when awaiting lock config */
  deliveryNote?: string;
};

export function loadPurchases(): LocalPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedStorageKey(PURCHASES_STORAGE_KEY));
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
  localStorage.setItem(scopedStorageKey(PURCHASES_STORAGE_KEY), JSON.stringify(next));
  return next;
}

export function updatePurchase(
  txHash: string,
  patch: Partial<LocalPurchase>,
): LocalPurchase[] {
  const prev = loadPurchases();
  const next = prev.map((p) => (p.txHash === txHash ? { ...p, ...patch } : p));
  localStorage.setItem(scopedStorageKey(PURCHASES_STORAGE_KEY), JSON.stringify(next));
  return next;
}

/** Sum of OLC from locked / locked_pending_chain / legacy pending_delivery for a wallet. */
export function sumLocalLockedOlc(wallet?: string | null): number {
  const list = loadPurchases();
  return list
    .filter((p) => {
      if (wallet && p.from && p.from.toLowerCase() !== wallet.toLowerCase()) return false;
      return (
        p.status === "locked" ||
        p.status === "locked_pending_chain" ||
        p.status === "pending_delivery"
      );
    })
    .reduce((sum, p) => {
      const n =
        typeof p.olcAmount === "number" && Number.isFinite(p.olcAmount)
          ? p.olcAmount
          : Number(String(p.olcEstimated).replace(/,/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
}
