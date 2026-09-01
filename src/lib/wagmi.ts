/**
 * Wagmi config — injected-only (MetaMask works as injected).
 * Avoid metaMask() SDK and WalletConnect side effects that crash iOS Safari.
 */
import { createConfig, fallback, http, injected } from "wagmi";
import { blockdag } from "./chain";
import { TOKEN } from "./token";

const rpcUrls = (
  blockdag.rpcUrls.default.http?.length
    ? [...blockdag.rpcUrls.default.http]
    : [TOKEN.rpcUrl, TOKEN.rpcFallback, TOKEN.rpcAlt]
).filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);

export const wagmiConfig = createConfig({
  chains: [blockdag],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [blockdag.id]: fallback(rpcUrls.map((url) => http(url, { batch: true }))),
  },
  ssr: true,
});
