import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AnalysisSnapshotSchema, type AnalysisSnapshot } from "@loanwick/contracts";

import type { Extraction } from "../extraction/intake.js";

const ASSET_TYPE = "equipment";
const CREATED_AT = "2026-11-08T00:00:00.000Z";
const REVISIONS = { applicationRevision: 1, collateralRevision: 1, paymentRevision: 1 };

export type SeededLoan = {
  id: string;
  businessName: string;
  amountCents: number;
  identifier: string | null;
  exclusiveOwnershipClaim: boolean;
  sourceText: string;
  sourceFile: string;
};

export type UploadedFields = {
  businessName: string | null;
  amountCents: number | null;
  currency: string | null;
  identifier: string | null;
  exclusiveOwnershipClaim: boolean;
};

// The same synthetic cases that seed demo-case-1..8 in the shared database.
export function loadSeededLoans(repoRoot: string): SeededLoan[] {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "fixtures/database/manifest.json"), "utf8")) as {
    cases: { number: number; businessName: string; amountCents: number; identifier: string | null; exclusiveOwnershipClaim: boolean; sourcePath: string }[];
  };
  return manifest.cases.map((item) => {
    const sourceText = readFileSync(join(repoRoot, item.sourcePath), "utf8").replace(/\r\n/g, "\n");
    return {
      id: `demo-case-${item.number}`,
      businessName: item.businessName,
      amountCents: item.amountCents,
      identifier: item.identifier,
      exclusiveOwnershipClaim: item.exclusiveOwnershipClaim,
      sourceText,
      sourceFile: item.sourcePath.split("/").pop() ?? item.sourcePath,
    };
  });
}

export function uploadedFields(extraction: Extraction): UploadedFields {
  const value = (field: string) => extraction.evidence.find((item) => item.fieldName === field)?.fieldValue ?? null;
  const cents = value("amountCents");
  return {
    businessName: value("businessName"),
    amountCents: cents === null || !/^\d+$/.test(cents) ? null : Number(cents),
    currency: value("currency"),
    identifier: value("identifier"),
    exclusiveOwnershipClaim: value("exclusiveOwnershipClaim") === "true",
  };
}

export function uploadSnapshot(input: {
  sha256: string;
  filename: string;
  extraction: Extraction;
  loans: readonly SeededLoan[];
}): AnalysisSnapshot {
  const applicationId = `upload-${input.sha256.slice(0, 12)}`;
  const documentId = `doc-${applicationId}`;
  const fields = uploadedFields(input.extraction);
  const evidence = input.extraction.evidence.map((item, index) => ({
    id: `ev-${applicationId}-${index + 1}`,
    applicationId,
    documentId,
    documentVersion: 1,
    pageNumber: item.extractionMethod === "pdf_text" ? item.pageNumber ?? null : null,
    locator: item.locator,
    excerpt: item.excerpt,
    fieldName: item.fieldName,
    extractedValue: item.fieldValue,
    extractionMethod: item.extractionMethod,
    createdAt: CREATED_AT,
  }));
  const evidenceFor = (field: string) => evidence.find((item) => item.fieldName === field)?.id;
  const identifierEvidence = evidenceFor("identifier");
  const ownershipEvidence = evidenceFor("exclusiveOwnershipClaim");

  const applications = [
    {
      id: applicationId,
      businessName: fields.businessName ?? "Uploaded contract",
      amountCents: fields.amountCents ?? 0,
      currency: fields.currency ?? "USD",
      stage: "reviewing" as const,
      ...REVISIONS,
    },
    ...input.loans.map((loan) => ({
      id: loan.id,
      businessName: loan.businessName,
      amountCents: loan.amountCents,
      currency: "USD",
      stage: "reviewing" as const,
      ...REVISIONS,
    })),
  ];
  const documents = [
    {
      id: documentId,
      applicationId,
      type: "collateral_schedule",
      version: 1,
      sha256: input.sha256,
      displayFilename: input.filename,
      extractionStatus: "succeeded" as const,
      createdAt: CREATED_AT,
      uploadedBy: "officer-upload",
    },
    ...input.loans.map((loan) => ({
      id: `doc-${loan.id}`,
      applicationId: loan.id,
      type: "collateral_schedule",
      version: 1,
      sha256: createHash("sha256").update(loan.sourceText).digest("hex"),
      displayFilename: loan.sourceFile,
      extractionStatus: "succeeded" as const,
      createdAt: CREATED_AT,
      uploadedBy: "borrower-demo",
    })),
  ];
  const loanEvidence = input.loans.flatMap((loan) => {
    if (loan.identifier === null) {
      return [];
    }
    const lines = loan.sourceText.split("\n");
    const index = Math.max(0, lines.findIndex((text) => text.includes(loan.identifier ?? "")));
    const base = { applicationId: loan.id, documentId: `doc-${loan.id}`, documentVersion: 1, pageNumber: null, locator: `line ${index + 1}`, excerpt: lines[index] ?? loan.sourceText.trim(), extractionMethod: "fixture" as const, createdAt: CREATED_AT };
    return [
      { ...base, id: `ev-${loan.id}-identifier`, fieldName: "identifier", extractedValue: loan.identifier },
      ...(loan.exclusiveOwnershipClaim
        ? [{ ...base, id: `ev-${loan.id}-ownership`, fieldName: "exclusiveOwnershipClaim", extractedValue: "true" }]
        : []),
    ];
  });
  const collateral = [
    ...(fields.identifier === null || identifierEvidence === undefined
      ? []
      : [{
          id: `asset-${applicationId}`,
          applicationId,
          assetType: ASSET_TYPE,
          identifier: fields.identifier,
          description: "Equipment listed in the uploaded contract",
          exclusiveOwnershipClaim: ownershipEvidence === undefined ? null : true,
          active: true,
          evidenceIds: [identifierEvidence],
          ownershipEvidenceIds: ownershipEvidence === undefined ? [] : [ownershipEvidence],
        }]),
    ...input.loans.flatMap((loan) => loan.identifier === null ? [] : [{
      id: `asset-${loan.id}`,
      applicationId: loan.id,
      assetType: ASSET_TYPE,
      identifier: loan.identifier,
      description: `Equipment on file for ${loan.businessName}`,
      exclusiveOwnershipClaim: loan.exclusiveOwnershipClaim,
      active: true,
      evidenceIds: [`ev-${loan.id}-identifier`],
      ownershipEvidenceIds: loan.exclusiveOwnershipClaim ? [`ev-${loan.id}-ownership`] : [],
    }]),
  ];
  return AnalysisSnapshotSchema.parse({
    applicationId,
    applications,
    documents,
    evidence: [...evidence, ...loanEvidence],
    collateral,
    relationships: [],
    reviews: [],
  });
}
