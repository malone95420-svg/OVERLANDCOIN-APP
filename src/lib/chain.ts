/**
 * BlockDAG Mainnet chain definition for wagmi/viem.
 * Matches TOKEN in src/lib/token.ts (chainId 1404).
 */
import { defineChain } from "viem";
import { blockdagHttpRpcUrls } from "./blockdagRpc";
import { TOKEN } from "./token";

const rpcUrls = blockdagHttpRpcUrls();

export const blockdag = defineChain({
  id: TOKEN.chainId,
  name: TOKEN.chainName,
  nativeCurrency: {
    name: TOKEN.nativeCurrency.name,
    symbol: TOKEN.nativeCurrency.symbol,
    decimals: TOKEN.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: [...rpcUrls] },
  },
  blockExplorers: {
    default: {
      name: "BlockDAG Explorer",
      url: TOKEN.explorers.primary,
    },
    bdagscan: {
      name: "BDAGScan",
      url: TOKEN.explorers.secondary,
    },
  },
});

/** EIP-3085 params for wallet_addEthereumChain — only known-good RPCs */
export function blockdagAddChainParams() {
  return {
    chainId: `0x${TOKEN.chainId.toString(16)}`,
    chainName: TOKEN.chainName,
    nativeCurrency: {
      name: TOKEN.nativeCurrency.name,
      symbol: TOKEN.nativeCurrency.symbol,
      decimals: TOKEN.nativeCurrency.decimals,
    },
    rpcUrls: [...rpcUrls],
    blockExplorerUrls: [TOKEN.explorers.primary, TOKEN.explorers.secondary],
  } as const;
}
