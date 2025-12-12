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
  opencorporatesBase: "https://api.opencorporates.com",
  opencorporatesApiToken: "",
  nominatimBase: "https://nominatim.openstreetmap.org",
  osmTileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

let recognition;
let isListening = false;
let mapInstance;
let mapMarker;

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
        case "OPENCORPORATES_BASE":
          if (value) appConfig.opencorporatesBase = value;
          break;
        case "OPENCORPORATES_API_TOKEN":
          if (value) appConfig.opencorporatesApiToken = value;
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
    const query = ui.input.value.trim();
    if (!query) {
      setStatus("Please provide a company name.", "warn");
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
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Voice-to-text unavailable; you can still type the company name.", "warn");
    ui.voiceButton.disabled = true;
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

async function searchCompany(query) {
  setStatus("Searching for head office and contract details…");
  ui.results.hidden = true;
  ui.signals.innerHTML = "";
  ui.info.innerHTML = "";

  try {
    const company = await fetchCompanyData(query);
    renderCompany(company);
    setStatus("Found details.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to retrieve company data.", "warn");
  }
}

async function fetchCompanyData(query) {
  try {
    const company = await fetchFromOpenCorporates(query);
    if (company.address) {
      company.geo = await geocodeAddress(company.address);
    }
    return company;
  } catch (error) {
    console.warn("Falling back to mock data:", error);
    const mock = buildMockCompany(query);
    mock.geo = await geocodeAddress(mock.address);
    return mock;
  }
}

async function fetchFromOpenCorporates(query) {
  const base = (appConfig.opencorporatesBase || "https://api.opencorporates.com").replace(/\/$/, "");
  let url = `${base}/companies/search?q=${encodeURIComponent(query)}&per_page=1`;
  if (appConfig.opencorporatesApiToken) {
    url += `&api_token=${encodeURIComponent(appConfig.opencorporatesApiToken)}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Lookup failed (${response.status})`);
  }
  const data = await response.json();
  const first = data?.results?.companies?.[0]?.company;
  if (!first) {
    throw new Error("No matching company found.");
  }

  const address =
    first.registered_address_in_full ||
    (first.registered_address || []).join(", ") ||
    first.registered_address_lines?.join(", ");

  return {
    name: first.name || query,
    address: address || first.address,
    jurisdiction: first.jurisdiction_code,
    incorporationDate: first.incorporation_date,
    companyNumber: first.company_number,
    companyStatus: first.current_status || first.status,
    companyType: first.company_type,
    franchise: inferFranchise(first),
    salesTerritory: inferTerritory(address, appConfig.salesTerritoryKeyword),
    raw: first,
  };
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

function inferFranchise(company) {
  const type = (company.company_type || "").toLowerCase();
  const branch = (company.branch_status || "").toLowerCase();
  if (type.includes("franchise")) {
    return { value: "Yes", reason: "Company type mentions franchise." };
  }
  if (branch.includes("branch")) {
    return { value: "Likely", reason: "Listed as a branch entity." };
  }
  return { value: "Unknown", reason: "Franchise data not provided." };
}

function inferTerritory(address, keyword = "") {
  if (!keyword) {
    return { status: "Unknown", reason: "No territory configured." };
  }
  if (!address) {
    return { status: "Unknown", reason: "Address not available." };
  }
  const hit = address.toLowerCase().includes(keyword.toLowerCase());
  return {
    status: hit ? "Inside" : "Outside",
    reason: hit ? `Address contains ${keyword}.` : `Address missing ${keyword}.`,
  };
}

async function geocodeAddress(address) {
  if (!address) return null;
  const base = (appConfig.nominatimBase || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  const geoUrl = `${base}/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const response = await fetch(geoUrl, {
    headers: {
      "Accept-Language": "en",
      "User-Agent": "HeadOfficeLocator/0.1",
    },
  });
  if (!response.ok) {
    throw new Error("Geocoding failed.");
  }
  const data = await response.json();
  const hit = data?.[0];
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name };
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

