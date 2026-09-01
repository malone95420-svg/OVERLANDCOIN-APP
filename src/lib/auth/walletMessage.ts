/**
 * SIWE-lite message for wallet login (no full EIP-4361 dependency).
 */

export const WALLET_SIGN_IN_DOMAIN = "OVERLANDCOIN";

export function buildWalletSignInMessage(params: {
  address: string;
  nonce: string;
  issuedAt?: string;
}): string {
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  return [
    `Sign in to ${WALLET_SIGN_IN_DOMAIN}`,
    "",
    `Address: ${params.address}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function parseWalletSignInMessage(message: string): {
  address: string;
  nonce: string;
  issuedAt: string;
} | null {
  const lines = message.split(/\r?\n/);
  if (lines[0] !== `Sign in to ${WALLET_SIGN_IN_DOMAIN}`) return null;
  const addr = lines.find((l) => l.startsWith("Address: "))?.slice("Address: ".length)?.trim();
  const nonce = lines.find((l) => l.startsWith("Nonce: "))?.slice("Nonce: ".length)?.trim();
  const issuedAt = lines.find((l) => l.startsWith("Issued At: "))?.slice("Issued At: ".length)?.trim();
  if (!addr || !nonce || !issuedAt) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return { address: addr, nonce, issuedAt };
}

/** Reject messages older than 10 minutes. */
export function isWalletMessageFresh(issuedAt: string, maxAgeMs = 10 * 60 * 1000): boolean {
  const t = Date.parse(issuedAt);
  if (!Number.isFinite(t)) return false;
  const age = Date.now() - t;
  return age >= -60_000 && age <= maxAgeMs;
}

export function randomNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
