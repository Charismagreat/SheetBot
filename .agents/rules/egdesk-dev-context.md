# EGDesk Development Context

This project is integrated with **EGDesk**.

## Server & Environment Guidelines
- **Port:** The development and hosting server port is **dynamic and variable** depending on the running environment.
- Do not assume or hardcode a specific port (such as 3000, 3002, or 4003).
- Always rely on dynamic request host headers (`request.headers.get("host")`) or user-specified URLs.

## Frontend Optimization & Data Inherit Principles (Zero-Socket-Exhaustion)
1. **Server Unified Bootstrap API (`/api/{feature}/bootstrap`)**:
   - Never dispatch multiple fragmented `queryTable` calls from client components. Always consolidate server-side with 4-second timeout guards and fetch once via `apiFetch`.
2. **Auth Singleton Inheritance (`useAuthAdmin`)**:
   - Inherit auth, session, and admin state from top-level `AuthAdminContext` (`useAuthAdmin`) with 0ms delay. Do not invoke redundant `useAuth()` or `getVisitorGoogleStatus` in child pages or navigation components.
3. **Stable Singleton Functions & Re-fetch Loop Prevention**:
   - Keep `fetchData` callbacks stable with empty or immutable dependencies `[]` by utilizing `useRef` for variable states (`projects.length`, `wallet`, `email`).
   - Equip all data fetchers with `AbortController` to immediately release browser sockets upon subsequent triggers.
4. **On-Demand Subcomponent Loading & Single SSE Hub**:
   - Subcomponents such as floating chat assistants (`EasyBot`) or modals must never issue background network requests or open secondary SSE streams while closed (`!isOpen`).
   - Guard `onUserDataChanged` listeners to ignore empty table handshake events and react only to relevant table modifications.

