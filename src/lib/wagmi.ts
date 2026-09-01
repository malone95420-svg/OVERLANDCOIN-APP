/**
 * Wagmi config — injected-only (MetaMask works as injected).
 * Avoid metaMask() SDK and WalletConnect side effects that crash iOS Safari.
 * Transports use only known-good BlockDAG RPCs (never rpc.bdagscan.com).
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
