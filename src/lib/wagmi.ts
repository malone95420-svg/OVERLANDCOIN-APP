/**
 * Wagmi config — MetaMask + injected always; WalletConnect only when project id is set.
 * Deep-import connectors so unused optional wallets (Coinbase/baseAccount) are not pulled via the barrel.
 */
import { createConfig, fallback, http, injected } from "wagmi";
import { metaMask } from "wagmi/connectors/metaMask";
import { blockdag } from "./chain";
import { TOKEN } from "./token";

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

export const hasWalletConnect = Boolean(wcProjectId);

const rpcUrls = (
  blockdag.rpcUrls.default.http?.length
    ? [...blockdag.rpcUrls.default.http]
    : [TOKEN.rpcUrl, TOKEN.rpcFallback, TOKEN.rpcAlt]
).filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);

function buildConnectors() {
  const connectors = [
    metaMask(),
    injected({ shimDisconnect: true }),
  ];

  if (!hasWalletConnect) return connectors;

  try {
    // Lazy require keeps WalletConnect out of the critical path when unset;
    // try/catch avoids a hard crash if the optional package is unavailable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { walletConnect } = require("wagmi/connectors/walletConnect") as {
      walletConnect: (params: {
        projectId: string;
        showQrModal?: boolean;
        metadata?: {
          name: string;
          description: string;
          url: string;
          icons: string[];
        };
      }) => (typeof connectors)[number];
    };

    connectors.push(
      walletConnect({
        projectId: wcProjectId,
        showQrModal: true,
        metadata: {
          name: "OVERLANDCOIN",
          description: "Adventure Powered. Location Rewarded.",
          url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://overlandcoin.com",
          icons: ["/logo.png"],
        },
      }) as (typeof connectors)[number]
    );
  } catch {
    // WalletConnect optional — injected / MetaMask still work
  }

  return connectors;
}

export const wagmiConfig = createConfig({
  chains: [blockdag],
  connectors: buildConnectors(),
  transports: {
    [blockdag.id]: fallback(rpcUrls.map((url) => http(url, { batch: true }))),
  },
  ssr: true,
});
