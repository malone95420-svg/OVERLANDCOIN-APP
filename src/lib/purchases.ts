/**
 * Local purchase records (browser localStorage).
 * On-chain BDAG/BDUSD buys attempt locked delivery via PresaleLock
 * (POST /api/presale/deliver) AFTER server verifies the payment tx.
 * External deposits use POST /api/presale/confirm-deposit with pasted tx hash.
 * Never credit from client-only / localStorage-only claims.
 * Status:
 *  - locked — credited on-chain into PresaleLock (non-transferable until listing)
 *  - locked_pending_chain — payment verified (or submitted) but lock credit pending
 *  - pending_delivery — legacy / failed path (should migrate toward locked*)
 *  - pending_external — awaiting tx hash verification (reminder only — no OLC yet)
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

function resolveOlcAmount(p: LocalPurchase): number {
  if (typeof p.olcAmount === "number" && Number.isFinite(p.olcAmount)) {
    return p.olcAmount;
  }
  const n = Number(String(p.olcEstimated).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Preserve identity fields needed for deliver retries across save/update. */
function withRetryFields(
  base: LocalPurchase,
  patch?: Partial<LocalPurchase>,
): LocalPurchase {
  const merged: LocalPurchase = { ...base, ...patch };
  // Never drop txHash / from / olcAmount once known — retries need them.
  if (!merged.txHash && base.txHash) merged.txHash = base.txHash;
  if (!merged.from && base.from) merged.from = base.from;
  if (
    (merged.olcAmount == null || !Number.isFinite(merged.olcAmount)) &&
    typeof base.olcAmount === "number" &&
    Number.isFinite(base.olcAmount)
  ) {
    merged.olcAmount = base.olcAmount;
  }
  if (merged.olcAmount == null || !Number.isFinite(merged.olcAmount)) {
    const n = resolveOlcAmount(merged);
    if (n > 0) merged.olcAmount = n;
  }
  return merged;
}

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
  const existing = prev.find((p) => p.txHash === purchase.txHash);
  const record = withRetryFields(existing ?? purchase, existing ? purchase : undefined);
  // Prefer incoming fields but keep identity for retries
  const final = withRetryFields(
    {
      ...record,
      ...purchase,
      txHash: purchase.txHash || record.txHash,
      from: purchase.from || record.from,
      olcAmount:
        typeof purchase.olcAmount === "number" && Number.isFinite(purchase.olcAmount)
          ? purchase.olcAmount
          : record.olcAmount,
    },
  );
  const next = [final, ...prev.filter((p) => p.txHash !== final.txHash)].slice(0, 50);
  localStorage.setItem(scopedStorageKey(PURCHASES_STORAGE_KEY), JSON.stringify(next));
  return next;
}

export function updatePurchase(
  txHash: string,
  patch: Partial<LocalPurchase>,
): LocalPurchase[] {
  const prev = loadPurchases();
  const next = prev.map((p) => {
    if (p.txHash !== txHash) return p;
    // Keep from / olcAmount / txHash even if patch omits or clears them.
    const merged = withRetryFields(p, {
      ...patch,
      txHash: patch.txHash || p.txHash,
      from: patch.from || p.from,
      olcAmount:
        typeof patch.olcAmount === "number" && Number.isFinite(patch.olcAmount)
          ? patch.olcAmount
          : p.olcAmount,
    });
    return merged;
  });
  localStorage.setItem(scopedStorageKey(PURCHASES_STORAGE_KEY), JSON.stringify(next));
  return next;
}

/** Purchases awaiting PresaleLock on-chain credit (for Retry / auto-retry). */
export function listPendingLockCredits(address?: string | null): LocalPurchase[] {
  const list = loadPurchases();
  return list.filter((p) => {
    if (p.status !== "locked_pending_chain") return false;
    // Real payment ids only — exclude local reminder stubs
    if (!p.txHash || p.txHash.startsWith("external:")) return false;
    if (p.txHash.length < 10) return false;
    const olc = resolveOlcAmount(p);
    if (!(olc > 0)) return false;
    if (address) {
      if (p.from && p.from.toLowerCase() !== address.toLowerCase()) return false;
    }
    return true;
  });
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
    .reduce((sum, p) => sum + resolveOlcAmount(p), 0);
}
