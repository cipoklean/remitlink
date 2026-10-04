import { createPublicClient, defineChain, http, parseAbi } from "viem";
import deployments from "../../deployments.json";

// Chain facts verified live against https://testnet-rpc.monad.xyz on 2026-10-04
// (eth_chainId returned 0x279f = 10143). Source: docs.monad.xyz/developer-essentials/testnet
export const CHAIN_ID = 10143;

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

// Addresses come from deployments.json — never hardcoded.
export const ESCROW_ADDRESS = deployments.contracts.ClaimEscrow
  .address as `0x${string}`;
export const STABLECOIN_ADDRESS = deployments.contracts.MockStablecoin
  .address as `0x${string}`;
export const STABLECOIN_DECIMALS = deployments.contracts.MockStablecoin
  .decimals;

// tUSD is a MOCK test token (6 decimals). See deployments.json and AGENT.md.
export const isMockToken = deployments.contracts.MockStablecoin.MOCK === true;

// NOTE: these must be parseAbi(...) — viem's encodeFunctionData reads `name` off
// each ABI item, so raw human-readable strings throw
// "Cannot use 'in' operator to search for 'name'".
export const escrowAbi = parseAbi([
  "function createClaim(address token, uint256 amount, bytes32 claimHash, uint256 expiry) returns (uint256)",
  "function commitRecipient(uint256 claimId, address recipient)",
  "function claim(uint256 claimId, uint256 secret, address recipient)",
  "function refund(uint256 claimId)",
  "function nextClaimId() view returns (uint256)",
  "function claims(uint256 claimId) view returns (address sender, address token, uint256 amount, bytes32 claimHash, uint256 expiry, address recipient, bool settled)",
  "event ClaimCreated(uint256 indexed claimId, address indexed sender, address indexed token, uint256 amount, bytes32 claimHash, uint256 expiry)",
  "event RecipientCommitted(uint256 indexed claimId, address indexed recipient)",
  "event ClaimClaimed(uint256 indexed claimId, address indexed recipient, uint256 amount)",
  "event ClaimRefunded(uint256 indexed claimId, address indexed sender, uint256 amount)",
]);

// Object-form event ABI so viem types decoded logs (eventName + args).
// Kept in sync with escrowAbi above.
export const escrowEventsAbi = [
  {
    type: "event",
    name: "ClaimCreated",
    inputs: [
      { indexed: true, name: "claimId", type: "uint256" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "claimHash", type: "bytes32" },
      { indexed: false, name: "expiry", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "RecipientCommitted",
    inputs: [
      { indexed: true, name: "claimId", type: "uint256" },
      { indexed: true, name: "recipient", type: "address" },
    ],
  },
  {
    type: "event",
    name: "ClaimClaimed",
    inputs: [
      { indexed: true, name: "claimId", type: "uint256" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ClaimRefunded",
    inputs: [
      { indexed: true, name: "claimId", type: "uint256" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export function explorerTx(hash: string): string {
  return `https://testnet.monadscan.com/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `https://testnet.monadscan.com/address/${address}`;
}