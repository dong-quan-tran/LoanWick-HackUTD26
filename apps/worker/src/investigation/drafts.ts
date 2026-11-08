import { createHash } from "node:crypto";

import type { AnalysisSnapshot } from "@loanwick/contracts";

import { WorkerRunError } from "../errors.js";

export const CLARIFICATION_TEMPLATES = {
  collateral: {
    borrowerSafeMessage: "Please confirm the equipment you intend to pledge and provide an updated schedule or proof of ownership.",
    documentType: "collateral_schedule",
  },
  financials: {
    borrowerSafeMessage: "Please provide a current financial statement and confirm the reporting period it covers.",
    documentType: "financial_statement",
  },
  supporting: {
    borrowerSafeMessage: "Please clarify the information in your application and provide supporting documentation if available.",
    documentType: "supporting_document",
  },
} as const;

export type ClarificationTemplate = keyof typeof CLARIFICATION_TEMPLATES;

const ALLOWED_MESSAGES = new Set<string>(Object.values(CLARIFICATION_TEMPLATES).map((template) => template.borrowerSafeMessage));

export function clarificationTemplate(value: string): ClarificationTemplate {
  if (value === "collateral" || value === "financials" || value === "supporting") {
    return value;
  }
  throw new WorkerRunError("INVALID_ARGUMENTS", "requestedEvidence must be collateral, financials, or supporting");
}

export function templateForFinding(type: string | undefined): ClarificationTemplate {
  if (type === "group_review_required") {
    return "financials";
  }
  if (type === "collateral_conflict" || type === "collateral_ownership_unknown") {
    return "collateral";
  }
  return "supporting";
}

export function borrowerSafeDraft(template: ClarificationTemplate, foreignNames: readonly string[]) {
  const selected = CLARIFICATION_TEMPLATES[template];
  assertBorrowerSafeMessage(selected.borrowerSafeMessage, foreignNames);
  return {
    sent: false as const,
    state: "draft" as const,
    borrowerSafeMessage: selected.borrowerSafeMessage,
    requestedDocumentType: selected.documentType,
    officerMustSend: true as const,
  };
}

export function assertBorrowerSafeMessage(message: string, foreignNames: readonly string[]): void {
  if (!ALLOWED_MESSAGES.has(message)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "clarification text is not an allowlisted draft");
  }
  for (const name of foreignNames) {
    if (name.length > 0 && message.includes(name)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "clarification draft includes another applicant");
    }
  }
}

export function foreignApplicantNames(snapshot: AnalysisSnapshot): string[] {
  return snapshot.applications
    .filter((application) => application.id !== snapshot.applicationId)
    .map((application) => application.businessName);
}

export function draftRequestId(jobId: string, findingId: string): string {
  const hashed = createHash("sha256").update(`${jobId}/${findingId}`).digest("hex").slice(0, 32);
  return `draft_${hashed}`;
}
