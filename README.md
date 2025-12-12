# Head Office Locator
Voice-first, minimal-input web page to locate Australian PTY LTD and NFP head offices and surface contract-ready company details. Uses the Web Speech API for voice capture, ABN Lookup for company search, optional same-origin proxy for hiding the GUID, and OpenStreetMap/Nominatim for geocoding and mapping.

## Features
- One-click voice capture with Web Speech API; text input fallback and secure-context guard.
- Automatic search via ABN Lookup (MatchingNames + AbnDetails) with mock fallback when offline or missing GUID; local caching and retry/backoff for free-tier friendliness.
- Optional same-origin proxy to keep ABR GUID server-side and add response caching.
- Head office address display plus Leaflet map (OpenStreetMap tiles).
- Contract cues: franchise heuristic, sales territory check (configurable keyword), status/company type/number.
- Additional details section and inline status messaging.

## Running locally
No build step needed. Serve the folder over HTTP so browser voice and fetch APIs work:

```bash
# from repo root
python3 -m http.server 5173
# then open http://localhost:5173
```

Alternatively use any static server (`npx serve .`, etc.).

## Configuration
- Env file: create `.env.local` (or `env.local` for static hosting that blocks dotfiles). Example:

```
TERRITORY_KEYWORD=Australia
ABR_JSON_BASE=https://abr.business.gov.au/json
ABR_GUID=PUT_YOUR_ABR_GUID_HERE
API_PROXY_BASE=
NOMINATIM_BASE=https://nominatim.openstreetmap.org
OSM_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

- Territory keyword: set via env (`TERRITORY_KEYWORD`) or edit `appConfig.salesTerritoryKeyword` in `app.js`.
- ABN Lookup: requires a GUID from ABR; set `ABR_GUID`. Calls use `MatchingNames` then `AbnDetails`.
- Optional proxy: set `API_PROXY_BASE` to your proxy origin (e.g., `http://localhost:8788/api` when running `node server.js`); the proxy keeps the GUID server-side and adds caching.
- ASIC programmatic access requires DSP credentials (EDGE/ELS). Do not embed these in frontend; proxy via backend if needed.
- Data sources:
  - Company search: ABN Lookup JSON (`MatchingNames.aspx`, `AbnDetails.aspx`) with GUID.
  - Geocoding: Nominatim (OpenStreetMap). Be mindful of usage limits; for production, use your own instance or a paid geocoder.
- API keys: ABR GUID required; keep any ASIC credentials server-side.

## Security
- CSP is defined in `index.html` to restrict script/style/connect targets to required domains (ABR, Nominatim, OSM, Leaflet CDN, Google Fonts). Adjust if you change providers.
- Voice requires HTTPS or localhost; microphone permission prompts remain client-side.
- Input is trimmed and capped at 140 chars before requests.
- Keep ABR GUID out of the frontend by using the optional proxy where possible.

## Optional proxy (server.js)
- Run: `ABR_GUID=your-guid node server.js` (defaults to port 8788).
- Configure the frontend with `API_PROXY_BASE=http://localhost:8788/api` to route search/geocode via the proxy.
- The proxy caches responses in memory and adds retry/backoff; CORS is open for testing. Harden before production (auth/rate limit).

## Testing
- Pure-function tests: `node --test tests/logic.test.mjs`
- Manual: voice (Chrome) on HTTPS/localhost; slow network; map tile load; mobile viewport.

## Deployment
- Static hosting (no proxy): deploy the static files (`index.html`, `app.js`, `styles.css`, `logic.js`). Provide `ABR_GUID` via an env-served file or switch to the proxy to avoid exposing it.
- With proxy: deploy `server.js` (e.g., on Render/Fly/Vercel functions) and point `API_PROXY_BASE` to it; keep `ABR_GUID` only on the server.
- Ensure HTTPS for voice/mic. Adjust CSP in `index.html` if you change domains/providers.
- Set caching headers: long TTL for static assets; short/medium TTL for proxy responses if used.

## Notes and next steps
- The franchise flag is heuristic; wire it to a richer data source (e.g., ASIC backend integration) if available.
- Sales territory status currently checks the configured keyword within the address; replace with your own polygon/geo inclusion logic if needed.
- Add persistence/logging on a backend if you need audit trails or contract attachments.
