/**
 * Browser-local open Pay Orders so deposit checkouts can resume after refresh
 * and auto-poll confirm without relying on server crons.
 */

import { scopedStorageKey } from "@/lib/auth/accountScope";

export const OPEN_PAY_ORDERS_KEY = "overlandcoin.openPayOrders.v1";

export type OpenPayOrder = {
  orderId: string;
  buyer: string;
  payAsset: string;
  payAmount: number;
  olcAmount: number;
  depositAddress: string;
  depositNetwork: string;
  expiresAt: number;
  usdPaid?: number;
  /** Optional known payment tx / signature from wallet submit */
  paymentTxHint?: string;
  savedAt: number;
};

function storageKey() {
  return scopedStorageKey(OPEN_PAY_ORDERS_KEY);
}

export function loadOpenPayOrders(): OpenPayOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OpenPayOrder[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (o) =>
        o &&
        typeof o.orderId === "string" &&
        o.orderId.length >= 8 &&
        typeof o.expiresAt === "number" &&
        o.expiresAt > now,
    );
  } catch {
    return [];
  }
}

function persist(orders: OpenPayOrder[]) {
  localStorage.setItem(storageKey(), JSON.stringify(orders.slice(0, 20)));
}

export function saveOpenPayOrder(
  order: Omit<OpenPayOrder, "savedAt"> & { savedAt?: number },
): OpenPayOrder[] {
  const prev = loadOpenPayOrders();
  const next: OpenPayOrder = {
    ...order,
    savedAt: order.savedAt ?? Date.now(),
  };
  const merged = [next, ...prev.filter((o) => o.orderId !== next.orderId)].slice(
    0,
    20,
  );
  persist(merged);
  return merged;
}

export function updateOpenPayOrderHint(
  orderId: string,
  paymentTxHint: string,
): void {
  const prev = loadOpenPayOrders();
  const next = prev.map((o) =>
    o.orderId === orderId ? { ...o, paymentTxHint, savedAt: Date.now() } : o,
  );
  persist(next);
}

export function clearOpenPayOrder(orderId: string): void {
  const prev = loadOpenPayOrders();
  persist(prev.filter((o) => o.orderId !== orderId));
}

/** Recent open orders for a buyer (newest first). */
export function listOpenPayOrdersForBuyer(buyer?: string | null): OpenPayOrder[] {
  const list = loadOpenPayOrders();
  if (!buyer) return list;
  const b = buyer.toLowerCase();
  return list.filter((o) => o.buyer.toLowerCase() === b);
}
