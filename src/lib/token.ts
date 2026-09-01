/**
 * OVERLANDCOIN on-chain token config — source of truth.
 * Contract exists ONLY on BlockDAG Mainnet (chainId 1404).
 * Not deployed on Base/Ethereum (those addresses are empty EOAs).
 *
 * RPC note:
 * - Do NOT use https://rpc.bdagscan.com/ — divergent/stale tip (never for clients/receipts).
 * - https://rpc.west.bdag-us.org/ — send-capable; use for MetaMask / wallet_addEthereumChain.
 * - https://rpc.blockdag.engineering/ — read-only / no-send (good tip for receipts; NO eth_sendRawTransaction).
 * Explorer https://bdagscan.com is still OK.
 */
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
  /** Primary send-capable RPC */
  rpcUrl: process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim() || "https://rpc.west.bdag-us.org/",
  /**
   * Read fallback (engineering has a good tip but cannot send txs).
   * Never put this in wallet_addEthereumChain rpcUrls.
   */
  rpcFallback:
    process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK?.trim() ||
    "https://rpc.blockdag.engineering/",
  /** Additional read RPC (same host as rpcFallback by default) */
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
