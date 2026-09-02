/**
 * Shared PresaleLock credit after payment verification.
 * Call only with server-computed olcAmount from verifyPaymentAndQuote.
 */

import {
  createPublicClient,
  createWalletClient,
  fallback,
  getAddress,
  http,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blockdag } from "@/lib/chain";
import {
  ERC20_ABI_MIN,
  PRESALE_LOCK_ABI,
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
  status: "locked";
  creditTxHash: string;
  buyer: `0x${string}`;
  olcAmount: number;
  mode?: "credit" | "transfer_then_credit";
  alreadyDelivered?: boolean;
  payment: VerifiedPayment;
  quote: OlcQuote;
  lockAddress: `0x${string}`;
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
  httpStatus: number;
};

export type CreditResult = CreditSuccess | CreditPending;

/**
 * Credit verified OLC into PresaleLock for buyer.
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

  const existing = getDeliveredByPayment(paymentKey);
  if (existing) {
    return {
      status: "locked",
      creditTxHash: existing.creditTxHash,
      buyer: getAddress(existing.buyer),
      olcAmount: existing.olcAmount,
      alreadyDelivered: true,
      payment,
      quote: { ...quote, olcAmount: existing.olcAmount },
      lockAddress: getPresaleLockAddress() ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`),
    };
  }

  const lockAddress = getPresaleLockAddress();
  const pkRaw =
    process.env.PRESALE_DELIVER_PRIVATE_KEY?.trim() ||
    process.env.REWARD_PRIVATE_KEY?.trim();

  if (!lockAddress || !pkRaw) {
    return {
      status: "locked_pending_chain",
      notConfigured: true,
      message:
        "Presale lock contract or deliver key not configured. Set NEXT_PUBLIC_PRESALE_LOCK_ADDRESS and PRESALE_DELIVER_PRIVATE_KEY (or REWARD_PRIVATE_KEY as operator). Payment was verified — OLC credit pending on-chain config.",
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

  const amountWei = parseUnits(
    Number(olcAmount).toFixed(8).replace(/\.?0+$/, "") || "0",
    TOKEN.decimals,
  );
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
  let mode: "credit" | "transfer_then_credit" | undefined;

  const pc = createPublicClient({
    chain: blockdag,
    transport: fallback(readUrls.map((url) => http(url))),
  });

  for (const sendUrl of sendUrls) {
    try {
      const wc = createWalletClient({
        account,
        chain: blockdag,
        transport: http(sendUrl),
      });

      const [lockBal, totalLocked, operator] = await Promise.all([
        pc.readContract({
          address: TOKEN.contractAddress,
          abi: ERC20_ABI_MIN,
          functionName: "balanceOf",
          args: [lockAddress],
        }),
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "totalLocked",
        }),
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "operator",
        }),
      ]);

      const unallocated = lockBal - totalLocked;

      if (unallocated >= amountWei) {
        creditTxHash = await wc.writeContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "credit",
          args: [buyer, amountWei],
        });
        mode = "credit";
      } else {
        const walletBal = await pc.readContract({
          address: TOKEN.contractAddress,
          abi: ERC20_ABI_MIN,
          functionName: "balanceOf",
          args: [account.address],
        });
        if (walletBal < amountWei) {
          return {
            status: "locked_pending_chain",
            error: "Insufficient OLC inventory for lock delivery",
            message: `Fund PresaleLock (${lockAddress}) or deliver wallet ${account.address} with OLC. Need ${olcAmount} OLC unallocated. Payment verified.`,
            buyer,
            olcAmount,
            payment,
            quote,
            httpStatus: 503,
          };
        }

        const allowance = await pc.readContract({
          address: TOKEN.contractAddress,
          abi: ERC20_ABI_MIN,
          functionName: "allowance",
          args: [account.address, lockAddress],
        });
        if (allowance < amountWei) {
          const approveHash = await wc.writeContract({
            address: TOKEN.contractAddress,
            abi: ERC20_ABI_MIN,
            functionName: "approve",
            args: [lockAddress, amountWei],
          });
          try {
            await pc.waitForTransactionReceipt({ hash: approveHash, timeout: 45_000 });
          } catch {
            /* continue */
          }
        }

        const isOp =
          operator.toLowerCase() === account.address.toLowerCase() ||
          (
            await pc.readContract({
              address: lockAddress,
              abi: PRESALE_LOCK_ABI,
              functionName: "owner",
            })
          ).toLowerCase() === account.address.toLowerCase();

        if (isOp) {
          creditTxHash = await wc.writeContract({
            address: lockAddress,
            abi: PRESALE_LOCK_ABI,
            functionName: "creditFrom",
            args: [account.address, buyer, amountWei],
          });
          mode = "transfer_then_credit";
        } else {
          const transferHash = await wc.writeContract({
            address: TOKEN.contractAddress,
            abi: ERC20_ABI_MIN,
            functionName: "transfer",
            args: [lockAddress, amountWei],
          });
          try {
            await pc.waitForTransactionReceipt({ hash: transferHash, timeout: 45_000 });
          } catch {
            /* */
          }
          return {
            status: "locked_pending_chain",
            error: "Deliver key is not PresaleLock operator/owner",
            message: `Transferred OLC to lock (${transferHash}) but cannot credit. Call setOperator(${account.address}) or credit manually. Payment was verified.`,
            transferTxHash: transferHash,
            buyer,
            olcAmount,
            payment,
            quote,
            httpStatus: 503,
          };
        }
      }

      try {
        await pc.waitForTransactionReceipt({ hash: creditTxHash!, timeout: 45_000 });
      } catch {
        /* hash still valid */
      }
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      creditTxHash = undefined;
    }
  }

  if (!creditTxHash) {
    const msg = lastErr instanceof Error ? lastErr.message : "Credit failed";
    return {
      status: "locked_pending_chain",
      error: `PresaleLock credit failed: ${msg}`,
      buyer,
      olcAmount,
      payment,
      quote,
      httpStatus: 502,
    };
  }

  setDeliveredByPayment(paymentKey, {
    creditTxHash,
    buyer,
    olcAmount,
    payAsset: payment.payAsset,
  });

  return {
    status: "locked",
    creditTxHash,
    buyer,
    olcAmount,
    mode,
    payment,
    quote,
    lockAddress,
  };
}
