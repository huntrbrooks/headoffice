// Lightweight optional proxy to keep ABR GUID server-side and add caching.
// Usage: ABR_GUID=your-guid node server.js
import http from "node:http";
import { URL } from "node:url";

const port = process.env.PORT || 8788;
const abrGuid = process.env.ABR_GUID || "";
const abrBase = (process.env.ABR_JSON_BASE || "https://abr.business.gov.au/json").replace(/\/$/, "");
const nominatimBase = (process.env.NOMINATIM_BASE || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const cacheTtlMs = 30 * 60 * 1000;

const memoryCache = new Map();

function cacheGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  memoryCache.set(key, { value, expires: Date.now() + cacheTtlMs });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, attempts = 3, baseDelay = 400) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await delay(baseDelay * (i + 1));
      }
    }
  }
  throw lastError || new Error("Network error");
}

async function handleSearch(q) {
  if (!abrGuid) {
    return { status: 500, body: { error: "ABR_GUID missing on server" } };
  }

  const cacheKey = `abr:${q.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { status: 200, body: cached };

  const matchUrl = `${abrBase}/MatchingNames.aspx?name=${encodeURIComponent(q)}&maxResults=1&guid=${encodeURIComponent(abrGuid)}`;
  const matchResp = await fetchWithRetry(matchUrl, {}, 3, 600);
  const matchData = await matchResp.json();
  const names = matchData?.Names || matchData?.names || [];
  const match = Array.isArray(names) && names.length ? names[0] : matchData?.Name ? matchData : null;
  if (!match?.Abn) {
    return { status: 404, body: { error: "No matching Australian company found via ABN Lookup." } };
  }

  await delay(300);

  const detailUrl = `${abrBase}/AbnDetails.aspx?abn=${encodeURIComponent(match.Abn)}&guid=${encodeURIComponent(abrGuid)}`;
  const detailResp = await fetchWithRetry(detailUrl, {}, 3, 600);
  const details = await detailResp.json();

  const addr = details?.MainBusinessPhysicalAddress || details?.MainBusinessPhysicalAddress?._;
  const address =
    typeof addr === "string"
      ? addr
      : [
          addr?.StreetName && addr.StreetName,
          addr?.StreetType && addr.StreetType,
          addr?.Suburb && addr.Suburb,
          addr?.StateCode && addr.StateCode,
          addr?.Postcode && addr.Postcode,
          "Australia",
        ]
          .filter(Boolean)
          .join(" ");

  const payload = {
    name: details?.EntityName || match?.Name || q,
    address: address || "",
    jurisdiction: "au",
    incorporationDate: details?.Gst?.EffectiveFrom || details?.AbnStatusEffectiveFrom,
    companyNumber: match.Abn,
    companyStatus: details?.AbnStatus || "Unknown",
    companyType: details?.EntityTypeName || "Australian Entity",
    franchise: { value: "Unknown", reason: "Franchise data not provided by ABR." },
    salesTerritory: null,
    raw: { match, details },
  };

  cacheSet(cacheKey, payload);
  return { status: 200, body: payload };
}

async function handleGeocode(address) {
  const cacheKey = `geo:${address.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { status: 200, body: cached };

  const geoUrl = `${nominatimBase}/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const res = await fetchWithRetry(
    geoUrl,
    {
      headers: { "Accept-Language": "en", "User-Agent": "HeadOfficeLocator/0.1" },
    },
    3,
    800
  );
  const data = await res.json();
  const hit = data?.[0];
  if (!hit) return { status: 404, body: { error: "No geocode result" } };
  const geo = { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name };
  cacheSet(cacheKey, geo);
  return { status: 200, body: geo };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  try {
    if (url.pathname === "/api/search") {
      const q = url.searchParams.get("q") || "";
      if (!q) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Missing q" }));
        return;
      }
      const result = await handleSearch(q);
      res.writeHead(result.status, { "Content-Type": "application/json" }).end(JSON.stringify(result.body));
      return;
    }

    if (url.pathname === "/api/geocode") {
      const address = url.searchParams.get("address") || "";
      if (!address) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Missing address" }));
        return;
      }
      const result = await handleGeocode(address);
      res.writeHead(result.status, { "Content-Type": "application/json" }).end(JSON.stringify(result.body));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message || "Server error" }));
  }
});

server.listen(port, () => {
  console.log(`Proxy running on http://localhost:${port}`);
});

