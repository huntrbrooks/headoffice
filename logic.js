// Pure helper functions to enable testing without DOM.

export function safeQuery(input) {
  if (!input) return "";
  return input.trim().slice(0, 140);
}

export function inferFranchise(company) {
  const type = (company?.company_type || company?.EntityTypeName || "").toLowerCase();
  const branch = (company?.branch_status || "").toLowerCase();
  if (type.includes("franchise")) {
    return { value: "Yes", reason: "Company type mentions franchise." };
  }
  if (branch.includes("branch")) {
    return { value: "Likely", reason: "Listed as a branch entity." };
  }
  return { value: "Unknown", reason: "Franchise data not provided." };
}

export function inferTerritory(address, keyword = "") {
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

export function extractAbrMatch(matchData) {
  const names = matchData?.Names || matchData?.names || [];
  if (Array.isArray(names) && names.length > 0) return names[0];
  if (matchData?.Name) return matchData;
  return null;
}

export function buildAbrAddress(details) {
  const addr =
    details?.MainBusinessPhysicalAddress?._ || details?.MainBusinessPhysicalAddress || details?.MainBusinessPhysicalAddress?._value;
  if (!addr || typeof addr === "string") {
    return addr || "";
  }
  const parts = [
    addr?.StreetNumber && addr.StreetNumber,
    addr?.StreetName && addr.StreetName,
    addr?.StreetType && addr.StreetType,
    addr?.Suburb && addr.Suburb,
    addr?.StateCode && addr.StateCode,
    addr?.Postcode && addr.Postcode,
    "Australia",
  ]
    .filter(Boolean)
    .join(" ");
  return parts.trim();
}

