# EGDesk Development Context

This project was opened from **EGDesk**. The local dev server port is managed by EGDesk — use the values below.

## Active server

- **Dev server port:** 3002
- **Local preview URL:** http://localhost:3002
- **Server mode:** hosting (production)
- **Project:** C:\dev\SheetBot
- **EGDesk MCP/API:** http://localhost:8080

## Rules for agents

- Production/hosting mode uses the **3000–3099** range (default 3000).
- When running `npm run dev`, `next dev`, or opening the app in a browser, use **port 3002** (`http://localhost:3002`).
- Do not start a second dev server on a different port unless the user asks.
- EGDesk user-data helpers talk to MCP at `http://localhost:8080` (see `egdesk-helpers.ts` / `.env.local`).

_Updated automatically by EGDesk when this project is opened._
