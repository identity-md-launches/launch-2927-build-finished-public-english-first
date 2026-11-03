import { useEffect, useState } from 'react'
import { useConnection, useWriteContract } from 'wagmi'
import { ConnectSheet } from './ConnectSheet'
import { CONTRACTS, EXPLORER, PUBLIC_RPC_URL, API, chain, publicClient, sqkAbi } from './config'
import { useCheers } from './live'
import { ALERT_KINDS, overlayUrl, short, type AlertEvent, type AlertKind, type Layout, type OverlaySettings } from './logic'
import { StreamOverlay } from './Overlay'

const ALERT_LABELS: Record<AlertKind, { name: string; hint: string }> = {
  spin: { name: 'Wheel starts', hint: 'Shows SPINNING' },
  idle: { name: 'Wheel stops', hint: 'Shows IDLE' },
  block: { name: 'Block complete', hint: 'Each filled Squeek block' },
  cheer: { name: 'Cheers', hint: 'Each viewer cheer' },
}

const SOURCES: { layout: Layout; name: string; size: string }[] = [
  { layout: 'card', name: 'Status card', size: '480 × 300' },
  { layout: 'strip', name: 'Status strip', size: '1280 × 96' },
  { layout: 'alerts', name: 'Alerts only', size: '800 × 160' },
]

type Armed = { address: string; alerts: AlertKind[]; sound: boolean }
const ARMED_KEY = 'squeek-stream-kit:armed'

function loadArmed(): Armed | null {
  try {
    const v = JSON.parse(localStorage.getItem(ARMED_KEY) ?? 'null') as Armed | null
    return v && /^0x[0-9a-fA-F]{40}$/.test(v.address) && Array.isArray(v.alerts) ? v : null
  } catch {
    return null
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

type CheerState =
  | { s: 'idle' }
  | { s: 'wallet' }
  | { s: 'pending'; hash: string }
  | { s: 'done'; hash: string }
  | { s: 'failed'; msg: string; hash?: string }

export function Control() {
  const { address, isConnected, chainId } = useConnection()
  const onSepolia = isConnected && chainId === chain.id
  const [armed, setArmed] = useState<Armed | null>(loadArmed)
  const [alerts, setAlerts] = useState<AlertKind[]>(() => armed?.alerts ?? [...ALERT_KINDS])
  const [sound, setSound] = useState(() => armed?.sound ?? false)
  const [testAlert, setTestAlert] = useState<AlertEvent | null>(null)
  const [copied, setCopied] = useState<Layout | null>(null)
  const [cheer, setCheer] = useState<CheerState>({ s: 'idle' })
  const write = useWriteContract()
  const cheers = useCheers()

  // An armed setup belongs to the wallet that armed it.
  const armedHere = armed && address && armed.address.toLowerCase() === address.toLowerCase() ? armed : null
  const dirty = armedHere ? armedHere.sound !== sound || armedHere.alerts.join() !== alerts.join() : false

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(null), 2500)
    return () => clearTimeout(id)
  }, [copied])

  const settingsFor = (layout: Layout): OverlaySettings => ({ layout, alerts, sound, transparent: true, streamer: armedHere?.address })
  const toggle = (k: AlertKind) => setAlerts((a) => (a.includes(k) ? a.filter((x) => x !== k) : ALERT_KINDS.filter((x) => x === k || a.includes(x))))

  const arm = () => {
    if (!address) return
    const next = { address, alerts, sound }
    localStorage.setItem(ARMED_KEY, JSON.stringify(next))
    setArmed(next)
  }
  const disarm = () => {
    localStorage.removeItem(ARMED_KEY)
    setArmed(null)
  }
  const fireTest = () => {
    const k = alerts[0] ?? 'spin'
    const samples: Record<AlertKind, Omit<AlertEvent, 'id' | 'kind'>> = {
      spin: { title: 'SPINNING', detail: 'Test alert: the hamster is on the wheel' },
      idle: { title: 'IDLE', detail: 'Test alert: the wheel has stopped' },
      block: { title: 'Block complete', detail: 'Test alert: a Squeek block filled' },
      cheer: { title: 'Cheer', detail: 'Test alert: a viewer cheered the hamster' },
    }
    setTestAlert({ id: `test-${Date.now()}`, kind: k, ...samples[k] })
  }

  const sendCheer = async () => {
    if (!address || !onSepolia) return
    setCheer({ s: 'wallet' })
    let hash: string | undefined
    try {
      hash = await write.mutateAsync({ address: CONTRACTS.sqk, abi: sqkAbi, functionName: 'approve', args: [address, 0n], chainId: chain.id })
      setCheer({ s: 'pending', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 180_000 })
      if (receipt.status !== 'success') throw new Error('The transaction reverted on Sepolia.')
      setCheer({ s: 'done', hash })
      void cheers.refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0]! : String(e)
      setCheer({ s: 'failed', msg: /reject|denied|cancel/i.test(msg) ? 'You declined the request in your wallet. Nothing was sent.' : msg.slice(0, 160), hash })
    }
  }

  const cheerLabel = !isConnected ? 'Connect to cheer' : !onSepolia ? `Switch to ${chain.name} to cheer` : cheer.s === 'wallet' ? 'Confirm in your wallet…' : cheer.s === 'pending' ? 'Cheering…' : 'Cheer the hamster'
  const cheerBusy = cheer.s === 'wallet' || cheer.s === 'pending'

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="#/" aria-label="Squeek Stream Kit home">
          <img src="./favicon.svg" width={28} height={28} alt="" />
          <span>Squeek Stream Kit</span>
        </a>
        <ConnectSheet />
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Put the hamster on stream.</h1>
            <p className="lede">A live OBS overlay and control panel for the Squeekchain wheel on Sepolia.</p>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={async () => { if (await copyText(overlayUrl(location.href, settingsFor('card')))) setCopied('card') }}>
                {copied === 'card' ? 'URL copied' : 'Copy OBS URL'}
              </button>
              <a className="btn btn-ghost" href="#cheer">Cheer the hamster</a>
            </div>
          </div>
          <div className="preview">
            <StreamOverlay settings={{ ...settingsFor('card'), sound: false }} testAlert={testAlert} />
          </div>
        </section>

        <div className="grid">
          <section className="panel" aria-labelledby="arm-title">
            <h2 id="arm-title">Arm alerts</h2>
            <p className="muted">Arming saves these picks in this browser for this wallet.</p>
            <fieldset className="checks">
              <legend className="sr-only">Alerts</legend>
              {ALERT_KINDS.map((k) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={alerts.includes(k)} onChange={() => toggle(k)} />
                  <span>
                    <span className="check-name">{ALERT_LABELS[k].name}</span>
                    <span className="check-hint">{ALERT_LABELS[k].hint}</span>
                  </span>
                </label>
              ))}
              <label className="check">
                <input type="checkbox" checked={sound} onChange={() => setSound((v) => !v)} />
                <span>
                  <span className="check-name">Chime</span>
                  <span className="check-hint">Tick “Control audio via OBS”</span>
                </span>
              </label>
            </fieldset>
            <div className="row-actions">
              {armedHere && !dirty ? (
                <button className="btn btn-ghost" onClick={disarm}>Disarm</button>
              ) : (
                <button className="btn btn-primary" onClick={arm} disabled={!onSepolia || alerts.length === 0}>
                  {armedHere ? 'Save changes' : 'Arm alerts'}
                </button>
              )}
              <button className="btn btn-ghost" onClick={fireTest} disabled={alerts.length === 0}>Send test alert</button>
            </div>
            <p className="status-line" aria-live="polite">
              {alerts.length === 0
                ? 'Choose at least one alert.'
                : armedHere
                  ? dirty ? 'Unsaved changes. The URLs below already use them.' : `Armed for ${short(armedHere.address)}. The URLs below carry your setup.`
                  : !isConnected ? 'Connect a wallet to arm alerts. The URLs below work without one.'
                  : !onSepolia ? `Switch to ${chain.name} to arm alerts.`
                  : 'Not armed yet.'}
            </p>
          </section>

          <section className="panel" aria-labelledby="obs-title">
            <h2 id="obs-title">Add to OBS</h2>
            <p className="muted">Add a Browser source, paste a URL, use the size shown.</p>
            <ul className="sources">
              {SOURCES.map((src) => {
                const url = overlayUrl(location.href, settingsFor(src.layout))
                return (
                  <li key={src.layout} className="source">
                    <div className="source-head">
                      <span className="source-name">{src.name}</span>
                      <span className="source-size">{src.size}</span>
                    </div>
                    <div className="source-row">
                      <input className="url" readOnly value={url} aria-label={`${src.name} URL`} onFocus={(e) => e.currentTarget.select()} />
                      <button className="btn btn-ghost btn-sm" onClick={async () => { if (await copyText(url)) setCopied(src.layout) }}>
                        {copied === src.layout ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <a className="link" href={url.slice(url.indexOf('#'))} target="_blank" rel="noopener">Open {src.name.toLowerCase()} in a new tab</a>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="panel" id="cheer" aria-labelledby="cheer-title">
            <h2 id="cheer-title">Cheer the hamster</h2>
            <p className="muted">
              Sends <code>approve(you, 0)</code> on SQK: no tokens move, only Sepolia gas.
            </p>
            <div className="row-actions">
              <button className="btn btn-primary" onClick={sendCheer} disabled={!onSepolia || cheerBusy}>{cheerLabel}</button>
            </div>
            <p className="status-line" aria-live="polite">
              {cheer.s === 'pending' && <>Waiting for Sepolia. <a className="link" href={`${EXPLORER}/tx/${cheer.hash}`} target="_blank" rel="noopener">View transaction</a></>}
              {cheer.s === 'done' && <>Cheer confirmed. <a className="link" href={`${EXPLORER}/tx/${cheer.hash}`} target="_blank" rel="noopener">View transaction</a></>}
              {cheer.s === 'failed' && <span className="err">{cheer.msg} {cheer.hash && <a className="link" href={`${EXPLORER}/tx/${cheer.hash}`} target="_blank" rel="noopener">View transaction</a>}</span>}
            </p>
            <h3>Recent cheers</h3>
            {cheers.isError && cheers.data && (
              <p className="err" role="status">Cheers could not refresh; showing last read. Retrying every 12 seconds.</p>
            )}
            {cheers.isPending ? (
              <p className="muted">Reading Sepolia…</p>
            ) : cheers.isError && !cheers.data ? (
              <p className="err">Could not read cheers from Sepolia. Retrying every 12 seconds.</p>
            ) : cheers.data && cheers.data.length > 0 ? (
              <ol className="cheers">
                {cheers.data.slice(0, 6).map((c) => (
                  <li key={c.hash}>
                    <span className="mono">{short(c.from)}</span>
                    <a className="link" href={`${EXPLORER}/tx/${c.hash}`} target="_blank" rel="noopener">Block {c.block.toLocaleString('en-US')}</a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No cheers in the last six hours. Be the first.</p>
            )}
          </section>
        </div>
      </main>

      <footer className="foot">
        <p>A community project for the Squeekchain Buildooooor badge. Your keys stay in your wallet; this page never asks for a private key.</p>
        <dl className="facts">
          <div><dt>Network</dt><dd>{chain.name} (chain ID {chain.id})</dd></div>
          <div><dt>SQK token</dt><dd><a className="link mono" href={`${EXPLORER}/token/${CONTRACTS.sqk}`} target="_blank" rel="noopener">{short(CONTRACTS.sqk)}</a></dd></div>
          <div><dt>SqueekCore</dt><dd><a className="link mono" href={`${EXPLORER}/address/${CONTRACTS.core}`} target="_blank" rel="noopener">{short(CONTRACTS.core)}</a></dd></div>
          <div><dt>Wheel telemetry</dt><dd className="mono">{API.replace('https://', '')}/status</dd></div>
          <div><dt>Chain reads</dt><dd className="mono">{PUBLIC_RPC_URL.replace('https://', '')}</dd></div>
        </dl>
      </footer>
    </div>
  )
}
