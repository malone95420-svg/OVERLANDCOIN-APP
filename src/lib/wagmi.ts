/**
 * Wagmi config — multi-injected wallets for BlockDAG 1404 (OKX, Trust, Rabby,
 * Coinbase, Bitget, generic Browser/MetaMask). Avoid metaMask() SDK (iOS Safari crash).
 * WalletConnect when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set (deep-import
 * walletConnect — never barrel @wagmi/connectors, which pulls broken Coinbase SDK).
 *
 * Transports: known-good read RPCs (east + west + engineering; never bdagscan).
 * Wallet broadcasts use the wallet's own RPC via wallet_addEthereumChain
 * (send-capable east only — see blockdagWalletRpcUrls).
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

/** Public Reown/WalletConnect Cloud project id (safe in client bundle). */
const WC_PROJECT_ID_FALLBACK = "eed8183bc65e42f185adef0150ca73a8";

const wcProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || WC_PROJECT_ID_FALLBACK;

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://www.overlandcoin.tech";

const wcConnector = walletConnect({
  projectId: wcProjectId,
  showQrModal: true,
  metadata: {
    name: "OVERLANDCOIN",
    description: "OVERLANDCOIN on BlockDAG — Move. Explore. Earn.",
    url: siteUrl,
    icons: [`${siteUrl}/logo.png`],
  },
  qrModalOptions: {
    themeMode: "dark",
    // Encourage wallet apps to deep-link back to the dapp on mobile.
    enableExplorer: true,
  },
});

/**
 * Injected first so MetaMask/OKX/Trust in-app browsers connect without a WC detour.
 * WalletConnect still available for Safari / Telegram / desktop QR.
 */
const connectors = [...namedInjected, browserInjected, wcConnector];

export const wagmiConfig = createConfig({
  chains: [blockdag],
  connectors,
  transports: {
    [blockdag.id]: fallback(rpcUrls.map((url) => http(url, { batch: true }))),
  },
  ssr: true,
  // Named connectors already cover OKX / Trust / Rabby / etc. EIP-6963 discovery
  // duplicates them and often binds "OKX" to window.ethereum (MetaMask), which
  // makes OKX ask the user to disconnect the other wallet.
  multiInjectedProviderDiscovery: false,
});

export const walletConnectEnabled = Boolean(wcProjectId);
export const walletConnectProjectId = wcProjectId;
