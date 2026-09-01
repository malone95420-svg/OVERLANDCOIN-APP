#!/usr/bin/env node
/**
 * Deploy PresaleLock on BlockDAG Mainnet (chainId 1404).
 * Env: PRESALE_DEPLOYER_KEY, PRESALE_DELIVER_PRIVATE_KEY, PRESALE_RPC_URL, PRESALE_DELIVER_ADDRESS
 * Artifact: contracts/out/PresaleLock.json (compile with scripts/compile-presale-lock.mjs — paris EVM)
 * Secrets fallback via OVERLANDCOIN_SECRETS_DIR
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  isAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OLC = '0x4DF1041EA978fcFF8997f9BFd5302E65100d7f27';
const RPC = process.env.PRESALE_RPC_URL || 'https://rpc.west.bdag-us.org/';
const CHAIN_ID = 1404;
const blockdag = {
  id: CHAIN_ID,
  name: 'BlockDAG Mainnet',
  nativeCurrency: { name: 'BDAG', symbol: 'BDAG', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const SECRETS_DIR =
  process.env.OVERLANDCOIN_SECRETS_DIR ||
  '/home/box/agent-data/agents/ae1214f9-2ba5-4622-9895-085008aceab1/secrets';
function loadKey() {
  const raw = process.env.PRESALE_DEPLOYER_KEY || process.env.PRESALE_DELIVER_PRIVATE_KEY;
  if (raw && /^0x[0-9a-fA-F]{64}$/.test(raw.trim())) return raw.trim();
  const deliverPath = join(SECRETS_DIR, 'presale-deliver-wallet.json');
  if (existsSync(deliverPath)) {
    const j = JSON.parse(readFileSync(deliverPath, 'utf8'));
    if (j.privateKey && /^0x[0-9a-fA-F]{64}$/.test(j.privateKey)) return j.privateKey;
  }
  throw new Error(
    'Missing deployer key. Set PRESALE_DEPLOYER_KEY or PRESALE_DELIVER_PRIVATE_KEY, or ensure deliver wallet JSON exists under secrets.'
  );
}

function loadDeliverAddress(deployerAddress) {
  if (process.env.PRESALE_DELIVER_ADDRESS && isAddress(process.env.PRESALE_DELIVER_ADDRESS)) {
    return getAddress(process.env.PRESALE_DELIVER_ADDRESS);
  }
  const deliverKey = process.env.PRESALE_DELIVER_PRIVATE_KEY;
  if (deliverKey && /^0x[0-9a-fA-F]{64}$/.test(deliverKey.trim())) {
    return privateKeyToAccount(deliverKey.trim()).address;
  }
  const deliverPath = join(SECRETS_DIR, 'presale-deliver-wallet.json');
  if (existsSync(deliverPath)) {
    const j = JSON.parse(readFileSync(deliverPath, 'utf8'));
    if (j.address && isAddress(j.address)) return getAddress(j.address);
  }
  return deployerAddress;
}

function loadArtifact() {
  const path = join(root, 'contracts/out/PresaleLock.json');
  if (!existsSync(path)) {
    throw new Error('Missing ' + path + '. Compile contracts/PresaleLock.sol first.');
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function main() {
  const secret = loadKey();
  const account = privateKeyToAccount(secret);
  const artifact = loadArtifact();
  const operator = loadDeliverAddress(account.address);

  const publicClient = createPublicClient({ chain: blockdag, transport: http(RPC) });
  const walletClient = createWalletClient({
    account,
    chain: blockdag,
    transport: http(RPC),
  });

  const bal = await publicClient.getBalance({ address: account.address });
  console.log('RPC', RPC);
  console.log('chainId', await publicClient.getChainId());
  console.log('deployer', account.address);
  console.log('operator_target', operator);
  console.log('olc', OLC);
  console.log('deployer_bdag_wei', bal.toString());

  if (bal === 0n) {
    console.error('ABORT: deployer has 0 BDAG. Fund gas first (see ops/FUNDING.md), then re-run.');
    process.exit(2);
  }

  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [OLC],
  });

  // BlockDAG: use legacy gasPrice; artifact must be paris (no PUSH0). See compile-presale-lock.mjs
  const gasPrice = await publicClient.getGasPrice();
  console.log('Deploying PresaleLock…');
  let hash;
  try {
    hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [OLC],
      gas: 2_500_000n,
      gasPrice,
    });
  } catch (e) {
    // Fallback: raw legacy deploy if deployContract path fails on this RPC
    console.log('deployContract_fallback', e?.shortMessage || e?.message || String(e));
    hash = await walletClient.sendTransaction({
      data,
      gas: 2_500_000n,
      gasPrice,
    });
  }
  console.log('deploy_tx', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    console.error('Deploy failed', receipt.status);
    process.exit(1);
  }
  const lock = getAddress(receipt.contractAddress);
  console.log('PresaleLock', lock);
  console.log('gasUsed', receipt.gasUsed.toString());

  if (getAddress(operator) !== getAddress(account.address)) {
    console.log('Calling setOperator…');
    const opData = encodeFunctionData({
      abi: artifact.abi,
      functionName: 'setOperator',
      args: [operator],
    });
    const opHash = await walletClient.sendTransaction({
      to: lock,
      data: opData,
      gas: 100_000n,
      gasPrice,
    });
    console.log('setOperator_tx', opHash);
    const opReceipt = await publicClient.waitForTransactionReceipt({ hash: opHash });
    console.log('setOperator_status', opReceipt.status);
  } else {
    console.log('Operator already deployer; skip setOperator');
  }

  console.log('');
  console.log('Next:');
  console.log('  NEXT_PUBLIC_PRESALE_LOCK_ADDRESS=' + lock);
  console.log('  See ops/DEPLOYED.md / ops/VERCEL_ENV.md; deposit OLC via approve+deposit if needed.');
  console.log('  data_len_check', data.length);
}

main().catch((err) => {
  console.error('deploy_error', err?.shortMessage || err?.message || String(err));
  process.exit(1);
});
