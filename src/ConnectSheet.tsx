import { useEffect, useRef, useState } from 'react'
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain, type Connector } from 'wagmi'
import { chain } from './config'
import { short } from './logic'
import { OPEN_IN, isMobileBrowser } from './open-in'
import { WALLET_ICONS, iconSrc } from './wallet-icons'

const errorLine = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel/i.test(msg)) return 'Request declined in the wallet.'
  return msg.split('\n')[0]!.slice(0, 140)
}

/** The connect control and its sheet: the site's own type and colors, the network's structure. */
export function ConnectSheet() {
  const mobile = isMobileBrowser()
  const { address, isConnected, chainId } = useConnection()
  const connectors = useConnectors()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const switchChain = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); openerRef.current?.focus() }
  }, [open])
  useEffect(() => { if (isConnected) setOpen(false) }, [isConnected])

  // EIP-6963 names each installed extension; wagmi's generic injected row is only for a browser
  // where discovery found nothing, and then it is called what it is.
  const named = connectors.some((c) => c.type === 'injected' && c.id !== 'injected')
  const listed = [...connectors.filter((c) => c.type === 'injected'), ...connectors.filter((c) => c.type !== 'injected')]
    .filter((c) => !(c.id === 'injected' && named))
    .filter((c) => !mobile || c.type !== 'injected')
  const label = (c: Connector) => (c.id === 'injected' ? 'Browser wallet' : c.id === 'coinbaseWalletSDK' && mobile ? 'Coinbase Smart Wallet' : c.name)
  const icon = (c: Connector) => c.icon ?? (WALLET_ICONS[c.id] ? iconSrc(WALLET_ICONS[c.id]!) : undefined)
  const pendingId = connect.isPending ? connect.variables?.connector && 'uid' in connect.variables.connector ? connect.variables.connector.uid : null : null

  if (isConnected && address) {
    if (chainId !== chain.id) {
      return (
        <div className="wallet-ctl">
          <button className="btn btn-primary" disabled={switchChain.isPending} onClick={() => switchChain.mutate({ chainId: chain.id })}>
            {switchChain.isPending ? 'Switching…' : `Switch to ${chain.name}`}
          </button>
          <button className="btn btn-ghost" onClick={() => disconnect.mutate()}>Disconnect</button>
        </div>
      )
    }
    return (
      <button className="btn btn-ghost addr" onClick={() => disconnect.mutate()} title="Disconnect this wallet">
        {short(address)} · Disconnect
      </button>
    )
  }

  return (
    <>
      <button ref={openerRef} className="btn btn-primary" onClick={() => { setNote(null); setOpen(true) }}>Connect</button>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="sheet-title">Connect a wallet</h2>
              <button ref={closeRef} className="x" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            {mobile && OPEN_IN.map((w) => (
              <a key={w.id} className="row" href={w.href(location.href)}>
                <span className="ic">{WALLET_ICONS[w.id] && <img width={28} height={28} src={iconSrc(WALLET_ICONS[w.id]!)} alt="" />}</span>
                <span>Open in {w.name}</span>
              </a>
            ))}
            {listed.map((c) => (
              <button
                key={c.uid}
                className="row"
                disabled={connect.isPending}
                onClick={() => {
                  setNote(null)
                  connect.mutate({ connector: c, chainId: chain.id }, { onError: (e) => setNote(errorLine(e)) })
                }}
              >
                <span className="ic">{icon(c) && <img width={28} height={28} src={icon(c)} alt="" />}</span>
                <span>{label(c)}{pendingId === c.uid ? ' · opening…' : ''}</span>
              </button>
            ))}
            {note && <p className="sheet-note" role="alert">{note}</p>}
          </div>
        </div>
      )}
    </>
  )
}
