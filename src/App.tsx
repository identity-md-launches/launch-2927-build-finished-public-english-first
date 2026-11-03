import { useEffect, useState } from 'react'
import { Control } from './Control'
import { decodeSettings } from './logic'
import { StreamOverlay } from './Overlay'

/** Hash routing: a static export has no server to rewrite paths. #/overlay?… is the OBS page. */
function useHash() {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function App() {
  const hash = useHash()
  const isOverlay = hash.startsWith('#/overlay')
  const settings = isOverlay ? decodeSettings(hash.split('?')[1] ?? '') : null

  useEffect(() => {
    document.documentElement.classList.toggle('obs', isOverlay)
    document.documentElement.classList.toggle('obs-transparent', Boolean(settings?.transparent))
    if (isOverlay) document.title = 'Squeek Stream Kit overlay'
  }, [isOverlay, settings?.transparent])

  if (settings) {
    return (
      <main className={`obs-stage obs-${settings.layout}`}>
        <h1 className="sr-only">Squeek Stream Kit overlay</h1>
        <StreamOverlay settings={settings} />
      </main>
    )
  }
  return <Control />
}
