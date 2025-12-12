import { safeQuery, inferFranchise, inferTerritory, buildAbrAddress, extractAbrMatch } from "./logic.js";

const ui = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("companyInput"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  name: document.getElementById("resultName"),
  number: document.getElementById("resultNumber"),
  address: document.getElementById("resultAddress"),
  jurisdiction: document.getElementById("resultJurisdiction"),
  incorp: document.getElementById("resultIncorp"),
  signals: document.getElementById("signalsList"),
  info: document.getElementById("infoList"),
  map: document.getElementById("map"),
  franchiseBadge: document.getElementById("franchiseBadge"),
  territoryBadge: document.getElementById("territoryBadge"),
  voiceButton: document.getElementById("voiceButton"),
};

const appConfig = {
  salesTerritoryKeyword: "Australia", // adjust to your territory string
  abrJsonBase: "https://abr.business.gov.au/json",
  abrGuid: "",
  apiProxyBase: "",
  nominatimBase: "https://nominatim.openstreetmap.org",
  osmTileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

let recognition;
let isListening = false;
let mapInstance;
let mapMarker;
const state = {
  loading: false,
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

document.addEventListener("DOMContentLoaded", () => {
  initialize();
});

async function initialize() {
  await loadEnvIntoConfig();
  bindEvents();
  initSpeech();
}

async function loadEnvIntoConfig() {
  const candidates = [".env.local", "env.local"];
  for (const file of candidates) {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) continue;
      const text = await response.text();
      applyEnvText(text);
      setStatus("Loaded configuration.", "info");
      return;
    } catch (error) {
      console.warn(`Skipping env candidate ${file}`, error);
    }
  }
  setStatus("Using built-in defaults (no .env.local found).", "info");
}

function applyEnvText(text) {
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      const value = rest.join("=").trim();
      if (!key) return;
      switch (key) {
        case "TERRITORY_KEYWORD":
          if (value) appConfig.salesTerritoryKeyword = value;
          break;
        case "ABR_JSON_BASE":
          if (value) appConfig.abrJsonBase = value;
          break;
        case "ABR_GUID":
          if (value) appConfig.abrGuid = value;
          break;
        case "API_PROXY_BASE":
          if (value) appConfig.apiProxyBase = value;
          break;
        case "NOMINATIM_BASE":
          if (value) appConfig.nominatimBase = value;
          break;
        case "OSM_TILE_URL":
          if (value) appConfig.osmTileUrl = value;
          break;
        default:
          break;
      }
    });
}

function bindEvents() {
  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = safeQuery(ui.input.value);
    if (!query) {
      setStatus("Please provide a company name (max 140 chars).", "warn");
      return;
    }
    searchCompany(query);
  });

  ui.voiceButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (!recognition) {
      setStatus("Voice input is not supported in this browser.", "warn");
      return;
    }
    toggleListening();
  });
}

function initSpeech() {
  const isSecure = window.isSecureContext || location.hostname === "localhost" || location.hostname.startsWith("127.");
  if (!isSecure) {
    setStatus("Voice requires HTTPS or localhost; please use a secure origin.", "warn");
    ui.voiceButton.disabled = true;
    ui.voiceButton.dataset.locked = "true";
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Voice-to-text unavailable; you can still type the company name.", "warn");
    ui.voiceButton.disabled = true;
    ui.voiceButton.dataset.locked = "true";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    ui.voiceButton.textContent = "Listening… click to stop";
    setStatus("Listening for company name…");
  };

  recognition.onend = () => {
    isListening = false;
    ui.voiceButton.textContent = "🎤 Start voice search";
    setStatus("Stopped listening.");
  };

  recognition.onerror = (event) => {
    isListening = false;
    setStatus(`Voice error: ${event.error}`, "warn");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    ui.input.value = transcript;
    setStatus(`Captured: “${transcript}”. Searching…`);
    searchCompany(transcript);
  };
}

function toggleListening() {
  if (isListening) {
    recognition.stop();
    return;
  }
  recognition.start();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(base) {
  return base + Math.floor(Math.random() * 150);
}

async function fetchWithRetry(url, options = {}, attempts = 3, baseDelay = 600) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await delay(withJitter(baseDelay * (i + 1)));
      }
    }
  }
  throw lastError || new Error("Network error");
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expires && Date.now() > parsed.expires) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch (error) {
    console.warn("Cache get failed", error);
    return null;
  }
}

function cacheSet(key, value, ttl = CACHE_TTL_MS) {
  try {
    const expires = Date.now() + ttl;
    localStorage.setItem(key, JSON.stringify({ value, expires }));
  } catch (error) {
    console.warn("Cache set failed", error);
  }
}

async function searchCompany(query) {
  setLoading(true, "Searching for head office and contract details…");
  ui.results.hidden = true;
  ui.signals.innerHTML = "";
  ui.info.innerHTML = "";

  try {
    const company = await fetchCompanyData(query);
    if (!company) {
      setStatus("No matching Australian company found.", "warn");
      setLoading(false);
      return;
    }
    renderCompany(company);
    setStatus("Found details.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to retrieve company data.", "error");
  } finally {
    setLoading(false);
  }
}

async function fetchCompanyData(query) {
  const cacheKey = `abr:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    if (cached.address && !cached.geo) {
      cached.geo = await geocodeAddress(cached.address);
    }
    return cached;
  }

  try {
    const useProxy = Boolean(appConfig.apiProxyBase);
    const company = useProxy ? await fetchFromProxy(query) : await fetchFromAbr(query);
    if (company.address) {
      company.geo = await geocodeAddress(company.address);
    }
    cacheSet(cacheKey, company);
    return company;
  } catch (error) {
    console.warn("Falling back to mock data:", error);
    const mock = buildMockCompany(query);
    mock.geo = await geocodeAddress(mock.address);
    return mock;
  }
}

async function fetchFromAbr(query) {
  const base = (appConfig.abrJsonBase || "https://abr.business.gov.au/json").replace(/\/$/, "");
  const guid = appConfig.abrGuid?.trim();
  if (!guid) {
    throw new Error("ABR GUID is required. Set ABR_GUID in .env.local.");
  }

  const matchUrl = `${base}/MatchingNames.aspx?name=${encodeURIComponent(query)}&maxResults=1&guid=${encodeURIComponent(
    guid
  )}`;
  const matchResp = await fetchWithRetry(matchUrl, {}, 3, 700);
  const matchData = await matchResp.json();
  const match = extractAbrMatch(matchData);
  if (!match?.Abn) {
    throw new Error("No matching Australian company found via ABN Lookup.");
  }

  await delay(400); // be courteous to ABR services

  const detailUrl = `${base}/AbnDetails.aspx?abn=${encodeURIComponent(match.Abn)}&guid=${encodeURIComponent(guid)}`;
  const detailResp = await fetchWithRetry(detailUrl, {}, 3, 700);
  const details = await detailResp.json();

  const address = buildAbrAddress(details);

  return {
    name: details?.EntityName || match?.Name || query,
    address,
    jurisdiction: "au",
    incorporationDate: details?.Gst?.EffectiveFrom || details?.AbnStatusEffectiveFrom,
    companyNumber: match.Abn,
    companyStatus: details?.AbnStatus || "Unknown",
    companyType: details?.EntityTypeName || "Australian Entity",
    franchise: { value: "Unknown", reason: "Franchise data not provided by ABR." },
    salesTerritory: inferTerritory(address, appConfig.salesTerritoryKeyword),
    raw: { match, details },
  };
}

async function fetchFromProxy(query) {
  const base = (appConfig.apiProxyBase || "").replace(/\/$/, "");
  const url = `${base}/search?q=${encodeURIComponent(query)}`;
  const resp = await fetchWithRetry(url, {}, 3, 700);
  const data = await resp.json();
  if (!data?.name) {
    throw new Error(data?.error || "Proxy search failed.");
  }
  return data;
}

function buildMockCompany(query) {
  return {
    name: query || "Sample Pty Ltd",
    address: "321 Sample Street, Sydney NSW, Australia",
    jurisdiction: "au",
    incorporationDate: "2019-07-12",
    companyNumber: "MOCK-0001",
    companyStatus: "Active",
    companyType: "Proprietary",
    franchise: { value: "Unknown", reason: "Not supplied by data source." },
    salesTerritory: inferTerritory("Sydney Australia", appConfig.salesTerritoryKeyword),
    raw: { source: "mock" },
  };
}

async function geocodeAddress(address) {
  if (!address) return null;
  const cacheKey = `geo:${address.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const proxyBase = appConfig.apiProxyBase && appConfig.apiProxyBase.replace(/\/$/, "");
  const base = proxyBase || (appConfig.nominatimBase || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  const geoUrl = proxyBase
    ? `${base}/geocode?address=${encodeURIComponent(address)}`
    : `${base}/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const response = await fetchWithRetry(
    geoUrl,
    {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "HeadOfficeLocator/0.1",
      },
    },
    3,
    800
  );
  const data = await response.json();
  const hit = proxyBase ? data : data?.[0];
  if (!hit) return null;
  const geo = proxyBase
    ? { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.label || hit.display_name || address }
    : { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name };
  cacheSet(cacheKey, geo, CACHE_TTL_MS);
  return geo;
}

function renderCompany(company) {
  ui.name.textContent = company.name || "—";
  ui.number.textContent = [company.companyNumber, company.companyStatus].filter(Boolean).join(" • ");
  ui.address.textContent = company.address || "Head office address unavailable.";
  ui.jurisdiction.textContent = company.jurisdiction ? `Jurisdiction: ${company.jurisdiction}` : "";
  ui.incorp.textContent = company.incorporationDate ? `Incorporated: ${company.incorporationDate}` : "";

  updateFranchiseBadge(company.franchise);
  updateTerritoryBadge(company.salesTerritory);
  populateSignals(company);
  populateInfo(company);
  renderMap(company);

  ui.results.hidden = false;
}

function updateFranchiseBadge(franchise = { value: "Unknown" }) {
  ui.franchiseBadge.textContent = `Franchise: ${franchise.value || "Unknown"}`;
  ui.franchiseBadge.classList.remove("yes", "no");
  if (franchise.value === "Yes") {
    ui.franchiseBadge.classList.add("yes");
  } else if (franchise.value === "No") {
    ui.franchiseBadge.classList.add("no");
  }
}

function updateTerritoryBadge(territory = { status: "Unknown" }) {
  ui.territoryBadge.textContent = `Territory: ${territory.status || "Unknown"}`;
  ui.territoryBadge.classList.remove("yes", "outside");
  if (territory.status === "Inside") {
    ui.territoryBadge.classList.add("yes");
  } else if (territory.status === "Outside") {
    ui.territoryBadge.classList.add("outside");
  }
}

function populateSignals(company) {
  const signals = [
    company.address ? "Head office located." : "Head office address missing.",
    company.salesTerritory?.reason,
    company.franchise?.reason,
    company.companyStatus ? `Status: ${company.companyStatus}` : null,
  ].filter(Boolean);

  ui.signals.innerHTML = "";
  signals.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    ui.signals.appendChild(li);
  });
}

function populateInfo(company) {
  const entries = [
    ["Company type", company.companyType],
    ["Jurisdiction", company.jurisdiction],
    ["Company number", company.companyNumber],
    ["Incorporation date", company.incorporationDate],
    ["Raw source", company.raw?.source || "OpenCorporates"],
  ];
  ui.info.innerHTML = "";
  entries
    .filter(([, value]) => Boolean(value))
    .forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      ui.info.append(dt, dd);
    });
}

function renderMap(company) {
  if (!company.geo) {
    ui.map.innerHTML = "<p class='hint'>Map unavailable for this address.</p>";
    return;
  }

  if (!mapInstance) {
    mapInstance = L.map(ui.map).setView([company.geo.lat, company.geo.lon], 12);
    L.tileLayer(appConfig.osmTileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(mapInstance);
  } else {
    mapInstance.setView([company.geo.lat, company.geo.lon], 12);
  }

  if (mapMarker) {
    mapMarker.remove();
  }

  mapMarker = L.marker([company.geo.lat, company.geo.lon]).addTo(mapInstance);
  mapMarker.bindPopup(`<strong>${company.name}</strong><br>${company.address}`).openPopup();
}

function setStatus(message, tone = "info") {
  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
}

function setLoading(loading, message) {
  state.loading = loading;
  ui.form.querySelectorAll("input, button").forEach((el) => {
    el.disabled = loading;
  });
  const locked = ui.voiceButton.dataset.locked === "true";
  ui.voiceButton.disabled = locked || loading;
  ui.results.setAttribute("aria-busy", loading ? "true" : "false");
  if (loading && message) {
    setStatus(message, "info");
  }
}

