/**
 * OVERLANDCOIN on-chain token config — source of truth.
 * Contract exists ONLY on BlockDAG Mainnet (chainId 1404).
 * Not deployed on Base/Ethereum (those addresses are empty EOAs).
 *
 * RPC note:
 * - Do NOT use https://rpc.bdagscan.com/ — divergent/stale tip (never for clients/receipts).
 * - https://rpc.east.bdag-us.org/ — send-capable; prefer first for MetaMask / wallet_addEthereumChain.
 * - https://rpc.west.bdag-us.org/ — send-capable fallback (west can be 502-flaky).
 * - https://rpc.blockdag.engineering/ — read-only / no-send (good tip for receipts; NO eth_sendRawTransaction).
 * Explorer https://bdagscan.com is still OK.
 */
/** Reject empty/wrong-state RPC (never recommend for wallets or broadcasts). */
function envSendRpc(raw: string | undefined, fallback: string): string {
  const u = raw?.trim();
  if (!u) return fallback;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (host === "rpc.bdagscan.com") return fallback;
    if (host === "rpc.blockdag.engineering") return fallback;
  } catch {
    return fallback;
  }
  return u;
}

export const TOKEN = {
  name: "OVERLANDCOIN",
  symbol: "OLC",
  decimals: 18,
  /** On-chain total supply: 9,000,000,000 OLC */
  totalSupply: BigInt("9000000000"),
  totalSupplyFormatted: "9,000,000,000",
  contractAddress: "0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27" as const,
  chainId: 1404,
  chainName: "BlockDAG Mainnet",
  nativeCurrency: { name: "BDAG", symbol: "BDAG", decimals: 18 },
  /** Primary send-capable RPC (prefer east — west often 502) */
  rpcUrl: envSendRpc(process.env.NEXT_PUBLIC_BLOCKDAG_RPC, "https://rpc.east.bdag-us.org/"),
  /**
   * Fallback send-capable RPC (west).
   * Engineering remains available via rpcAlt / blockdagHttpRpcUrls for reads only.
   * Never put engineering or bdagscan in wallet_addEthereumChain rpcUrls.
   */
  rpcFallback: envSendRpc(
    process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK,
    "https://rpc.west.bdag-us.org/",
  ),
  /** Additional read-only RPC (no eth_sendRawTransaction) */
  rpcAlt: "https://rpc.blockdag.engineering/",
  explorers: {
    primary: "https://explorer.blockdag.engineering",
    /** Explorer UI only — not an HTTP JSON-RPC endpoint */
    secondary: "https://bdagscan.com",
  },
} as const;

export function explorerAddressUrl(address: string = TOKEN.contractAddress) {
  return `${TOKEN.explorers.primary}/address/${address}`;
}

export function explorerTxUrl(txHash: string) {
  return `${TOKEN.explorers.primary}/tx/${txHash}`;
}

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
] as const;
