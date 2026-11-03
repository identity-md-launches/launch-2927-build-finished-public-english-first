import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API, CONTRACTS, approvalEvent, coreAbi, publicClient } from './config'
import { wheelState, type WheelState } from './logic'

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export type CoreConfig = { roundZeroStart: number; roundSeconds: number; unitsPerBlock: bigint }

/** SqueekCore's configuration changes only on a redeploy; read it once per session. */
export function useCoreConfig() {
  return useQuery({
    queryKey: ['core-config'],
    queryFn: async (): Promise<CoreConfig> => {
      const c = await publicClient.readContract({ address: CONTRACTS.core, abi: coreAbi, functionName: 'configuration' })
      const roundZeroStart = Number(c[1])
      const roundSeconds = Number(c[2])
      if (!(roundZeroStart > 0) || !(roundSeconds > 0) || c[10] <= 0n) throw new Error('SqueekCore configuration is not readable')
      return { roundZeroStart, roundSeconds, unitsPerBlock: c[10] }
    },
    staleTime: Infinity,
    retry: 3,
  })
}

/** SqueekCore.state(), read from Sepolia every 12 seconds (one Sepolia slot). */
export function useCoreState() {
  return useQuery({
    queryKey: ['core-state'],
    queryFn: async () => {
      const s = await publicClient.readContract({ address: CONTRACTS.core, abi: coreAbi, functionName: 'state' })
      return { ...s, readAt: Date.now() }
    },
    refetchInterval: 12_000,
    retry: 1,
  })
}

type StatusResponse = {
  generatedAt?: string
  measurement?: { coreStatus?: string; freshness?: string; observedAt?: string; staleAfterSeconds?: number; rpmMilli?: number | string }
}

export type Telemetry = { wheel: WheelState; rpm: number | null; observedAt: number | null }

/** Wheel telemetry from the Squeekchain API. Nothing is simulated: when it fails the wheel reads OFFLINE. */
export function useTelemetry(now: number) {
  const q = useQuery({
    queryKey: ['telemetry'],
    queryFn: async () => {
      const res = await fetch(`${API}/status`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`Telemetry API answered ${res.status}`)
      const body = (await res.json()) as StatusResponse
      if (!body.measurement || typeof body.measurement.coreStatus !== 'string') throw new Error('Telemetry API sent no measurement')
      return { ...body.measurement, fetchedAt: Date.now() }
    },
    refetchInterval: 5_000,
    retry: 1,
  })
  const m = q.data
  const observedAt = m?.observedAt ? Date.parse(m.observedAt) : m?.fetchedAt ?? null
  const wheel = q.isError && m && now - m.fetchedAt > 30_000
    ? 'OFFLINE'
    : wheelState(m ? { coreStatus: m.coreStatus, freshness: m.freshness, observedAtMs: observedAt ?? undefined, staleAfterSeconds: m.staleAfterSeconds, nowMs: now } : null)
  const rpmRaw = m?.rpmMilli !== undefined ? Number(m.rpmMilli) : NaN
  const telemetry: Telemetry = { wheel, rpm: wheel === 'OFFLINE' || !Number.isFinite(rpmRaw) ? null : rpmRaw / 1000, observedAt }
  return { telemetry, query: q }
}

export type Cheer = { hash: string; from: string; block: bigint }

const CHEER_LOOKBACK = 1800n // about six hours of Sepolia blocks

/**
 * Cheers are approve(self, 0) calls on SQK, found in Approval logs where owner equals spender and
 * value is zero. Read from the chain, so every viewer and every overlay sees the same cheers.
 */
export function useCheers() {
  return useQuery({
    queryKey: ['cheers'],
    queryFn: async (): Promise<Cheer[]> => {
      const tip = await publicClient.getBlockNumber({ cacheTime: 0 })
      const from = tip > CHEER_LOOKBACK ? tip - CHEER_LOOKBACK : 0n
      const logs = await publicClient.getLogs({ address: CONTRACTS.sqk, event: approvalEvent, fromBlock: from, toBlock: tip })
      return logs
        .filter((l) => !l.removed && l.args.owner && l.args.spender && l.args.owner.toLowerCase() === l.args.spender.toLowerCase() && l.args.value === 0n && l.transactionHash)
        .map((l) => ({ hash: l.transactionHash!, from: l.args.owner!, block: l.blockNumber ?? 0n }))
        .reverse()
    },
    refetchInterval: 12_000,
    retry: 1,
  })
}
