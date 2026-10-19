# QR codes (`qrcode` library)

`QrCodeImage.tsx` renders QR codes **in the browser** with the [`qrcode`](https://www.npmjs.com/package/qrcode) npm package
(`qrcode` + `@types/qrcode` in `package.json`).

## Why

The manager-phone pairing QR contains a one-time token. Earlier admin pages build QR images through
`https://api.qrserver.com/...`, which sends the encoded value to a third party. `QrCodeImage` never does.

## Usage

```tsx
import QrCodeImage from "./QrCodeImage";

<QrCodeImage value={pairing.qrData} size={220} alt="Manager app pairing QR" />
```

| Prop | Default | Notes |
|---|---|---|
| `value` | – | String to encode |
| `size` | `220` | Width/height in px |
| `alt` | `"QR code"` | |
| `className` | – | Applied to the `<img>` |

Renders a data URL (error correction level `M`, 2-module margin). It is a client component, so use it only from
`"use client"` files.

## Where it is used

- `AdminManagerDevicesCard.tsx` – manager phone pairing QR (`sheetbot-manager://pair?server=...&token=...`).

## Migrating other pages

`deposit-agent/page.tsx` and `notifications/page.tsx` still use `api.qrserver.com`; swap the `<img src=...>` for
`<QrCodeImage value=... />` when convenient (not done yet).
