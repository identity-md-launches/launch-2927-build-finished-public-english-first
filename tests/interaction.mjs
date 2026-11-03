// Interaction checks against the built export in dist/.
// Run: npm run build && IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node tests/interaction.mjs
// A mock EIP-6963 wallet (no keys, it only records requests) stands in for a browser extension.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.IMD_PLAYWRIGHT || 'playwright')
const root = new URL('../dist/', import.meta.url).pathname
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '')
  try {
    const body = await readFile(join(root, path || 'index.html'))
    res.writeHead(200, { 'content-type': types[extname(path || 'index.html')] || 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end()
  }
}).listen(0)
const base = `http://127.0.0.1:${server.address().port}/`

const WALLET = '0x1111111111111111111111111111111111111111'
const mockWallet = `(() => {
  const listeners = {}
  let chainId = '0x1'
  let authorized = false
  const sent = (window.__sent = [])
  const provider = {
    isMock: true,
    on: (e, f) => { (listeners[e] ||= []).push(f) },
    removeListener: (e, f) => { listeners[e] = (listeners[e] || []).filter((x) => x !== f) },
    async request({ method, params }) {
      sent.push({ method, params })
      if (method === 'eth_requestAccounts') { authorized = true; return ['${WALLET}'] }
      if (method === 'eth_accounts') return authorized ? ['${WALLET}'] : []
      if (method === 'eth_chainId') return chainId
      if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; (listeners.chainChanged || []).forEach((f) => f(chainId)); return null }
      if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32)
      if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }]
      throw Object.assign(new Error('unsupported ' + method), { code: 4200 })
    },
  }
  window.__setChain = (c) => { chainId = c; (listeners.chainChanged || []).forEach((f) => f(c)) }
  const info = { uuid: '00000000-0000-4000-8000-000000000001', name: 'Mock Wallet', icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2228%22 height=%2228%22/>', rdns: 'test.mock' }
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }))
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
})()`

const results = []
const check = async (name, fn) => {
  try {
    await fn()
    results.push(`PASS ${name}`)
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`)
  }
}

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) })
  await ctx.addInitScript(mockWallet)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)

  await check('first screen at 390 shows the headline, preview and main actions', async () => {
    await page.getByRole('heading', { level: 1, name: 'Put the hamster on stream.' }).waitFor()
    for (const loc of [page.getByRole('button', { name: 'Copy OBS URL' }), page.getByRole('link', { name: 'Cheer the hamster' }), page.locator('.preview .ov-card')]) {
      const box = await loc.boundingBox()
      assert.ok(box && box.y + Math.min(box.height, 40) <= 844, 'element below the first screen')
    }
  })

  await check('overlay preview reads SqueekCore from Sepolia', async () => {
    await page.locator('.preview').getByText(/^Block [\d,]+$/).waitFor({ timeout: 25_000 })
    await page.locator('.preview').getByText(/^\d{2}:\d{2}$/).waitFor()
  })

  await check('copy OBS URL writes the overlay URL to the clipboard', async () => {
    await page.getByRole('button', { name: 'Copy OBS URL' }).click()
    await page.getByRole('button', { name: 'URL copied' }).waitFor()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    assert.match(text, /#\/overlay\?layout=card&alerts=spin%2Cidle%2Cblock%2Ccheer$/)
  })

  await check('toggling an alert changes every OBS URL', async () => {
    await page.getByRole('checkbox', { name: /Block complete/ }).uncheck()
    const v = await page.getByRole('textbox', { name: 'Status strip URL' }).inputValue()
    assert.match(v, /layout=strip&alerts=spin%2Cidle%2Ccheer$/)
    await page.getByRole('checkbox', { name: /Block complete/ }).check()
  })

  await check('send test alert shows a banner in the preview', async () => {
    await page.getByRole('button', { name: 'Send test alert' }).click()
    await page.locator('.preview .ov-alert-spin').getByText('SPINNING').waitFor()
  })

  await check('arming is disabled until a Sepolia wallet connects', async () => {
    assert.equal(await page.getByRole('button', { name: 'Arm alerts' }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Connect to cheer' }).isDisabled(), true)
  })

  await check('connect sheet lists the EIP-6963 wallet, closes on Escape', async () => {
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect a wallet' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Mock Wallet' }).waitFor()
    assert.equal(await dialog.getByText('Injected').count(), 0)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
  })

  await check('connect sheet keeps Tab and Shift+Tab inside, page behind is inert', async () => {
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect a wallet' })
    await dialog.getByRole('button', { name: 'Mock Wallet' }).waitFor()
    const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert.ok(await inside(), `Tab ${i + 1} left the dialog`) }
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); assert.ok(await inside(), `Shift+Tab ${i + 1} left the dialog`) }
    assert.equal(await page.evaluate(() => document.getElementById('root').inert), true)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.getElementById('root').inert), false)
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Connect')
  })

  await check('wrong chain offers Switch to Sepolia without overflow at 320, then shows the address', async () => {
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mock Wallet' }).click()
    // wagmi connects straight to Sepolia; then the wallet moves to Ethereum on its own.
    await page.getByRole('button', { name: /0x1111…1111 · Disconnect/ }).waitFor()
    await page.evaluate(() => window.__setChain('0x1'))
    const sw = page.getByRole('button', { name: 'Switch to Sepolia', exact: true })
    await sw.waitFor()
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, right: Math.max(...[...document.querySelectorAll('.wallet-ctl .btn')].map((b) => b.getBoundingClientRect().right)) }))
      assert.ok(m.sw <= width && m.right <= width, `overflow at ${width}: ${JSON.stringify(m)}`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await sw.click()
    await page.getByRole('button', { name: /0x1111…1111 · Disconnect/ }).waitFor()
  })

  await check('arm alerts tags the URLs with the streamer wallet', async () => {
    await page.getByRole('button', { name: 'Arm alerts' }).click()
    await page.getByText('Armed for 0x1111…1111').waitFor()
    const v = await page.getByRole('textbox', { name: 'Status card URL' }).inputValue()
    assert.ok(v.endsWith(`&by=${WALLET}`))
  })

  await check('cheer sends approve(self, 0) to the SQK token on Sepolia', async () => {
    await page.getByRole('button', { name: 'Cheer the hamster' }).click()
    await page.getByText(/Waiting for Sepolia|Cheer confirmed|reverted|could not|not found/i).first().waitFor({ timeout: 15_000 })
    const tx = (await page.evaluate(() => window.__sent)).find((r) => r.method === 'eth_sendTransaction')
    assert.ok(tx, 'no eth_sendTransaction')
    const p = tx.params[0]
    assert.equal(p.to.toLowerCase(), '0x5501e1fa81be1c3f49225fa7668da0245d07db60')
    assert.equal(p.data, '0x095ea7b3' + WALLET.slice(2).padStart(64, '0') + '0'.repeat(64))
    assert.ok(!p.value || BigInt(p.value) === 0n)
  })

  await check('overlay route: strip layout, transparent page, no wallet UI', async () => {
    const o = await ctx.newPage()
    await o.setViewportSize({ width: 1280, height: 96 })
    await o.goto(`${base}#/overlay?layout=strip&alerts=spin,idle`)
    await o.locator('.ov-strip').waitFor()
    assert.equal(await o.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)')
    assert.equal(await o.getByRole('button', { name: 'Connect' }).count(), 0)
    const overflow = await o.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false)
    await o.close()
  })

  await check('no uncaught page errors', async () => assert.deepEqual(errors, []))
} finally {
  await browser.close()
  server.close()
}
console.log(results.join('\n'))
process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0
