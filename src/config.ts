import { createConfig, http as wagmiHttp } from 'wagmi'
import { coinbaseWallet, injected } from 'wagmi/connectors'
import { createPublicClient, fallback, http, parseAbi, parseAbiItem } from 'viem'
import { sepolia } from 'viem/chains'

export const SITE_NAME = 'Squeek Stream Kit'
export const SITE_DESCRIPTION = 'OBS overlay and stream control panel for the Squeekchain hamster wheel on Sepolia.'

/** Wallet actions are Sepolia only. */
export const chain = sepolia

/**
 * The Squeekchain install sepolia.squeekchain.com runs (release stream-game-sepolia-test-20261026-01,
 * deployed at block 11998937), as listed by api.squeekchain.com/v1/economy/state identities.
 * Checked on Sepolia on 2026-11-03: SQK answers name() "Squeek", symbol() "SQK", decimals() 18;
 * SqueekCore answers state() and configuration().
 */
export const CONTRACTS = {
  core: '0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44',
  sqk: '0x5501e1fa81be1c3f49225fa7668da0245d07db60',
} as const

export const API = 'https://api.squeekchain.com/v1'
export const PUBLIC_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
export const BACKUP_RPC_URL = 'https://sepolia.drpc.org'
export const EXPLORER = 'https://sepolia.etherscan.io'

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: fallback([
    http(PUBLIC_RPC_URL, { timeout: 12_000, retryCount: 1 }),
    http(BACKUP_RPC_URL, { timeout: 12_000, retryCount: 1 }),
  ]),
})

export const config = createConfig({
  chains: [chain],
  // EIP-6963 discovery lists every installed extension under its own name.
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [chain.id]: wagmiHttp(PUBLIC_RPC_URL) },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

export const coreAbi = parseAbi([
  'function state() view returns ((uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused) result)',
  // configuration() is a flat struct of 11 words; this kit uses word 1 (start of round zero, unix
  // seconds), word 2 (round length, seconds) and word 10 (block units per Squeek block).
  'function configuration() view returns (bytes32, uint256 roundZeroStart, uint256 roundSeconds, uint256, uint256, address, address, uint256, uint256, uint256, uint256 unitsPerBlock)',
])

export const sqkAbi = parseAbi([
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

/** A cheer is approve(self, 0): it emits Approval with owner == spender and value 0. */
export const approvalEvent = parseAbiItem('event Approval(address indexed owner, address indexed spender, uint256 value)')
