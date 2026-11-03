# Squeek Stream Kit: design system

This document is taken from the final source. All styles are in `src/styles.css`, and there is no
other stylesheet or theme file. Components are in `src/Control.tsx`, `src/Overlay.tsx` and
`src/ConnectSheet.tsx`.

## Overview

The kit serves streamers and their viewers on Squeekchain (Sepolia). It has two surfaces that
share one token set:

- **Control page** (`#/`): a dark, calm page. The headline and its two actions come first,
  followed by a live preview of the overlay and three panels: Arm alerts, Add to OBS, and Cheer
  the hamster.
- **Overlay** (`#/overlay?…`): an OBS browser source on a transparent page
  (`html.obs-transparent`). It uses large numerals and a status badge that must be readable
  over gameplay at stream resolution.

The density is moderate. Each panel is a single column of grouped controls. The amber accent is
reserved for primary actions and block progress. Status colors (green SPINNING, blue-grey IDLE,
red OFFLINE/error) appear only where they report state.

## Colors

All colors are CSS custom properties on `:root` (`src/styles.css:2-18`). The theme is dark only
(`color-scheme: dark`).

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0e0f13` | Page background, URL fields |
| `--surface` | `#16181f` | Panels, connect sheet |
| `--surface-2` | `#1e212a` | Ghost buttons, sheet row hover |
| `--surface-3` | `#262a35` | Ghost hover, empty meter track |
| `--line` | `#2c303c` | Borders and dividers |
| `--line-strong` | `#3d4252` | Hover border, ghost pressed |
| `--text` | `#eceef3` | Primary text, focus outline |
| `--muted` | `#a3a9b7` | Secondary text, labels, hints, footers |
| `--accent` | `#f5b942` | Primary buttons, links, checkbox accent, block progress bar, block/cheer alerts |
| `--accent-hover` / `--accent-press` | `#f8c965` / `#fad685` | Primary hover / pressed |
| `--accent-ink` | `#1a1406` | Text on accent |
| `--spin` | `#3ddc84` | SPINNING badge and alert (alert text `#062312`) |
| `--idle` | `#9fb4dc` | IDLE badge and alert (alert text `#0d1626`), round progress bar |
| `--offline` | `#ff7a7a` | OFFLINE badge, `.err` messages, `.ov-warn` / `.ov-note` read-failure notices, sheet errors |
| `--overlay-bg` | `rgba(14, 15, 19, 0.9)` | Overlay card and strip, so they stay legible over any scene |

Status badges use their color at 12% alpha as the pill fill (`.ov-wheel-*`). The probe's
rendered contrast check passed on the default page state (see README → Validation). The notice
colors on the translucent overlay were not measured separately.

## Typography

- Families: `--font` = `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
  sans-serif`, and `--mono` = `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono',
  monospace` for addresses, URLs and `code`. The site loads no font files.
- One scale of six sizes (`src/styles.css:21-26`): `--fs-xs` 13px, `--fs-sm` 15px (body),
  `--fs-md` 18px, `--fs-lg` 24px, `--fs-xl` 36px, `--fs-2xl` 48px.
- Roles:
  - Hero `h1`: `--fs-xl`, or `--fs-2xl` from 900px and `--fs-lg` at 380px and below. Weight 700,
    line-height 1.1, letter-spacing −0.02em.
  - Panel `h2`: `--fs-lg`, weight 700.
  - `h3`: `--fs-sm`, weight 600.
  - Body: `--fs-sm`, line-height 1.5.
  - Hints, footers, URLs: `--fs-xs`.
  - Overlay RPM numeral (`.ov-num`): `--fs-2xl`, weight 700, line-height 1; `--fs-xl` in the strip
    and at 380px and below.
  - Badge: `--fs-lg` (`--fs-md` at 380px and below).
- Weights used: 400, 600 (buttons, labels) and 700 (headings, numerals).
- Headings use `text-wrap: balance` and paragraphs use `text-wrap: pretty`. Every number on the
  overlay and in lists uses `font-variant-numeric: tabular-nums`, so the countdown and RPM do not
  jitter.
- No uppercase eyebrows or letter-spaced capitals. The only all-caps text is the state words
  SPINNING / IDLE / OFFLINE.

## Layout

- Spacing scale (`src/styles.css:31-37`): `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24,
  `--s6` 32, `--s7` 48 (px). Use only these values.
- `.page` (`:208`): max-width 1200px, centered. Side padding is `--s4`, or the safe-area inset if
  larger; it becomes `--s6` from 900px.
- `.top` header (`:216`): a flex row of brand and wallet control that wraps. When the wallet
  controls cannot fit beside the brand, `.wallet-ctl` (`:183`) moves to its own right-aligned row.
  At 320px, Switch to Sepolia and Disconnect stack. There is never horizontal scroll.
- `.hero` (`:236`): one column on phones (headline, lede, actions, then the preview), so the
  product and its main action are on the first screen at 390. From 900px it becomes two columns:
  `minmax(0,1fr) minmax(0,480px)`.
- `.grid`: one column of panels, then three equal columns from 900px.
- Breakpoints (`:806`, `:820`, `:850`):
  - 640px: the sheet becomes a centered dialog, and panels get `--s5` padding.
  - 900px: two-column hero and three-column grid.
  - 380px and below: smaller hero and overlay numerals.
- Overlay route: `.obs-stage` adds `--s3` padding. The card is capped at 480px. The strip is a
  5-column grid (`:667`) for a 1280 × 96 source.
- Widths checked in a browser: 320, 390 and 1440 (design probe), plus 320/390 in the
  wrong-network state and 1280 × 96 for the strip.

## Elevation & Depth

The design is flat: there are no shadows. Depth comes from tonal layers (`--bg` → `--surface` →
`--surface-2` → `--surface-3`) and 1px `--line` borders. Two overlays exist:

- the connect sheet, behind a `rgba(5, 6, 8, 0.7)` scrim at `z-index: 50`, portalled to
  `<body>`;
- the overlay card's 90%-opaque `--overlay-bg`.

## Shapes

- `--r-sm` 8px: buttons, inputs, sheet rows.
- `--r-md` 12px: alert banners.
- `--r-lg` 16px: panels, overlay card/strip, sheet (top corners only on phones).
- Pills (`999px`): status badge, meter bars.
- The wallet icons in the sheet use 6px radius.

## Components

- **Button** `.btn` (`:118`), with variants `.btn-primary` (accent, one main action per
  group), `.btn-ghost` (surface-2 with border, secondary) and `.btn-sm` (40px, inline beside a
  URL field). Minimum height 44px. Hover, active (`scale(0.98)`) and disabled (opacity 0.6,
  `not-allowed`) states. Labels change in place for progress ("Confirm in your wallet…",
  "Cheering…", "Copied").
- **Link** `.link` (`:196`): accent, underlined with a 3px offset.
- **Panel** `.panel` (`:283`) with `h2`, a `.muted` explanation, controls, `.row-actions`, and a
  `.status-line` (`aria-live="polite"`, reserved 1.5em height) for results.
- **Checkbox row** `.check` (`:334`): native checkbox (accent-colored, 20px) with `.check-name` and
  `.check-hint`. The whole row is a 44px+ label.
- **OBS source row** `.source` (`:371`): name and size, then a read-only mono `.url` field
  (selects on focus) with a Copy button, then an open-in-new-tab link.
- **Cheer list** `.cheers` (`:417`): address and block link per row. It has loading ("Reading
  Sepolia…"), empty, error (no data yet) and stale ("Cheers could not refresh; showing last
  read.") states.
- **Overlay** (`src/Overlay.tsx`): `.ov-card`, `.ov-strip` or `.ov-alerts-only`.
  - Pieces: `.ov-wheel` badge (`-spinning` pulses its dot, `-idle`, `-offline`), `.ov-stat`
    numeral and label, and `.ov-meter` label/value line over an 8px `.ov-bar` with
    `.ov-bar-block` / `.ov-bar-round` fills (`role="progressbar"`).
  - `.ov-slot` holds a fixed 52px line. In the card it shows the footer (`.ov-foot`), which is
    replaced by the alert banner (`.ov-alert-spin|idle|block|cheer`, `role="status"`) for 6
    seconds.
  - Read problems appear in that slot as `.ov-warn` (card footer) or `.ov-note` (strip):
    "Sepolia update failed; showing last read HH:MM:SS", "Sepolia configuration unavailable;
    retrying", or "Wheel telemetry unavailable, retrying".
- **Connect sheet** (`src/ConnectSheet.tsx`, `.sheet` `:713`, `.row` `:755`): `role="dialog"`,
  `aria-modal`. Its rows are EIP-6963 wallets, Coinbase Wallet, and "Open in …" wallet browsers on
  phones. Keyboard behavior: focus moves to Close on open, Tab and Shift+Tab cycle within the
  sheet, `#root` is inert while it is open, and Escape or a scrim click closes it and returns
  focus to Connect. When connected on the wrong chain, the trigger becomes `.wallet-ctl` with
  Switch to Sepolia and Disconnect.
- Focus: a global `:focus-visible` 2px `--text` outline with a 2px offset (`:112`).
  `prefers-reduced-motion` reduces every animation and transition to near zero (`:864`).

## Do's and Don'ts

- Do start a new page from `.page` > `.top` + `main` + `.foot`, and group content in `.panel`s
  inside `.grid`.
- Do use one `.btn-primary` per group. Everything else is `.btn-ghost`.
- Do report state with the status tokens only (`--spin`, `--idle`, `--offline`). Do not use the
  accent for errors.
- Do keep retained data labelled as a last read whenever a refresh fails. Never show stale chain
  values as live.
- Don't add font sizes outside the six `--fs-*` tokens, uppercase eyebrows, or shadows.
- Don't give the OBS route a page background unless `bg=dark` is set. Don't add wallet UI to it.
- Recipe for one more page: add a hash route in `src/App.tsx`, render `.page` with the existing
  header, put content in `.panel`s, use `.check`/`.source` patterns for settings, and put results
  in a `.status-line`.
