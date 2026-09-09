/**
 * Add OLC (ERC-20) to an injected wallet via EIP-747 wallet_watchAsset.
 * Ensures BlockDAG Mainnet (1404) when possible before prompting.
 */
import { blockdagAddChainParams } from "@/lib/chain";
import { getAnyInjectedProvider } from "@/lib/injectedWallets";
import { SITE } from "@/lib/site";
import { TOKEN } from "@/lib/token";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = getAnyInjectedProvider();
  return eth?.request ? (eth as EthereumProvider) : null;
}

function olcImageUrl(): string {
  const base = (SITE.url || "https://www.overlandcoin.tech").replace(/\/$/, "");
  return `${base}/logo.png`;
}

async function ensureBlockdag(eth: EthereumProvider): Promise<void> {
  const chainHex = `0x${TOKEN.chainId.toString(16).padStart(4, "0")}`;

  const onBlockdag = async (): Promise<boolean> => {
    try {
      const current = (await eth.request({ method: "eth_chainId" })) as string;
      return current?.toLowerCase() === chainHex.toLowerCase();
    } catch {
      return false;
    }
  };

  if (await onBlockdag()) return;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch (switchErr) {
    const code =
      switchErr && typeof switchErr === "object" && "code" in switchErr
        ? Number((switchErr as { code: unknown }).code)
        : undefined;
    if (code === 4001) {
      throw new Error("Switch to BlockDAG Mainnet (chain 1404) was rejected.");
    }
    // 4902 = chain not recognized by the wallet — add it, then try to switch.
    if (code === 4902) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [blockdagAddChainParams()],
        });
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainHex }],
        });
      } catch {
        // fall through to verification below
      }
    }
    // Any other error code (e.g. -32002 pending, -32603) — fall through to verification.
  }

  // Never proceed to watchAsset on the wrong network.
  if (!(await onBlockdag())) {
    throw new Error("Could not switch to BlockDAG Mainnet (chain 1404).");
  }
}

export type AddOlcResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Prompt the injected wallet to watch OLC on BlockDAG.
 * MetaMask often allows watchAsset even when not fully "connected" to the dapp.
 */
export async function addOlcToWallet(opts?: {
  /** Skip chain switch/add (default false). */
  skipChainEnsure?: boolean;
}): Promise<AddOlcResult> {
  const eth = getEthereum();
  if (!eth) {
    return {
      ok: false,
      error:
        "No injected wallet found. Install OKX, Trust, MetaMask, or open this site in a wallet browser to add OLC.",
    };
  }

  if (!opts?.skipChainEnsure) {
    try {
      await ensureBlockdag(eth);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not switch to BlockDAG Mainnet.",
      };
    }
  }

  try {
    const added = await eth.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: TOKEN.contractAddress,
          symbol: TOKEN.symbol,
          decimals: TOKEN.decimals,
          image: olcImageUrl(),
        },
      },
    });

    if (added === false) {
      return { ok: false, error: "Wallet declined adding OLC." };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not add OLC to wallet.";
    if (/4001|user rejected|denied/i.test(msg)) {
      return { ok: false, error: "Request rejected in wallet." };
    }
    return { ok: false, error: msg };
  }
}
