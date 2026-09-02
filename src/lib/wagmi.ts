/**
 * Wagmi config — multi-injected wallets for BlockDAG 1404 (OKX, Trust, Rabby,
 * Coinbase, Bitget, generic Browser/MetaMask). Avoid metaMask() SDK (iOS Safari crash).
 * Optional WalletConnect only when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set
 * (deep-import walletConnect — never barrel @wagmi/connectors, which pulls broken Coinbase SDK).
 *
 * Transports: known-good read RPCs (east + west + engineering; never bdagscan).
 * Wallet broadcasts use the wallet's own RPC via wallet_addEthereumChain
 * (send-capable west + east only — see blockdagWalletRpcUrls).
 */
import { createConfig, fallback, http, injected } from "wagmi";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { blockdagHttpRpcUrls } from "./blockdagRpc";
import { blockdag } from "./chain";
import { INJECTED_WALLET_DEFS } from "./injectedWallets";

const rpcUrls = blockdagHttpRpcUrls();

const namedInjected = INJECTED_WALLET_DEFS.filter((d) => d.id !== "injected").map((def) =>
  injected({
    target: {
      id: def.id,
      name: def.name,
      provider: (w) => (w ? def.provider(w as Window) : undefined) as never,
    },
    shimDisconnect: true,
  }),
);

const browserInjected = injected({ shimDisconnect: true });

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const connectors = [
  ...namedInjected,
  browserInjected,
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "OVERLANDCOIN",
            description: "OVERLANDCOIN on BlockDAG — Move. Explore. Earn.",
            url: "https://overlandcoin.com",
            icons: ["https://overlandcoin.com/logo.png"],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [blockdag],
  connectors,
  transports: {
    [blockdag.id]: fallback(rpcUrls.map((url) => http(url, { batch: true }))),
  },
  ssr: true,
});

export const walletConnectEnabled = Boolean(wcProjectId);
