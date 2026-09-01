/**
 * Wagmi config — injected-only (MetaMask works as injected).
 * Avoid metaMask() SDK and WalletConnect side effects that crash iOS Safari.
 * Transports use known-good read RPCs (east + west + engineering; never bdagscan).
 * Wallet broadcasts use MetaMask's own RPC — set via wallet_addEthereumChain
 * to send-capable west + east only (see blockdagWalletRpcUrls).
 */
import { createConfig, fallback, http, injected } from "wagmi";
import { blockdagHttpRpcUrls } from "./blockdagRpc";
import { blockdag } from "./chain";

const rpcUrls = blockdagHttpRpcUrls();

export const wagmiConfig = createConfig({
  chains: [blockdag],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [blockdag.id]: fallback(rpcUrls.map((url) => http(url, { batch: true }))),
  },
  ssr: true,
});
