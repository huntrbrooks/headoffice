# Head Office Locator
Voice-first, minimal-input web page to locate Australian PTY LTD and NFP head offices and surface contract-ready company details. Uses the Web Speech API for voice capture, ABN Lookup for company search, and OpenStreetMap/Nominatim for geocoding and mapping.

## Features
- One-click voice capture with Web Speech API; text input fallback.
- Automatic search via ABN Lookup (MatchingNames + AbnDetails) with mock fallback when offline or missing GUID.
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
NOMINATIM_BASE=https://nominatim.openstreetmap.org
OSM_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

- Territory keyword: set via env (`TERRITORY_KEYWORD`) or edit `appConfig.salesTerritoryKeyword` in `app.js`.
- ABN Lookup: requires a GUID from ABR; set `ABR_GUID`. Calls use `MatchingNames` then `AbnDetails`.
- ASIC programmatic access requires DSP credentials (EDGE/ELS). Do not embed these in frontend; proxy via backend if needed.
- Data sources:
  - Company search: ABN Lookup JSON (`MatchingNames.aspx`, `AbnDetails.aspx`) with GUID.
  - Geocoding: Nominatim (OpenStreetMap). Be mindful of usage limits; for production, use your own instance or a paid geocoder.
- API keys: ABR GUID required; keep any ASIC credentials server-side.

## Notes and next steps
- The franchise flag is heuristic; wire it to a richer data source (e.g., ASIC backend integration) if available.
- Sales territory status currently checks the configured keyword within the address; replace with your own polygon/geo inclusion logic if needed.
- Add persistence/logging on a backend if you need audit trails or contract attachments.
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
