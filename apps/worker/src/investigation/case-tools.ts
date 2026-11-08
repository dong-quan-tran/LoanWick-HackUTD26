import {
  analyzeSnapshot,
  checkCollateralConflicts,
  checkGroupThreshold,
  getPaymentVerificationState,
} from "@loanwick/analysis";
import { ToolArgumentsSchemas, type AnalysisSnapshot } from "@loanwick/contracts";
import { toDatabaseFindings, type DatabaseFindingInput } from "@loanwick/database-adapter";

import { WorkerRunError } from "../errors.js";
import type { ToolDefinition, ToolParameters } from "../provider/types.js";
import { borrowerSafeDraft, clarificationTemplate, foreignApplicantNames } from "./drafts.js";

const TARGET_ONLY: ToolParameters = {
  type: "object",
  properties: {
    applicationId: { type: "string", description: "Claimed application id." },
  },
  additionalProperties: false,
  required: ["applicationId"],
};

const EVIDENCE_PARAMETERS: ToolParameters = {
  type: "object",
  properties: {
    applicationId: { type: "string", description: "Application id in this authorized claim." },
    evidenceIds: {
      type: "array",
      description: "Optional evidence ids to read. Omit them to read a bounded set for that application.",
      items: { type: "string" },
      maxItems: 8,
    },
  },
  additionalProperties: false,
  required: ["applicationId"],
};

const DRAFT_PARAMETERS: ToolParameters = {
  type: "object",
  properties: {
    applicationId: { type: "string", description: "Claimed application id." },
    findingId: { type: "string", description: "Persisted finding id this draft refers to." },
    requestedEvidence: {
      type: "string",
      description: "Allowlisted request: collateral, financials, or supporting.",
      enum: ["collateral", "financials", "supporting"],
    },
  },
  additionalProperties: false,
  required: ["applicationId", "findingId", "requestedEvidence"],
};

export const CASE_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "get_application_summary",
    description: "Read the claimed application's business, amount, currency, stage, and revisions.",
    parameters: TARGET_ONLY,
  },
  {
    name: "get_application_evidence",
    description: "Read bounded evidence excerpts for permitted evidence ids in this claim.",
    parameters: EVIDENCE_PARAMETERS,
  },
  {
    name: "find_related_applications",
    description: "List server-permitted relationships. Confirmed links stay distinct from candidates.",
    parameters: TARGET_ONLY,
  },
  {
    name: "run_collateral_check",
    description: "Run the deterministic equipment-identifier check on this authorized claim.",
    parameters: TARGET_ONLY,
  },
  {
    name: "run_group_threshold_check",
    description: "Run the deterministic confirmed-group threshold check on this authorized claim.",
    parameters: TARGET_ONLY,
  },
  {
    name: "get_payment_verification_state",
    description: "Read the claimed application's payment revision and stored review state.",
    parameters: TARGET_ONLY,
  },
  {
    name: "draft_clarification",
    description: "Prepare an allowlisted borrower question. This never sends it or resolves the finding.",
    parameters: DRAFT_PARAMETERS,
  },
];

const TARGET_TOOLS = new Set([
  "get_application_summary",
  "find_related_applications",
  "run_collateral_check",
  "run_group_threshold_check",
  "get_payment_verification_state",
  "draft_clarification",
]);

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

export function executeCaseTool(
  snapshot: AnalysisSnapshot,
  name: string,
  args: unknown,
  options?: { persistedFindingIds?: readonly string[] },
): unknown {
  if (!(name in ToolArgumentsSchemas)) {
    throw new WorkerRunError("UNKNOWN_TOOL", `rejected tool ${name}`);
  }
  const parsed = ToolArgumentsSchemas[name as keyof typeof ToolArgumentsSchemas].safeParse(args);
  if (!parsed.success) {
    throw new WorkerRunError("INVALID_ARGUMENTS", `${name} arguments do not match the tool schema`);
  }
  const data = parsed.data as {
    applicationId: string;
    evidenceIds?: string[];
    findingId?: string;
    requestedEvidence?: string;
  };
  const applicationId = data.applicationId;
  if (TARGET_TOOLS.has(name)) {
    requireTarget(snapshot, applicationId);
  }

  if (name === "get_application_summary") {
    const application = requireApplication(snapshot, applicationId);
    return {
      id: application.id,
      businessName: application.businessName,
      amountCents: application.amountCents,
      amount: `${application.currency} ${(application.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
    return evidenceExcerpts(snapshot, applicationId, data.evidenceIds);
  }
  if (name === "find_related_applications") {
    return snapshot.relationships
      .filter((item) => item.leftApplicationId === applicationId || item.rightApplicationId === applicationId)
      .map((item) => ({
        id: item.id,
        otherApplicationId: item.leftApplicationId === applicationId ? item.rightApplicationId : item.leftApplicationId,
        decision: item.decision,
        classification: relationshipClass(item.decision),
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
    const reviews = snapshot.reviews.filter((review) => review.applicationId === application.id);
    return {
      applicationId: application.id,
      paymentRevision: application.paymentRevision,
      verification: getPaymentVerificationState(application.paymentRevision, reviews),
    };
  }
  if (name === "draft_clarification") {
    const persisted = options?.persistedFindingIds ?? [];
    if (!persisted.includes(data.findingId ?? "")) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "draft requires a persisted finding");
    }
    if (data.requestedEvidence === undefined) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "requestedEvidence must be collateral, financials, or supporting");
    }
    const template = clarificationTemplate(data.requestedEvidence);
    return borrowerSafeDraft(template, foreignApplicantNames(snapshot));
  }
  throw new WorkerRunError("UNKNOWN_TOOL", `rejected tool ${name}`);
}

export async function databaseFindings(snapshot: AnalysisSnapshot): Promise<DatabaseFindingInput[]> {
  return toDatabaseFindings(snapshot, analyzeSnapshot(snapshot).results);
}

export function safeToolSummary(value: unknown): string {
  return oneLine(JSON.stringify(redactForLog(value)));
}

function evidenceExcerpts(snapshot: AnalysisSnapshot, applicationId: string, evidenceIds: readonly string[] | undefined) {
  requireKnown(snapshot, applicationId);
  const owned = snapshot.evidence.filter((item) => item.applicationId === applicationId);
  const selected = evidenceIds === undefined ? owned.slice(0, 8) : selectRequested(owned, evidenceIds);
  return selected.map((item) => ({
    id: item.id,
    documentId: item.documentId,
    documentVersion: item.documentVersion,
    locator: item.locator,
    pageNumber: item.pageNumber,
    fieldName: item.fieldName,
    extractedValue: item.extractedValue,
    excerpt: oneLine(item.excerpt, 180),
  }));
}

function selectRequested(owned: AnalysisSnapshot["evidence"], evidenceIds: readonly string[]) {
  if (evidenceIds.length > 8) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "evidenceIds exceed the excerpt bound");
  }
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new WorkerRunError("INVALID_ARGUMENTS", "evidenceIds must be unique");
  }
  const byId = new Map(owned.map((item) => [item.id, item]));
  return evidenceIds.map((id) => {
    const item = byId.get(id);
    if (item === undefined) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "evidence id is missing or outside this application");
    }
    return item;
  });
}

function relationshipClass(decision: string): "confirmed" | "candidate" | "rejected" | "other" {
  if (decision === "candidate") {
    return "candidate";
  }
  if (decision === "rejected") {
    return "rejected";
  }
  if (decision.startsWith("confirmed_")) {
    return "confirmed";
  }
  return "other";
}

function publicCheck(result: ReturnType<typeof checkCollateralConflicts>[number]) {
  return {
    findingType: result.findingType,
    severity: result.severity,
    evidenceState: result.evidenceState,
    title: result.title,
    applicationIds: result.applicationIds,
    evidenceIds: result.evidenceIds,
    observedRevisions: result.observedRevisions,
    facts: result.facts,
  };
}

function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item));
  }
  if (value !== null && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "excerpt" || key === "borrowerSafeMessage") {
        continue;
      }
      if (key === "extractedValue" || key === "fieldValue") {
        redacted[key] = "[stored]";
        continue;
      }
      redacted[key] = redactForLog(item);
    }
    return redacted;
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
