import { analyzeSnapshot } from "@loanwick/analysis";
import type { AnalysisSnapshot, CheckResult } from "@loanwick/contracts";

import { WorkerRunError } from "../errors.js";

const FORBIDDEN_EXPLANATION = [
  /fraud is proven/i,
  /proven fraud/i,
  /approve the loan/i,
  /loan is approved/i,
  /guaranteed safe/i,
  /case is safe/i,
];

export type ClaimedFinding = {
  findingType: string;
  severity: string;
  evidenceIds: readonly string[];
  applicationIds: readonly string[];
  totalCents?: number;
};

// Deterministic check output is the only match that may be stored.
export function findingClaimMismatch(snapshot: AnalysisSnapshot, candidate: ClaimedFinding): string | undefined {
  const same = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
  const match = analyzeSnapshot(snapshot).results.find((result) =>
    result.findingType === candidate.findingType
    && result.severity === candidate.severity
    && same(result.evidenceIds, candidate.evidenceIds)
    && same(result.applicationIds, candidate.applicationIds)
    && (candidate.totalCents === undefined || result.facts.totalCents === candidate.totalCents));
  if (match) {
    return undefined;
  }
  return "finding does not match the deterministic check";
}

export function assertSupportedExplanation(
  summary: string,
  snapshot: AnalysisSnapshot,
  toolOutputs: readonly string[],
): void {
  for (const pattern of FORBIDDEN_EXPLANATION) {
    if (pattern.test(summary)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "explanation claims an outcome the worker cannot decide");
    }
  }
  const authorized = toolOutputs.join("\n");
  for (const evidence of snapshot.evidence) {
    if (summary.includes(evidence.id) && !authorized.includes(evidence.id)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "explanation cites evidence that was not in tool output");
    }
  }
  for (const cited of summary.match(/\bev-[A-Za-z0-9_-]+\b/g) ?? []) {
    if (!authorized.includes(cited)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "explanation cites evidence that was not in tool output");
    }
  }
  for (const cited of summary.match(/\b\d{5,}\b/g) ?? []) {
    if (!authorized.includes(cited)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "explanation cites a number that was not in tool output");
    }
  }
  for (const application of snapshot.applications) {
    if (application.id === snapshot.applicationId) {
      continue;
    }
    if (summary.includes(application.businessName) && !authorized.includes(application.businessName)) {
      throw new WorkerRunError("INVALID_ARGUMENTS", "explanation cites another applicant that was not in tool output");
    }
  }
}

export function deterministicResults(snapshot: AnalysisSnapshot): CheckResult[] {
  return analyzeSnapshot(snapshot).results;
}
