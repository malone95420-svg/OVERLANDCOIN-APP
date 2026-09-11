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

/** Wallet RPC for BlockDAG (0x57c) is circuit-breaking — not a user cancel. */
export function isFlakyBlockdagRpcError(e: unknown): boolean {
  const raw = formatWalletError(e, "");
  return /too many errors|different RPC endpoint|eth_getBlockByNumber|retrying in 0\.5|code 5000|0x57c Custom/i.test(
    raw,
  );
}

export function isUserRejection(e: unknown): boolean {
  if (isFlakyBlockdagRpcError(e)) return false;
  const code = walletErrorCode(e);
  if (code === 4001) return true;
  const msg = formatWalletError(e, "");
  return /user rejected|denied|rejected by user|canceled|cancelled/i.test(msg);
}


/** Map noisy wallet/RPC errors to a short plain-English line. */
export function plainEnglishWalletError(e: unknown, fallback = "Something went wrong with the wallet."): string {
  const raw = formatWalletError(e, "");
  if (!raw) return fallback;
  if (isUserRejection(e)) return "Canceled in wallet.";
  if (/insufficient funds|exceeds balance/i.test(raw)) return "Not enough balance for this payment plus gas.";
  if (/nonce|replacement transaction/i.test(raw)) return "Wallet has a stuck or conflicting transaction — clear it and retry.";
  if (/network changed|chain mismatch/i.test(raw)) return "Wallet switched networks mid-request. Switch back to the right chain and retry.";
  if (
    /too many errors|different RPC endpoint|eth_getBlockByNumber|retrying in 0\.5|0x57c Custom|code 5000/i.test(
      raw,
    )
  ) {
    return "BlockDAG RPC in your wallet is failing. Tap Switch / Fix BlockDAG, then pay again. RPC should be https://rpc.east.bdag-us.org/";
  }
  if (/sendRawTransaction|method not found|-32601/i.test(raw)) {
    return "Wallet RPC can’t send transactions. Set BlockDAG RPC to https://rpc.east.bdag-us.org/ and retry.";
  }
  if (/failed to fetch|network error|http request failed|timeout/i.test(raw)) {
    return "Network request failed. Check connection, switch RPC to https://rpc.east.bdag-us.org/, and retry.";
  }
  if (raw.length > 200) return `${raw.slice(0, 180).trim()}…`;
  return raw;
}
