import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

export type SolanaInjectedProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: { toString(): string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction: (
    transaction: Transaction,
    opts?: { skipPreflight?: boolean },
  ) => Promise<{ signature: string } | string>;
};

/** Prefer Phantom's namespaced provider, then any injected window.solana. */
export function getInjectedSolanaProvider(): SolanaInjectedProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & {
    phantom?: { solana?: SolanaInjectedProvider };
    solana?: SolanaInjectedProvider;
  };
  const p = w.phantom?.solana ?? w.solana;
  if (!p || typeof p.connect !== "function" || typeof p.signAndSendTransaction !== "function") {
    return undefined;
  }
  return p;
}

function solanaRpcUrl(): string {
  const env =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SOLANA_RPC?.trim()) || "";
  return env || "https://api.mainnet-beta.solana.com";
}

/** Convert SOL amount to lamports (exact 9-decimal rounding). */
export function solToLamports(solAmount: number): number {
  const fixed = Number(Number(solAmount).toFixed(9));
  const lamports = Math.round(fixed * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error("Invalid SOL amount.");
  }
  return lamports;
}

/**
 * Connect → SystemProgram.transfer → signAndSendTransaction.
 * Returns the base58 transaction signature.
 */
export async function sendNativeSolTransfer(opts: {
  provider: SolanaInjectedProvider;
  toAddress: string;
  solAmount: number;
}): Promise<string> {
  const { provider, toAddress, solAmount } = opts;

  const connected = await provider.connect();
  const fromStr = (provider.publicKey ?? connected.publicKey)?.toString();
  if (!fromStr) throw new Error("Solana wallet did not return a public key.");

  const fromPubkey = new PublicKey(fromStr);
  const toPubkey = new PublicKey(toAddress);
  const lamports = solToLamports(solAmount);

  const connection = new Connection(solanaRpcUrl(), "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: fromPubkey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    }),
  );

  const result = await provider.signAndSendTransaction(transaction);
  const signature = typeof result === "string" ? result : result?.signature;
  if (!signature || typeof signature !== "string") {
    throw new Error("Wallet did not return a transaction signature.");
  }
  return signature;
}
