# Head Office Locator
Voice-first, minimal-input web page to locate PTY LTD and NFP head offices and surface contract-ready company details. Uses the Web Speech API for voice capture, OpenCorporates for company search, and OpenStreetMap/Nominatim for geocoding and mapping.

## Features
- One-click voice capture with Web Speech API; text input fallback.
- Automatic search via OpenCorporates (first match) with mock fallback when offline.
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
OPENCORPORATES_BASE=https://api.opencorporates.com
OPENCORPORATES_API_TOKEN=
OPENCORPORATES_JURISDICTION=au
NOMINATIM_BASE=https://nominatim.openstreetmap.org
OSM_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

- Territory keyword: set via env (`TERRITORY_KEYWORD`) or edit `appConfig.salesTerritoryKeyword` in `app.js`.
- Jurisdiction restriction: set `OPENCORPORATES_JURISDICTION=au` to limit searches to Australian companies.
- Data sources:
  - Company search: OpenCorporates search endpoint (`https://api.opencorporates.com/companies/search?q=`). You may swap this out for a paid/commercial source or a backend proxy if rate limits/CORS become an issue.
  - Geocoding: Nominatim (OpenStreetMap). Be mindful of usage limits; for production, use your own instance or a paid geocoder.
- API keys: none are stored. If you integrate paid services, keep keys server-side.

## Notes and next steps
- The franchise flag is heuristic; wire it to a richer data source if available.
- Sales territory status currently checks the configured keyword within the address; replace with your own polygon/geo inclusion logic if needed.
- Add persistence/logging on a backend if you need audit trails or contract attachments.
