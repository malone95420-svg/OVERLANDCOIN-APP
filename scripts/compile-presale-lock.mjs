#!/usr/bin/env node
/**
 * Compile PresaleLock for BlockDAG (chainId 1404).
 * Must use evmVersion "paris" — BlockDAG rejects PUSH0 (Shanghai+).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import solc from 'solc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const source = readFileSync(join(root, 'contracts/PresaleLock.sol'), 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'PresaleLock.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
    },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.length) {
  for (const e of out.errors) console.error(e.severity, e.message);
  if (out.errors.some((e) => e.severity === 'error')) process.exit(1);
}
const c = out.contracts['PresaleLock.sol'].PresaleLock;
const bytecode = '0x' + c.evm.bytecode.object;
const deployedBytecode = '0x' + c.evm.deployedBytecode.object;
mkdirSync(join(root, 'contracts/out'), { recursive: true });
const artifact = {
  contractName: 'PresaleLock',
  sourceName: 'contracts/PresaleLock.sol',
  abi: c.abi,
  bytecode,
  deployedBytecode,
  constructorArgsNote: 'constructor(address olcToken)',
  evmVersion: 'paris',
  compiler: solc.version(),
};
writeFileSync(join(root, 'contracts/out/PresaleLock.json'), JSON.stringify(artifact, null, 2));
writeFileSync(join(root, 'contracts/out/PresaleLock.abi.json'), JSON.stringify(c.abi, null, 2));
writeFileSync(join(root, 'contracts/out/PresaleLock.bin'), c.evm.bytecode.object);
console.log('wrote contracts/out/PresaleLock.json');
console.log('compiler', solc.version(), 'evmVersion paris', 'bytecode_len', bytecode.length);
