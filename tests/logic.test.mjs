import test from "node:test";
import assert from "node:assert/strict";
import { safeQuery, inferTerritory, inferFranchise, buildAbrAddress, extractAbrMatch } from "../logic.js";

test("safeQuery trims and caps length", () => {
  const input = "  Example Pty Ltd ".padEnd(200, "x");
  const result = safeQuery(input);
  assert.equal(result.startsWith("Example Pty Ltd"), true);
  assert.equal(result.length <= 140, true);
});

test("inferTerritory detects inside/outside", () => {
  const inside = inferTerritory("123 Main St, Sydney NSW Australia", "Australia");
  assert.equal(inside.status, "Inside");
  const outside = inferTerritory("123 Main St, Auckland NZ", "Australia");
  assert.equal(outside.status, "Outside");
});

test("inferFranchise detects franchise keyword", () => {
  const res = inferFranchise({ company_type: "Franchise Pty Ltd" });
  assert.equal(res.value, "Yes");
});

test("buildAbrAddress assembles structured address", () => {
  const addr = buildAbrAddress({
    MainBusinessPhysicalAddress: {
      StreetNumber: "10",
      StreetName: "George",
      StreetType: "St",
      Suburb: "Sydney",
      StateCode: "NSW",
      Postcode: "2000",
    },
  });
  assert.equal(addr.includes("George"), true);
  assert.equal(addr.includes("NSW"), true);
});

test("extractAbrMatch returns first match", () => {
  const match = extractAbrMatch({ Names: [{ Abn: "123", Name: "Example" }] });
  assert.equal(match.Abn, "123");
});

