/**
 * BlockDAG Mainnet chain definition for wagmi/viem.
 * Matches TOKEN in src/lib/token.ts (chainId 1404).
 *
 * defineChain http list may include read-only RPCs (engineering) for publicClient.
 * wallet_addEthereumChain MUST use send-capable URLs only (east) — MetaMask
 * broadcasts via those rpcUrls; engineering returns method not found on send.
 */
import { defineChain } from "viem";
import { blockdagHttpRpcUrls, blockdagWalletRpcUrls } from "./blockdagRpc";
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

/**
 * EIP-3085 params for wallet_addEthereumChain.
 * Send-capable URLs only (east) — never west, engineering, or bdagscan.
 */
/** EIP-155 chainId hex with even digit length (MetaMask mobile is picky about 0x57c vs 0x057c). */
export function blockdagChainIdHex(): `0x${string}` {
  const h = TOKEN.chainId.toString(16);
  return `0x${h.length % 2 === 1 ? `0${h}` : h}` as `0x${string}`;
}

export function blockdagAddChainParams() {
  const walletRpcs = blockdagWalletRpcUrls();
  return {
    chainId: blockdagChainIdHex(),
    chainName: TOKEN.chainName,
    nativeCurrency: {
      name: TOKEN.nativeCurrency.name,
      symbol: TOKEN.nativeCurrency.symbol,
      decimals: TOKEN.nativeCurrency.decimals,
    },
    rpcUrls: [...walletRpcs],
    blockExplorerUrls: [TOKEN.explorers.primary, TOKEN.explorers.secondary],
  } as const;
}
