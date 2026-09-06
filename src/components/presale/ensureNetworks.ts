import { blockdagAddChainParams, blockdagChainIdHex } from "@/lib/chain";
import { EAST_RPC, WEST_RPC } from "@/lib/blockdagRpc";
import { getAnyInjectedProvider, getEthereumPaymentProvider } from "@/lib/injectedWallets";
import { TOKEN } from "@/lib/token";
import { formatWalletError, walletErrorCode } from "./walletErrors";

const ETHEREUM_MAINNET_HEX = "0x1";
const BLOCKDAG_HEX = blockdagChainIdHex();

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function sameChainId(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const na = BigInt(a);
  const nb = BigInt(b);
  return na === nb;
}

export type EnsureBlockdagOptions = {
  /**
   * Always call wallet_addEthereumChain with send-capable RPCs (east → west),
   * even when already on chain 1404. Fixes wallets stuck on engineering/bdagscan
   * (read-ok, no eth_sendRawTransaction).
   */
  forceRpcRefresh?: boolean;
  /**
   * WalletConnect / remote sessions often cannot switch away from 1404 or update
   * rpcUrls. Skip the MetaMask-style "leave 1404 → re-add" dance and surface a
   * clear manual-RPC / deposit fallback instead of a doomed send.
   */
  isWalletConnect?: boolean;
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

async function addBlockdagWithSendRpcs(eth: Eip1193): Promise<void> {
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [blockdagAddChainParams()],
  });
}

/** Plain-English guidance when the wallet cannot update BlockDAG RPC. */
export function blockdagRpcManualFixMessage(isWalletConnect = false): string {
  const base = `Set BlockDAG Mainnet RPC to ${EAST_RPC} (fallback ${WEST_RPC}). Do not use rpc.bdagscan.com or rpc.blockdag.engineering for sends.`;
  if (isWalletConnect) {
    return `WalletConnect can’t update the RPC for you. In your wallet app → Networks → BlockDAG Mainnet → ${base} Or pay with ETH/USDT/USDC/SOL/BTC deposit instead.`;
  }
  return `Couldn’t update BlockDAG RPC automatically. In your wallet: Settings → Networks → BlockDAG Mainnet → ${base}`;
}

/** Switch/add BlockDAG 1404 using send-capable RPCs only (east → west). */
export async function ensureBlockdagNetwork(
  provider?: Eip1193 | null,
  opts?: EnsureBlockdagOptions,
): Promise<void> {
  const eth = resolveProvider(provider);
  if (!eth?.request) {
    throw new Error("No wallet provider found. Connect with WalletConnect or an in-app browser (MetaMask / OKX / Trust).");
  }

  const isWc = Boolean(opts?.isWalletConnect);

  if (opts?.forceRpcRefresh) {
    // MetaMask often IGNORES rpcUrls on wallet_addEthereumChain when chain 1404
    // already exists. Switch away (Ethereum) then re-add so send-capable east/west stick.
    // WalletConnect: skip switch-away — it often fails or bricks the session.
    if (!isWc) {
      try {
        const current = String(
          (await eth.request({ method: "eth_chainId" }).catch(() => "")) || "",
        ).toLowerCase();
        if (sameChainId(current, BLOCKDAG_HEX)) {
          try {
            await eth.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: ETHEREUM_MAINNET_HEX }],
            });
          } catch (switchAwayErr) {
            if (walletErrorCode(switchAwayErr) === 4001) {
              throw new Error("Update BlockDAG network was rejected in wallet.");
            }
            /* continue — some wallets cannot leave 1404 */
          }
        }
      } catch (e) {
        if (walletErrorCode(e) === 4001 || /rejected/i.test(formatWalletError(e, ""))) {
          throw e instanceof Error ? e : new Error("Update BlockDAG network was rejected in wallet.");
        }
      }
    }

    try {
      await addBlockdagWithSendRpcs(eth);
      // Ensure we're on 1404 after add (WC / after switch-away).
      try {
        const after = String(
          (await eth.request({ method: "eth_chainId" }).catch(() => "")) || "",
        ).toLowerCase();
        if (!sameChainId(after, BLOCKDAG_HEX)) {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BLOCKDAG_HEX }],
          });
        }
      } catch {
        /* add succeeded; switch may prompt separately */
      }
      return;
    } catch (addErr) {
      if (walletErrorCode(addErr) === 4001) {
        throw new Error("Update BlockDAG network was rejected in wallet.");
      }
      // Some wallets reject re-add when chain exists — try switch, then add once more.
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BLOCKDAG_HEX }],
        });
      } catch {
        /* continue to retry add */
      }
      try {
        await addBlockdagWithSendRpcs(eth);
        return;
      } catch (retryAdd) {
        if (walletErrorCode(retryAdd) === 4001) {
          throw new Error("Update BlockDAG network was rejected in wallet.");
        }
        if (isWc) {
          throw new Error(blockdagRpcManualFixMessage(true));
        }
        throw new Error(
          formatWalletError(
            retryAdd,
            blockdagRpcManualFixMessage(false),
          ),
        );
      }
    }
  }

  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (sameChainId(current, BLOCKDAG_HEX)) return;
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
        await addBlockdagWithSendRpcs(eth);
        return;
      } catch (addErr) {
        if (walletErrorCode(addErr) === 4001) {
          throw new Error("Add BlockDAG Mainnet was rejected in wallet.");
        }
        throw new Error(
          formatWalletError(
            addErr,
            `Could not add BlockDAG Mainnet (chainId ${TOKEN.chainId}). ${blockdagRpcManualFixMessage(isWc)}`,
          ),
        );
      }
    }
    // Try add anyway (some wallets don't return 4902)
    try {
      await addBlockdagWithSendRpcs(eth);
      return;
    } catch {
      /* fall through */
    }
    throw new Error(
      formatWalletError(
        switchErr,
        `Could not switch wallet to BlockDAG Mainnet (chainId ${TOKEN.chainId}). ${blockdagRpcManualFixMessage(isWc)}`,
      ),
    );
  }
}

export async function ensureEthereumMainnet(
  provider?: Eip1193 | null,
): Promise<void> {
  const eth = resolveProvider(provider);
  if (!eth?.request) {
    throw new Error("No Ethereum wallet found (MetaMask / OKX / Trust / WalletConnect).");
  }
  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (sameChainId(current, ETHEREUM_MAINNET_HEX)) return;
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

export { ETHEREUM_MAINNET_HEX, EAST_RPC, WEST_RPC };
