import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeSnapshot } from "@loanwick/analysis";

import { extractContract } from "../src/extraction/intake.js";
import { makeTextPdf } from "../src/extraction/pdf-text.js";
import { loadSeededLoans, uploadedFields, uploadSnapshot } from "../src/investigation/upload-snapshot.js";

const loans = loadSeededLoans(resolve(import.meta.dirname, "../../.."));

function contract(serial: string): Buffer {
  return makeTextPdf([
    "LOANWICK DEMO - SYNTHETIC DOCUMENT",
    "COMMERCIAL LOAN COLLATERAL SCHEDULE",
    "Business name: Redwood Warehouse Services",
    "Requested loan amount: USD 180,000.00",
    "Currency: USD",
    "Equipment description: Warehouse forklift",
    `Equipment serial number: ${serial}`,
    "Redwood Warehouse Services claims sole and exclusive ownership of the listed",
    "equipment.",
  ]);
}

describe("uploaded contract comparison", () => {
  it("reports the seeded loans that already claim the uploaded serial number", async () => {
    const extraction = await extractContract("application/pdf", contract("FL-004821"));
    expect(uploadedFields(extraction)).toMatchObject({
      businessName: "Redwood Warehouse Services",
      amountCents: 18000000,
      identifier: "FL-004821",
      exclusiveOwnershipClaim: true,
    });
    const snapshot = uploadSnapshot({ sha256: "a".repeat(64), filename: "01-duplicate-collateral.pdf", extraction, loans });
    const conflict = analyzeSnapshot(snapshot).results.find((result) => result.findingType === "collateral_conflict");
    expect(conflict?.applicationIds).toEqual([snapshot.applicationId, "demo-case-1", "demo-case-2"].sort());
  });

  it("returns no conflict for a serial that no seeded loan claims", async () => {
    const extraction = await extractContract("application/pdf", contract("FL-999999"));
    const snapshot = uploadSnapshot({ sha256: "b".repeat(64), filename: "unique.pdf", extraction, loans });
    expect(analyzeSnapshot(snapshot).results.filter((result) => result.findingType === "collateral_conflict")).toEqual([]);
  });
});
