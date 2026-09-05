/**
 * Ops: PresaleLock.rescueUnallocated(deliverWallet, amountWei)
 * Usage:
 *   RESCUE_AMOUNT_OLC=1000000 node scripts/rescue-presale-lock-to-deliver.mjs
 * Requires PRESALE_LOCK_OWNER_PRIVATE_KEY (or OWNER_PRIVATE_KEY) — owner of lock.
 * Never commit keys. Dry-run without key prints plan only.
 */
import fs from "fs";
import path from "path";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const LOCK = "0x6BAa605f29dD215FCeC215dC4be8818B3350EF37";
const OLC = "0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27";
const CHAIN_ID = 1404;
// Prefer west for sends (correct state). Never rpc.bdagscan.com (empty state).
const RPC_CANDIDATES = [
  process.env.PRESALE_RPC_URL?.trim(),
  process.env.REWARD_RPC_URL?.trim(),
  "https://rpc.east.bdag-us.org/",
  "https://rpc.west.bdag-us.org/",
].filter((u) => u && !/bdagscan\.com/i.test(u));
const RPC = RPC_CANDIDATES[0] || "https://rpc.east.bdag-us.org/";

const ABI = [
  {
    type: "function",
    name: "rescueUnallocated",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "totalLocked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

function loadKey() {
  const env =
    process.env.PRESALE_LOCK_OWNER_PRIVATE_KEY?.trim() ||
    process.env.OWNER_PRIVATE_KEY?.trim() ||
    process.env.PRESALE_DELIVER_PRIVATE_KEY?.trim();
  if (env) return env.startsWith("0x") ? env : `0x${env}`;
  const candidates = [
    path.join(
      process.env.HOME || "/home/box",
      "sand-data/agents",
    ),
  ];
  // Prefer explicit env — do not auto-load secrets unless PRESALE_RESCUE_USE_SECRETS=1
  if (process.env.PRESALE_RESCUE_USE_SECRETS === "1") {
    try {
      const agents = fs.readdirSync(candidates[0]);
      for (const a of agents) {
        const p = path.join(candidates[0], a, "secrets/presale-deliver-wallet.json");
        if (fs.existsSync(p)) {
          const j = JSON.parse(fs.readFileSync(p, "utf8"));
          const k = j.privateKey || j.private_key;
          if (k) return k.startsWith("0x") ? k : `0x${k}`;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const amountOlC = Number(process.env.RESCUE_AMOUNT_OLC || "1000000");
const chain = {
  id: CHAIN_ID,
  name: "BlockDAG",
  nativeCurrency: { name: "BDAG", symbol: "BDAG", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const pc = createPublicClient({ chain, transport: http(RPC) });

const [lockBal, totalLocked, owner, operator] = await Promise.all([
  pc.readContract({ address: OLC, abi: ABI, functionName: "balanceOf", args: [LOCK] }),
  pc.readContract({ address: LOCK, abi: ABI, functionName: "totalLocked" }),
  pc.readContract({ address: LOCK, abi: ABI, functionName: "owner" }),
  pc.readContract({ address: LOCK, abi: ABI, functionName: "operator" }),
]);
const unallocated = lockBal - totalLocked;
const amountWei = parseUnits(String(amountOlC), 18);
const to = process.env.RESCUE_TO?.trim() || operator;

console.log(
  JSON.stringify(
    {
      lock: LOCK,
      olc: OLC,
      owner,
      operator,
      rescueTo: to,
      lockBalanceOlC: formatUnits(lockBal, 18),
      totalLockedOlC: formatUnits(totalLocked, 18),
      unallocatedOlC: formatUnits(unallocated, 18),
      requestedOlC: amountOlC,
      rpc: RPC,
    },
    null,
    2,
  ),
);

if (unallocated < amountWei) {
  console.error("Not enough unallocated OLC in PresaleLock for this rescue amount.");
  process.exit(1);
}

const key = loadKey();
if (!key) {
  console.log(
    "Dry-run only — set PRESALE_LOCK_OWNER_PRIVATE_KEY (owner) to send rescueUnallocated.",
  );
  process.exit(0);
}

const account = privateKeyToAccount(key);
if (account.address.toLowerCase() !== owner.toLowerCase()) {
  console.error(
    `Key address ${account.address} is not lock owner ${owner}. Aborting.`,
  );
  process.exit(1);
}

const wc = createWalletClient({ account, chain, transport: http(RPC) });
const hash = await wc.writeContract({
  address: LOCK,
  abi: ABI,
  functionName: "rescueUnallocated",
  args: [to, amountWei],
});
console.log("rescue tx:", hash);
