import { useEffect, useRef, useState } from 'react'
import { useCheers, useCoreConfig, useCoreState, useNow, useTelemetry } from './live'
import { blockFraction, diffAlerts, mmss, roundClock, short, type AlertEvent, type OverlaySettings, type Snapshot } from './logic'

const ALERT_MS = 6000

function chime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.55)
  } catch {
    // Audio is optional; a browser source without audio permission stays silent.
  }
}

/** The overlay itself: rendered full-page at #/overlay for OBS and inline as the live preview. */
export function StreamOverlay({ settings, testAlert }: { settings: OverlaySettings; testAlert?: AlertEvent | null }) {
  const now = useNow(1000)
  const cfg = useCoreConfig()
  const core = useCoreState()
  const cheers = useCheers()
  const { telemetry } = useTelemetry(now)

  const [queue, setQueue] = useState<AlertEvent[]>([])
  const [current, setCurrent] = useState<AlertEvent | null>(null)
  const prev = useRef<Snapshot | null>(null)

  // Fire alerts on changes only; the first snapshot after loading is the baseline.
  useEffect(() => {
    if (core.data === undefined || cheers.data === undefined) return
    const next: Snapshot = { wheel: telemetry.wheel, blockHeight: core.data.blockHeight, cheers: cheers.data }
    const events = diffAlerts(prev.current, next, settings.alerts)
    prev.current = next
    if (events.length) setQueue((q) => [...q, ...events])
  }, [telemetry.wheel, core.data, cheers.data, settings.alerts])

  useEffect(() => {
    if (testAlert) setQueue((q) => [...q, testAlert])
  }, [testAlert])

  useEffect(() => {
    if (current || queue.length === 0) return
    setCurrent(queue[0]!)
    setQueue((q) => q.slice(1))
    if (settings.sound) chime()
  }, [queue, current, settings.sound])

  useEffect(() => {
    if (!current) return
    const id = setTimeout(() => setCurrent(null), ALERT_MS)
    return () => clearTimeout(id)
  }, [current])

  const clock = cfg.data ? roundClock(now, cfg.data.roundZeroStart, cfg.data.roundSeconds) : null
  const fraction = core.data && cfg.data ? blockFraction(core.data.blockProgress, cfg.data.unitsPerBlock) : null
  const nextBlock = core.data ? (core.data.blockHeight + 1n).toLocaleString('en-US') : null
  const chainDown = core.isError && !core.data

  const banner = (
    <div className={`ov-alert ${current ? `ov-alert-${current.kind}` : 'ov-alert-empty'}`} role="status" aria-live="polite">
      {current && (
        <>
          <strong className="ov-alert-title">{current.title}</strong>
          <span className="ov-alert-detail">{current.detail}</span>
        </>
      )}
    </div>
  )

  if (settings.layout === 'alerts') return <div className="ov ov-alerts-only">{banner}</div>

  const wheel = (
    <div className={`ov-wheel ov-wheel-${telemetry.wheel.toLowerCase()}`}>
      <span className="ov-dot" aria-hidden="true" />
      <span className="ov-wheel-word">{telemetry.wheel}</span>
    </div>
  )
  const rpm = (
    <div className="ov-stat">
      <span className="ov-num">{telemetry.rpm === null ? '--' : telemetry.rpm.toFixed(1)}</span>
      <span className="ov-label">RPM</span>
    </div>
  )
  const block = (
    <div className="ov-meter">
      <div className="ov-meter-line">
        <span className="ov-label">{nextBlock ? `Block ${nextBlock}` : chainDown ? 'Sepolia unreachable' : 'Reading block…'}</span>
        <span className="ov-value">{fraction === null ? '' : `${(fraction * 100).toFixed(1)}%`}</span>
      </div>
      <div className="ov-bar" role="progressbar" aria-label="Squeek block progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}>
        <span className="ov-bar-fill ov-bar-block" style={{ transform: `scaleX(${fraction ?? 0})` }} />
      </div>
    </div>
  )
  const round = (
    <div className="ov-meter">
      <div className="ov-meter-line">
        <span className="ov-label">Round ends in</span>
        <span className="ov-value">{clock ? mmss(clock.secondsLeft) : '––:––'}</span>
      </div>
      <div className="ov-bar" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clock ? Math.round(clock.fraction * 100) : undefined}>
        <span className="ov-bar-fill ov-bar-round" style={{ transform: `scaleX(${clock?.fraction ?? 0})` }} />
      </div>
    </div>
  )

  if (settings.layout === 'strip') {
    return (
      <div className="ov ov-strip">
        {wheel}
        {rpm}
        {block}
        {round}
        <div className="ov-slot">{banner}</div>
      </div>
    )
  }

  return (
    <div className="ov ov-card">
      <div className="ov-top">
        {wheel}
        {rpm}
      </div>
      {block}
      {round}
      {/* One fixed-height slot: the footer line, replaced by the banner while an alert shows. */}
      <div className="ov-slot">
        {current ? banner : (
          <div className="ov-foot">
            <span>{telemetry.wheel === 'OFFLINE' ? 'Wheel telemetry unavailable, retrying' : 'Squeekchain · Sepolia'}</span>
            {settings.streamer && <span>Streamer {short(settings.streamer)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
