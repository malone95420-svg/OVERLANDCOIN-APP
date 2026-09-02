import { blockdagAddChainParams } from "@/lib/chain";
import { getAnyInjectedProvider, getEthereumPaymentProvider } from "@/lib/injectedWallets";
import { TOKEN } from "@/lib/token";
import { formatWalletError, walletErrorCode } from "./walletErrors";

const ETHEREUM_MAINNET_HEX = "0x1";
const BLOCKDAG_HEX = `0x${TOKEN.chainId.toString(16)}`;

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function resolveProvider(
  provider?: Eip1193 | null,
): Eip1193 | undefined {
  return (
    provider ??
    (getEthereumPaymentProvider() as Eip1193 | undefined) ??
    (getAnyInjectedProvider() as Eip1193 | undefined)
  );
}

/** Switch/add BlockDAG 1404 using send-capable RPCs only (west/east). */
export async function ensureBlockdagNetwork(
  provider?: Eip1193 | null,
): Promise<void> {
  const eth = resolveProvider(provider);
  if (!eth?.request) {
    throw new Error("No injected wallet found (MetaMask / OKX / Trust / etc.).");
  }
  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (current?.toLowerCase() === BLOCKDAG_HEX.toLowerCase()) return;
  } catch {
    /* proceed to switch */
  }
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BLOCKDAG_HEX }],
    });
    return;
  } catch (switchErr) {
    const code = walletErrorCode(switchErr);
    if (code === 4001) {
      throw new Error("Switch to BlockDAG Mainnet was rejected in wallet.");
    }
    if (
      code === 4902 ||
      /unrecognized chain|chain .*not.*added/i.test(formatWalletError(switchErr, ""))
    ) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [blockdagAddChainParams()],
        });
        return;
      } catch (addErr) {
        if (walletErrorCode(addErr) === 4001) {
          throw new Error("Add BlockDAG Mainnet was rejected in wallet.");
        }
        throw new Error(
          formatWalletError(
            addErr,
            `Could not add BlockDAG Mainnet (chainId ${TOKEN.chainId}). Switch manually, then retry.`,
          ),
        );
      }
    }
    // Try add anyway (some wallets don't return 4902)
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [blockdagAddChainParams()],
      });
      return;
    } catch {
      /* fall through */
    }
    throw new Error(
      formatWalletError(
        switchErr,
        `Could not switch wallet to BlockDAG Mainnet (chainId ${TOKEN.chainId}). Switch manually, then retry.`,
      ),
    );
  }
}

export async function ensureEthereumMainnet(
  provider?: Eip1193 | null,
): Promise<void> {
  const eth = resolveProvider(provider);
  if (!eth?.request) {
    throw new Error("No injected wallet found (MetaMask / OKX / Trust / etc.).");
  }
  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (current?.toLowerCase() === ETHEREUM_MAINNET_HEX) return;
  } catch {
    /* proceed to switch */
  }
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ETHEREUM_MAINNET_HEX }],
    });
  } catch (switchErr) {
    const code = walletErrorCode(switchErr);
    if (code === 4001) {
      throw new Error("Switch to Ethereum mainnet was rejected in wallet.");
    }
    if (
      code === 4902 ||
      /unrecognized chain|chain .*not.*added/i.test(formatWalletError(switchErr, ""))
    ) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ETHEREUM_MAINNET_HEX,
              chainName: "Ethereum Mainnet",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://ethereum.publicnode.com"],
              blockExplorerUrls: ["https://etherscan.io"],
            },
          ],
        });
        return;
      } catch (addErr) {
        if (walletErrorCode(addErr) === 4001) {
          throw new Error("Add Ethereum mainnet was rejected in wallet.");
        }
        throw new Error(
          formatWalletError(
            addErr,
            "Could not add Ethereum mainnet. Switch to Ethereum (chainId 1) manually, then retry.",
          ),
        );
      }
    }
    throw new Error(
      formatWalletError(
        switchErr,
        "Could not switch wallet to Ethereum mainnet (chainId 1). Switch manually, then retry.",
      ),
    );
  }
}

export function noInjectedProviderMessage(payAsset: string, payAmount: number): string {
  const amt = Number.isFinite(payAmount) ? payAmount.toFixed(6).replace(/\.?0+$/, "") : "";
  const amountBit = amt ? ` ${amt}` : "";
  return `No Ethereum wallet detected in this browser. Open this page in MetaMask / OKX / Trust in-app browser, or copy the address and send${amountBit} ${payAsset} on Ethereum manually.`;
}

export { ETHEREUM_MAINNET_HEX };
