# EGDesk Development Context

This project was opened from **EGDesk**. The local dev server port is managed by EGDesk — use the values below.

## Active server

- **Dev server port:** 4002
- **Local preview URL:** http://localhost:4002
- **Server mode:** coding (dev)
- **Project:** C:\dev\SheetBot
- **EGDesk MCP/API:** http://localhost:8080

## Rules for agents

- Do **not** assume the default Next.js port 3000 — EGDesk coding uses the **4000–4099** range.
- When running `npm run dev`, `next dev`, or opening the app in a browser, use **port 4002** (`http://localhost:4002`).
- Do not start a second dev server on a different port unless the user asks.
- EGDesk user-data helpers talk to MCP at `http://localhost:8080` (see `egdesk-helpers.ts` / `.env.local`).

_Updated automatically by EGDesk when this project is opened._
