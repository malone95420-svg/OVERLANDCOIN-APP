/**
 * Deliver OLC ERC-20 to buyer after payment verification.
 * Primary path: PRESALE_DELIVER_PRIVATE_KEY hot-wallet transfer (same idea as quest claims).
 * Call only with server-computed olcAmount from verifyPaymentAndQuote.
 *
 * Inventory: fund the deliver wallet with OLC (ops may rescueUnallocated from PresaleLock).
 * Do not auto-rescue here — fail clearly when the hot wallet is empty.
 */

import {
  createPublicClient,
  createWalletClient,
  fallback,
  formatUnits,
  getAddress,
  http,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blockdag } from "@/lib/chain";
import {
  ERC20_ABI_MIN,
  DEPLOYED_PRESALE_LOCK_ADDRESS,
  getPresaleLockAddress,
  presaleDeliverRpcUrls,
  presaleReadRpcUrls,
} from "@/lib/presaleLock";
import {
  getDeliveredByPayment,
  setDeliveredByPayment,
  type OlcQuote,
  type VerifiedPayment,
} from "@/lib/verifyPayment";
import { appendPublicRecentBuy } from "@/lib/recentBuys";
import { TOKEN } from "@/lib/token";

function normalizePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  const with0x = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(with0x)) {
    throw new Error("PRESALE_DELIVER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return with0x as Hex;
}

export type CreditSuccess = {
  /** "delivered" = OLC transferred to buyer wallet. "locked" kept for legacy idempotent rows. */
  status: "delivered" | "locked";
  creditTxHash: string;
  buyer: `0x${string}`;
  olcAmount: number;
  mode?: "wallet_transfer" | "credit" | "transfer_then_credit";
  alreadyDelivered?: boolean;
  payment: VerifiedPayment;
  quote: OlcQuote;
  lockAddress: `0x${string}`;
  deliverWallet?: `0x${string}`;
};

export type CreditPending = {
  status: "locked_pending_chain";
  notConfigured?: boolean;
  error?: string;
  message?: string;
  buyer: `0x${string}`;
  olcAmount: number;
  payment: VerifiedPayment;
  quote: OlcQuote;
  transferTxHash?: string;
  deliverWallet?: `0x${string}`;
  inventoryOlC?: string;
  httpStatus: number;
};

export type CreditResult = CreditSuccess | CreditPending;

function amountToWei(olcAmount: number): bigint {
  return parseUnits(
    Number(olcAmount).toFixed(8).replace(/\.?0+$/, "") || "0",
    TOKEN.decimals,
  );
}

/**
 * Transfer verified OLC to buyer's BlockDAG wallet (ERC-20).
 * Idempotent by payment.paymentTxHash.
 */
export async function creditVerifiedPurchase(opts: {
  buyer: string;
  payment: VerifiedPayment;
  quote: OlcQuote;
}): Promise<CreditResult> {
  const buyer = getAddress(opts.buyer);
  const { payment, quote } = opts;
  const olcAmount = quote.olcAmount;
  const paymentKey = payment.paymentTxHash;
  const lockAddress =
    getPresaleLockAddress() ?? (DEPLOYED_PRESALE_LOCK_ADDRESS as `0x${string}`);

  const existing = getDeliveredByPayment(paymentKey);
  if (existing) {
    return {
      status: "delivered",
      creditTxHash: existing.creditTxHash,
      buyer: getAddress(existing.buyer),
      olcAmount: existing.olcAmount,
      alreadyDelivered: true,
      mode: "wallet_transfer",
      payment,
      quote: { ...quote, olcAmount: existing.olcAmount },
      lockAddress,
    };
  }

  const pkRaw =
    process.env.PRESALE_DELIVER_PRIVATE_KEY?.trim() ||
    process.env.REWARD_PRIVATE_KEY?.trim();

  if (!pkRaw) {
    return {
      status: "locked_pending_chain",
      notConfigured: true,
      message:
        "Presale deliver key not configured. Set PRESALE_DELIVER_PRIVATE_KEY (or REWARD_PRIVATE_KEY). Payment was verified — OLC transfer to wallet is pending server config.",
      buyer,
      olcAmount,
      payment,
      quote,
      httpStatus: 503,
    };
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePrivateKey(pkRaw));
  } catch (e) {
    return {
      status: "locked_pending_chain",
      notConfigured: true,
      error: "Invalid PRESALE_DELIVER_PRIVATE_KEY / REWARD_PRIVATE_KEY",
      message: e instanceof Error ? e.message : "Bad private key",
      buyer,
      olcAmount,
      payment,
      quote,
      httpStatus: 503,
    };
  }

  const amountWei = amountToWei(olcAmount);
  if (amountWei <= 0n) {
    return {
      status: "locked_pending_chain",
      error: "olcAmount too small after decimal conversion",
      buyer,
      olcAmount,
      payment,
      quote,
      httpStatus: 400,
    };
  }

  const readUrls = presaleReadRpcUrls();
  const sendUrls = presaleDeliverRpcUrls();
  let lastErr: unknown;
  let creditTxHash: Hex | undefined;

  const pc = createPublicClient({
    chain: blockdag,
    transport: fallback(readUrls.map((url) => http(url))),
  });

  // Inventory check once (clear ops signal when empty — do not silent-fail).
  let walletBal = 0n;
  try {
    walletBal = await pc.readContract({
      address: TOKEN.contractAddress,
      abi: ERC20_ABI_MIN,
      functionName: "balanceOf",
      args: [account.address],
    });
  } catch (e) {
    lastErr = e;
  }

  if (walletBal < amountWei) {
    const have = formatUnits(walletBal, TOKEN.decimals);
    return {
      status: "locked_pending_chain",
      error: "Insufficient OLC inventory in deliver wallet",
      message: `Deliver wallet ${account.address} has ${have} OLC; need ${olcAmount} OLC. Fund it with OLC (ops: PresaleLock.rescueUnallocated → deliver wallet), then Retry deliver. Payment was verified.`,
      buyer,
      olcAmount,
      payment,
      quote,
      deliverWallet: account.address,
      inventoryOlC: have,
      httpStatus: 503,
    };
  }

  for (const sendUrl of sendUrls) {
    try {
      const wc = createWalletClient({
        account,
        chain: blockdag,
        transport: http(sendUrl),
      });

      // Re-check on each send RPC in case tip differs
      const bal = await pc.readContract({
        address: TOKEN.contractAddress,
        abi: ERC20_ABI_MIN,
        functionName: "balanceOf",
        args: [account.address],
      });
      if (bal < amountWei) {
        const have = formatUnits(bal, TOKEN.decimals);
        return {
          status: "locked_pending_chain",
          error: "Insufficient OLC inventory in deliver wallet",
          message: `Deliver wallet ${account.address} has ${have} OLC; need ${olcAmount} OLC. Fund it (ops rescue from PresaleLock ${lockAddress}), then Retry deliver. Payment was verified.`,
          buyer,
          olcAmount,
          payment,
          quote,
          deliverWallet: account.address,
          inventoryOlC: have,
          httpStatus: 503,
        };
      }

      creditTxHash = await wc.writeContract({
        address: TOKEN.contractAddress,
        abi: ERC20_ABI_MIN,
        functionName: "transfer",
        args: [buyer, amountWei],
      });

      try {
        await pc.waitForTransactionReceipt({ hash: creditTxHash, timeout: 45_000 });
      } catch {
        /* hash still valid for explorer */
      }
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      creditTxHash = undefined;
    }
  }

  if (!creditTxHash) {
    const msg = lastErr instanceof Error ? lastErr.message : "Transfer failed";
    return {
      status: "locked_pending_chain",
      error: `OLC wallet delivery failed: ${msg}`,
      message: `Payment verified but OLC transfer to ${buyer} failed. Tap Retry deliver. ${msg}`,
      buyer,
      olcAmount,
      payment,
      quote,
      deliverWallet: account.address,
      httpStatus: 502,
    };
  }

  setDeliveredByPayment(paymentKey, {
    creditTxHash,
    buyer,
    olcAmount,
    payAsset: payment.payAsset,
  });

  // Public recent-buys feed (best-effort; never block delivery)
  void appendPublicRecentBuy({
    buyer,
    olcAmount,
    payAsset: payment.payAsset,
    paymentTxHash: payment.paymentTxHash,
    deliveryTxHash: creditTxHash,
  });

  return {
    status: "delivered",
    creditTxHash,
    buyer,
    olcAmount,
    mode: "wallet_transfer",
    payment,
    quote,
    lockAddress,
    deliverWallet: account.address,
  };
}
