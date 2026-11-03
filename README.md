# Squeek Stream Kit

Squeek Stream Kit is a community project for the Squeekchain Buildooooor badge. It is not an
official Squeekchain product.

It is a stream companion for Squeekchain streamers and viewers on Sepolia:

- **Overlay** (`#/overlay?…`): an OBS browser source with a transparent background. It shows
  the live wheel status (SPINNING / IDLE / OFFLINE), RPM, Squeek block progress and the round
  countdown. It also shows SPINNING, IDLE, block-complete and cheer alerts. Three layouts:
  `layout=card` (480 × 300), `layout=strip` (1280 × 96) and `layout=alerts` (800 × 160).
- **Control page** (`#/`, the site root): connect a wallet to arm alerts, copy the OBS
  browser-source URLs, send a test alert to the live preview, and send one optional harmless
  Sepolia action, **Cheer the hamster**. That action calls `approve(yourAddress, 0)` on the SQK
  token at `0x5501e1fa81be1c3f49225fa7668da0245d07db60`. No tokens move; it costs only Sepolia gas.

Wallet actions are Sepolia only (chain ID 11155111). The page never asks for or stores a private
key. Armed alert picks are saved in this browser's `localStorage`, labelled with the wallet that
armed them. They are not stored in the wallet. The OBS URLs carry the same picks in their query
string, so OBS needs no storage of its own.

Data sources: `SqueekCore.state()` and `configuration()` at
`0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`, plus SQK `Approval` logs, are read from Sepolia
through `https://ethereum-sepolia-rpc.publicnode.com`, with `https://sepolia.drpc.org` as a
fallback. Wheel telemetry comes from `https://api.squeekchain.com/v1/status`. Nothing is
simulated: when a read fails, the page says so (see "Failure states" below).

**Genesis Buildooooor ownership:** the brief asks the builder to prove ownership by paying this
first IMD job from a wallet already verified on their Squeekchain Genesis profile. Only the
requester can do that, from their own wallet. This repository contains no keys and makes no
payment.

## Install, preview, rebuild

Requires Node 20+ (checked with Node 24.22.1) and npm.

```sh
npm ci              # install the exact versions in package-lock.json
npm run dev         # local dev server with hot reload
npm run build       # tsc --noEmit, then vite build into dist/
npm run preview     # serve the built dist/ locally
npm run typecheck   # TypeScript only
npm test            # unit tests for the pure logic (node --test)
npm run test:ui     # browser interaction checks against dist/ (needs Playwright, see below)
```

`dist/` is committed and is the static export. Vite uses `base: './'`, so every asset URL is
relative (`./assets/…`, `./favicon.svg`, `./og.png`). Routing is hash-based (`#/`,
`#/overlay?…`), so the export works from any static host, an IPFS gateway subpath or an ENS
name. It needs no server rewrites. To publish elsewhere, upload the contents of `dist/` as they
are.

### Adding the overlay to OBS

1. Open the control page and pick the alerts (and optional chime).
2. Copy one of the three URLs under **Add to OBS**.
3. In OBS: Sources → + → Browser, paste the URL, and set the width/height shown next to it.
   For the chime, tick "Control audio via OBS".

## Failure states

- Wheel telemetry unavailable → the badge reads OFFLINE (never IDLE) and RPM shows `--`.
- A Sepolia refresh fails after an earlier success → the overlay keeps the last values and says
  "Sepolia update failed; showing last read HH:MM:SS", using the time of the last successful
  read.
- SqueekCore configuration not yet readable → the countdown shows `––:––` and the overlay says
  "Sepolia configuration unavailable; retrying". It retries every 12 seconds until one read
  succeeds.
- Cheer history fails to refresh → Recent cheers says "Cheers could not refresh; showing last
  read." Wheel and block alerts keep working: each data source sets its own alert baseline.

## Validation (SPINNING layout revision)

Checked on 2026-11-03 with Node 22.23.3. The reported overflow reproduced in Chromium and
WebKit against the committed export with fresh SPINNING / 123.4 RPM telemetry. At 320/390px, the control page's scroll widths
were 361/431px and the standalone card's were 340/410px. The cause was the non-wrapping
`.ov-top` row (`src/styles.css:481`). Adding `flex-wrap: wrap` lets RPM move below the badge
and the existing meter rows follow it, keeping the same readable type sizes.

| Check | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | passed; includes `tsc --noEmit`; rebuilt `dist/` |
| Typecheck | `npm run typecheck` | passed |
| Unit tests | `npm test` | 7/7 passed |
| Existing interaction suite | `IMD_PLAYWRIGHT=<Playwright module> node tests/interaction.mjs` | 13/13 passed in Chromium, including clipboard, alert settings, modal keyboard behavior, network switching, arming, mock cheer payload and strip overlay |
| SPINNING regression | `node test/scratch/check-spinning.mjs after chromium` and `node test/scratch/check-spinning.mjs after-webkit webkit` | 16/16 passed across Chromium and WebKit: control and card overlay at 320, 390, 480 and 1440px, served under `/preview/` |
| Pinned design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | all 16 checks passed at 320, 390 and 1440px |

Build, typecheck and unit tests ran in an isolated copy with the identical source and lockfile;
dependencies and browser runtimes stayed outside the repository. Browser checks ran against the
delivered `dist/`. The focused regression mocks only `https://api.squeekchain.com/v1/status`
with the reviewer's fresh measurement; both Sepolia RPC hosts remain unmodified. It checks
document width, card/value bounds, font sizes, meter flow and overlay transparency. Both routes
now have scroll widths exactly 320/390px. At 480/1440px the card, badge, RPM and meter geometry
matches the previous export. The 390px product preview and Copy OBS URL action remain on the
first screen. No uncaught page errors or failed local asset responses were observed.

The pinned Better Interface guide was applied to the affected shared card and reviewed across
all six domains:

| Domain | Coverage and result |
| --- | --- |
| Accessibility | Reflow keeps all live values visible at 320/390px; existing keyboard and focus-containment interaction checks pass. |
| Layout | Fixed the reproduced high-severity `.ov-top` overflow at `src/styles.css:481`; checked both routes and wide-layout geometry. |
| Writing | Reviewed the existing labels and values in `src/Overlay.tsx`; this correction needs no copy changes. |
| Typography | RPM remains 36px at 320px and 48px at 390px; no clipping or shrinking was introduced. The probe's type-scale and tracking checks pass. |
| Colors | Existing tokens are retained. The probe's contrast check passes for its default rendered state; contrast over arbitrary OBS scenes was not measured. |
| UI | Inspected the rendered SPINNING card at mobile and desktop sizes; the existing interaction suite passes and the standalone overlay remains transparent. |

Before/after screenshots and measurements were captured in `test/scratch/spinning/`; probe
screenshots are in `test/scratch/taste/shots/`. These scratch files are removed before submission.
The supplied browser tool could not launch its missing Chrome installation, so the checks used
a separate Playwright installation. WebKit used temporary Linux libraries and software rendering;
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` bypassed its system-install check because those
libraries were extracted under `/tmp`. No real wallet, transaction, physical mobile device, OBS,
screen reader or native browser zoom was exercised. The build emitted the existing dependency
warning about externalizing `node:worker_threads`. Complete for the stated revision scope.

## Validation (previous revision)

Run on 2026-11-03 on the contributor machine, against the production export in `dist/`.

| Check | Command | Result |
| --- | --- | --- |
| Production build + typecheck | `npm run build` | passed (`tsc --noEmit` clean; Vite build OK; main chunk 524 kB / 161 kB gzip) |
| Typecheck | `npm run typecheck` | passed |
| Unit tests | `npm test` | 7/7 passed |
| Interaction tests | `IMD_PLAYWRIGHT=…/playwright/index.mjs node tests/interaction.mjs` | 13/13 passed (Chromium, 390 × 844, mock EIP-6963 wallet with no keys) |
| Design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | all 16 checks passed (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share) at 320, 390 and 1440 |

`tests/interaction.mjs` covers:

- the first screen at 390;
- live SqueekCore reads;
- Copy OBS URL (clipboard contents);
- alert toggles rewriting every OBS URL;
- the test alert banner;
- disabled states before connecting;
- the connect sheet (EIP-6963 listing, Escape, Tab/Shift+Tab contained, background inert, focus
  returned to Connect);
- the wrong-network state (no horizontal overflow at 320 and 390, Switch to Sepolia);
- arming;
- the cheer transaction payload (`to` = SQK, data = `approve(self, 0)`, no value);
- the strip overlay (transparent, no wallet UI, no overflow);
- no uncaught page errors.

The reviewer's findings were also reproduced before the fix and re-checked after it with a
scratch Playwright script. It intercepts RPC and telemetry requests to simulate eth_getLogs
failures, failures of every RPC call, and failures of the configuration read. The results:

- 320px wrong network: scroll width went from 455 to 320.
- Dialog Tab order: it used to escape to the page; now it cycles inside.
- getLogs failing: the SPINNING banner was missing; now it shows.
- Stale chain data: there was no notice; now the "showing last read" footer and cheers note
  appear.
- Configuration failure: there was no retry, so the countdown never returned; now it retries and
  the countdown and block % recover within 26 seconds.

### Better Interface review

The pinned guide (`better-interface`) was applied to all six domains. Coverage and findings for
this revision:

- **Accessibility:** fixed. Before: the modal wallet sheet let Tab escape (`src/ConnectSheet.tsx:30`).
  Now it is portalled to `<body>`, `#root` is inert while it is open, Tab and Shift+Tab cycle
  inside it, and Escape and focus restoration are kept. Remaining: the sheet's Close button is
  32 × 32 px, above the 24 px minimum target size but below the 44 px used elsewhere.
- **Layout:** fixed. Before: the header did not wrap, so the wrong-network controls overflowed at
  320 px (`src/styles.css:208`). Now `.top` and `.wallet-ctl` wrap, and both buttons keep 44 px
  heights.
- **Writing:** fixed. The alert storage copy said "to your wallet" (`src/Control.tsx:155`); it now
  says "in this browser for this wallet". Retained data is now labelled as a last read, and a
  failed configuration read shows "retrying" (`src/Overlay.tsx`).
- **Typography:** no new findings. The probe's type-sizes, casing and tracking checks pass.
- **Colors:** new notices reuse `--offline`, already used for the OFFLINE badge and errors. The
  probe's contrast check passed on the rendered default state. Contrast of the notice text on the
  translucent overlay card was not measured separately.
- **UI:** alert baselines are now per source, so one optional read cannot silently disable
  alerts.

### Limitations

- `api.squeekchain.com` answers headless Chromium on this machine with a Cloudflare challenge.
  The overlay therefore shows OFFLINE in the probe's screenshots, and the telemetry-dependent
  checks above mock `/v1/status`. The Sepolia RPC reads were real.
- No real wallet extension, mobile wallet browser or Coinbase Smart Wallet was exercised. No real
  transaction was sent; the mock wallet returns a fixed hash.
- OBS itself was not run. Screen-reader testing was not performed.
