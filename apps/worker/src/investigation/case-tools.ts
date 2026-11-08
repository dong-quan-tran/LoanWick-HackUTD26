import {
  analyzeSnapshot,
  checkCollateralConflicts,
  checkGroupThreshold,
  getPaymentVerificationState,
} from "@loanwick/analysis";
import type { AnalysisSnapshot } from "@loanwick/contracts";
import { toDatabaseFindings, type DatabaseFindingInput } from "@loanwick/database-adapter";

import { WorkerRunError } from "../errors.js";
import type { ToolDefinition } from "../provider/types.js";

const TARGET_ONLY = {
  type: "object",
  properties: {
    applicationId: { type: "string", description: "Claimed application id." },
  },
  additionalProperties: false,
  required: ["applicationId"],
} as const;

export const CASE_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "get_application_summary",
    description: "Read the claimed application's business, amount, currency, stage, and revisions.",
    parameters: TARGET_ONLY,
  },
  {
    name: "get_application_evidence",
    description: "Read bounded evidence excerpts for an application in this claim.",
    parameters: {
      type: "object",
      properties: {
        applicationId: { type: "string", description: "Application id in this claim." },
      },
      additionalProperties: false,
      required: ["applicationId"],
    },
  },
  {
    name: "find_related_applications",
    description: "List confirmed relationships already present in this claim.",
    parameters: TARGET_ONLY,
  },
  {
    name: "run_collateral_check",
    description: "Compare equipment identifiers and exclusive ownership claims across this claim.",
    parameters: TARGET_ONLY,
  },
  {
    name: "run_group_threshold_check",
    description: "Sum confirmed related applications and compare the total with the review threshold.",
    parameters: TARGET_ONLY,
  },
  {
    name: "get_payment_verification_state",
    description: "Read the stored payment-review state for the claimed application.",
    parameters: TARGET_ONLY,
  },
  {
    name: "draft_clarification",
    description: "Draft a borrower-safe question. This does not send the question.",
    parameters: {
      type: "object",
      properties: {
        applicationId: { type: "string", description: "Claimed application id." },
        findingId: { type: "string", description: "Finding id this draft refers to." },
        requestedEvidence: {
          type: "string",
          description: "One of collateral, financials, or supporting.",
        },
      },
      additionalProperties: false,
      required: ["applicationId", "findingId", "requestedEvidence"],
    },
  },
];

const DRAFTS = {
  collateral: "Please send a current equipment list that shows what this business owns.",
  financials: "Please send a current financial statement for this application.",
  supporting: "Please send a supporting document for this application.",
} as const;

export type CaseToolEvent = {
  toolName: string;
  status: "succeeded" | "failed";
  inputSummary: string;
  outputSummary: string;
  modelContent: string;
  durationMs: number;
};

export function oneLine(value: string, max = 280): string {
  const flat = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  return flat.slice(0, max);
}

export function executeCaseTool(snapshot: AnalysisSnapshot, name: string, args: unknown): unknown {
  const record = argumentRecord(args);
  const applicationId = requiredId(record, "applicationId");
  if (name === "get_application_summary" || name === "run_collateral_check" || name === "run_group_threshold_check" || name === "get_payment_verification_state" || name === "find_related_applications") {
    requireTarget(snapshot, applicationId);
  }
  if (name === "get_application_summary") {
    const application = requireApplication(snapshot, applicationId);
    return {
      id: application.id,
      businessName: application.businessName,
      amountCents: application.amountCents,
      currency: application.currency,
      stage: application.stage,
      revisions: {
        applicationRevision: application.applicationRevision,
        collateralRevision: application.collateralRevision,
        paymentRevision: application.paymentRevision,
      },
    };
  }
  if (name === "get_application_evidence") {
    requireKnown(snapshot, applicationId);
    return snapshot.evidence
      .filter((item) => item.applicationId === applicationId)
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        fieldName: item.fieldName,
        extractedValue: item.extractedValue,
        excerpt: oneLine(item.excerpt, 180),
      }));
  }
  if (name === "find_related_applications") {
    return snapshot.relationships
      .filter((item) => item.leftApplicationId === applicationId || item.rightApplicationId === applicationId)
      .map((item) => ({
        id: item.id,
        leftApplicationId: item.leftApplicationId,
        rightApplicationId: item.rightApplicationId,
        decision: item.decision,
        evidenceIds: item.evidenceIds,
      }));
  }
  if (name === "run_collateral_check") {
    return checkCollateralConflicts(snapshot).map(publicCheck);
  }
  if (name === "run_group_threshold_check") {
    return checkGroupThreshold(snapshot).map(publicCheck);
  }
  if (name === "get_payment_verification_state") {
    const application = requireApplication(snapshot, applicationId);
    return getPaymentVerificationState(application.paymentRevision, snapshot.reviews);
  }
  if (name === "draft_clarification") {
    requireTarget(snapshot, applicationId);
    requiredId(record, "findingId");
    const requested = record.requestedEvidence;
    if (requested !== "collateral" && requested !== "financials" && requested !== "supporting") {
      throw new WorkerRunError("INVALID_ARGUMENTS", "requestedEvidence must be collateral, financials, or supporting");
    }
    return { sent: false, borrowerSafeMessage: DRAFTS[requested] };
  }
  throw new WorkerRunError("UNKNOWN_TOOL", `rejected tool ${name}`);
}

export async function databaseFindings(snapshot: AnalysisSnapshot): Promise<DatabaseFindingInput[]> {
  return toDatabaseFindings(snapshot, analyzeSnapshot(snapshot).results);
}

function publicCheck(result: ReturnType<typeof checkCollateralConflicts>[number]) {
  return {
    findingType: result.findingType,
    severity: result.severity,
    title: result.title,
    applicationIds: result.applicationIds,
    evidenceIds: result.evidenceIds,
    facts: result.facts,
  };
}

function argumentRecord(args: unknown): Record<string, unknown> {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "tool arguments must be an object");
  }
  return args as Record<string, unknown>;
}

function requiredId(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", `${key} is not a valid id`);
  }
  return value;
}

function requireTarget(snapshot: AnalysisSnapshot, applicationId: string): void {
  if (applicationId !== snapshot.applicationId) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "tool is limited to the claimed application");
  }
}

function requireKnown(snapshot: AnalysisSnapshot, applicationId: string): void {
  if (!snapshot.applications.some((item) => item.id === applicationId)) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "application is outside this claim");
  }
}

function requireApplication(snapshot: AnalysisSnapshot, applicationId: string) {
  const application = snapshot.applications.find((item) => item.id === applicationId);
  if (application === undefined) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "application is outside this claim");
  }
  return application;
}
