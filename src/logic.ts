// Pure functions shared by the overlay and the control page. No imports, so tests/logic.test.ts can
// run them under plain Node.

export type AlertKind = 'spin' | 'idle' | 'block' | 'cheer'
export const ALERT_KINDS: readonly AlertKind[] = ['spin', 'idle', 'block', 'cheer']
export type Layout = 'card' | 'strip' | 'alerts'
export const LAYOUTS: readonly Layout[] = ['card', 'strip', 'alerts']

export type OverlaySettings = {
  layout: Layout
  alerts: AlertKind[]
  sound: boolean
  /** Transparent page background, for OBS browser sources. */
  transparent: boolean
  /** The streamer's wallet that armed these alerts, shown on the overlay. */
  streamer?: string
}

export const DEFAULT_SETTINGS: OverlaySettings = { layout: 'card', alerts: [...ALERT_KINDS], sound: false, transparent: true }

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** Build the query string that follows `#/overlay?` in an OBS browser-source URL. */
export function encodeSettings(s: OverlaySettings): string {
  const p = new URLSearchParams()
  p.set('layout', s.layout)
  p.set('alerts', s.alerts.length ? s.alerts.join(',') : 'none')
  if (s.sound) p.set('sound', '1')
  if (!s.transparent) p.set('bg', 'dark')
  if (s.streamer && ADDRESS.test(s.streamer)) p.set('by', s.streamer)
  return p.toString()
}

/** Read overlay settings from a query string; anything unknown falls back to the defaults. */
export function decodeSettings(query: string): OverlaySettings {
  const p = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const layout = p.get('layout')
  const alertsRaw = p.get('alerts')
  const alerts = alertsRaw === null
    ? [...DEFAULT_SETTINGS.alerts]
    : ALERT_KINDS.filter((k) => alertsRaw.split(',').includes(k))
  const by = p.get('by') ?? undefined
  return {
    layout: LAYOUTS.includes(layout as Layout) ? (layout as Layout) : DEFAULT_SETTINGS.layout,
    alerts,
    sound: p.get('sound') === '1',
    transparent: p.get('bg') !== 'dark',
    streamer: by && ADDRESS.test(by) ? by : undefined,
  }
}

/** Absolute OBS URL for this page, keeping whatever path the site is hosted under (gateway, ENS). */
export function overlayUrl(pageHref: string, s: OverlaySettings): string {
  const base = pageHref.split('#')[0]
  return `${base}#/overlay?${encodeSettings(s)}`
}

export type RoundClock = { roundIndex: number; endsAt: number; secondsLeft: number; fraction: number }

/**
 * SqueekCore's configuration() carries the start of round zero and the round length in seconds.
 * Rounds tick on the wall clock; settlement trails behind and is reported separately.
 */
export function roundClock(nowMs: number, roundZeroStart: number, roundSeconds: number): RoundClock {
  const now = nowMs / 1000
  const elapsed = Math.max(0, now - roundZeroStart)
  const roundIndex = Math.floor(elapsed / roundSeconds)
  const endsAt = roundZeroStart + (roundIndex + 1) * roundSeconds
  const secondsLeft = Math.max(0, Math.ceil(endsAt - now))
  return { roundIndex, endsAt, secondsLeft, fraction: (elapsed % roundSeconds) / roundSeconds }
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Fraction of the current Squeek block, from SqueekCore.state().blockProgress over units per block. */
export function blockFraction(progress: bigint, unitsPerBlock: bigint): number {
  if (unitsPerBlock <= 0n) return 0
  const clamped = progress < 0n ? 0n : progress > unitsPerBlock ? unitsPerBlock : progress
  return Number((clamped * 10000n) / unitsPerBlock) / 10000
}

export type WheelState = 'SPINNING' | 'IDLE' | 'OFFLINE'

/** The wheel telemetry is only trusted while fresh; stale or missing data reads OFFLINE, never IDLE. */
export function wheelState(input: { coreStatus?: string; freshness?: string; observedAtMs?: number; staleAfterSeconds?: number; nowMs: number } | null): WheelState {
  if (!input || !input.coreStatus) return 'OFFLINE'
  const staleMs = (input.staleAfterSeconds && input.staleAfterSeconds > 0 ? input.staleAfterSeconds : 120) * 1000
  if (input.freshness && !['fresh', 'online', 'live'].includes(input.freshness.toLowerCase())) return 'OFFLINE'
  if (input.observedAtMs && input.nowMs - input.observedAtMs > staleMs) return 'OFFLINE'
  const status = input.coreStatus.toUpperCase()
  if (status === 'SPINNING') return 'SPINNING'
  if (status === 'IDLE') return 'IDLE'
  return 'OFFLINE'
}

export type AlertEvent = { id: string; kind: AlertKind; title: string; detail: string }

export type Snapshot = { wheel: WheelState; blockHeight?: bigint; cheers: { hash: string; from: string }[] }

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * Compare two consecutive snapshots and return the alerts the overlay should show, filtered by what
 * the streamer armed. The first snapshot never fires: an overlay that just loaded must not replay
 * history as if it were happening now.
 */
export function diffAlerts(prev: Snapshot | null, next: Snapshot, armed: readonly AlertKind[]): AlertEvent[] {
  if (!prev) return []
  const out: AlertEvent[] = []
  if (prev.wheel !== 'SPINNING' && next.wheel === 'SPINNING') out.push({ id: `spin-${Date.now()}`, kind: 'spin', title: 'SPINNING', detail: 'The hamster is on the wheel' })
  if (prev.wheel === 'SPINNING' && next.wheel === 'IDLE') out.push({ id: `idle-${Date.now()}`, kind: 'idle', title: 'IDLE', detail: 'The wheel has stopped' })
  if (prev.blockHeight !== undefined && next.blockHeight !== undefined && next.blockHeight > prev.blockHeight) {
    out.push({ id: `block-${next.blockHeight}`, kind: 'block', title: `Block ${next.blockHeight.toLocaleString('en-US')}`, detail: 'A Squeek block is complete' })
  }
  const seen = new Set(prev.cheers.map((c) => c.hash))
  for (const c of next.cheers) if (!seen.has(c.hash)) out.push({ id: `cheer-${c.hash}`, kind: 'cheer', title: 'Cheer', detail: `${short(c.from)} cheered the hamster` })
  return out.filter((e) => armed.includes(e.kind))
}
