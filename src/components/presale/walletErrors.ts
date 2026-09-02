/** Extract actionable message (+ code) from EIP-1193 / viem / plain objects. */
export function formatWalletError(e: unknown, fallback = "Wallet payment failed."): string {
  if (e == null) return fallback;
  if (typeof e === "string" && e.trim()) return e.trim();

  if (e instanceof Error) {
    const withCause = e as Error & { cause?: unknown; code?: unknown; shortMessage?: string };
    const short = typeof withCause.shortMessage === "string" ? withCause.shortMessage : "";
    const code =
      withCause.code != null && String(withCause.code) !== ""
        ? String(withCause.code)
        : undefined;
    const base = (short || e.message || "").trim();
    if (withCause.cause) {
      const nested = formatWalletError(withCause.cause, "");
      if (nested) {
        if (code && !nested.includes(`code ${code}`)) return `${nested} (code ${code})`;
        return nested;
      }
    }
    if (base) {
      if (code && !base.includes(String(code))) return `${base} (code ${code})`;
      return base;
    }
    return fallback;
  }

  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const code = o.code != null ? String(o.code) : "";
    let msg = "";
    if (typeof o.message === "string") msg = o.message;
    else if (typeof o.reason === "string") msg = o.reason;
    else if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (typeof d.message === "string") msg = d.message;
    }
    msg = msg.trim();
    if (msg && code) return `${msg} (code ${code})`;
    if (msg) return msg;
    if (code) return `Wallet error (code ${code})`;
  }
  return fallback;
}

export function walletErrorCode(e: unknown): number | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const n = Number((e as { code: unknown }).code);
    return Number.isFinite(n) ? n : undefined;
  }
  if (e instanceof Error && "code" in e) {
    const n = Number((e as Error & { code: unknown }).code);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function isUserRejection(e: unknown): boolean {
  const code = walletErrorCode(e);
  if (code === 4001) return true;
  const msg = formatWalletError(e, "");
  return /user rejected|denied|rejected by user|canceled|cancelled/i.test(msg);
}
