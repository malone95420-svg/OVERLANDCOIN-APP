/**
 * Wagmi config — injected wallets always; WalletConnect only when project id is set.
 * Deep-import connectors so unused optional wallets are not pulled via the barrel.
 */
import { http, createConfig, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { blockdag } from "./chain";

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

export const hasWalletConnect = Boolean(wcProjectId);

export const wagmiConfig = createConfig({
  chains: [blockdag],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(hasWalletConnect
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata: {
              name: "OVERLANDCOIN",
              description: "Adventure Powered. Location Rewarded.",
              url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://overlandcoin.com",
              icons: ["/logo.png"],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [blockdag.id]: http(undefined, { batch: true }),
  },
  ssr: true,
});
