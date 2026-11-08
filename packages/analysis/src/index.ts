import { CHECK_TYPES } from '@loanwick/contracts/domain';
import type { AnalysisToolResult, Application, CheckResult, CheckType, Collateral, DemoRelease, Finding, GroupReviewPolicy, InvestigationSnapshot, PolicyReadiness, ReviewRecord, RevisionVector, SourceRevision, VerificationState } from '@loanwick/contracts/domain';

export const COLLATERAL_RULE_VERSION = 'collateral-1.0.0';
export const GROUP_RULE_VERSION = 'group-review-1.0.0';
export const REVIEW_REVISION_MAP = {
  collateral_review: 'collateralRevision',
  document_consistency_review: 'applicationRevision',
  payment_verification: 'paymentRevision',
} as const satisfies Record<CheckType, keyof RevisionVector>;
export const DEMO_GROUP_POLICY: Readonly<GroupReviewPolicy> = {
  name: 'synthetic-confirmed-group-review', version: '1.0.0', thresholdCents: 100_000_000,
  currency: 'USD', activeStages: ['submitted', 'reviewing', 'clarification_needed', 'ready_for_release'],
};
const activeStages = new Set(['submitted', 'reviewing', 'clarification_needed', 'ready_for_release']);
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const key = (...parts: string[]) => parts.map(encodeURIComponent).join('|');

export class AnalysisInputError extends Error {
  constructor(public readonly code: 'INVALID_INPUT' | 'MIXED_CURRENCY' | 'UNSAFE_TOTAL', message: string) {
    super(message); this.name = 'AnalysisInputError';
  }
}
export interface IdentifierPolicy { caseInsensitive: boolean; ignoreHyphens: boolean }
export type NormalizationResult = { state: 'valid'; normalized: string } | { state: 'unknown' | 'invalid'; reason: string };
// Demo equipment identifiers are case-insensitive; hyphens and leading zeroes matter.
export const DEMO_IDENTIFIER_POLICY: Readonly<IdentifierPolicy> = { caseInsensitive: true, ignoreHyphens: false };
export function normalizeIdentifier(raw: string | null | undefined, policy: IdentifierPolicy = DEMO_IDENTIFIER_POLICY): NormalizationResult {
  if (raw == null || raw.trim() === '') return { state: 'unknown', reason: 'No identifier was supplied' };
  let value = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(value)) return { state: 'invalid', reason: 'Unsupported demo identifier format' };
  if (policy.caseInsensitive) value = value.toUpperCase();
  if (policy.ignoreHyphens) value = value.replaceAll('-', '');
  return { state: 'valid', normalized: value };
}
function applications(snapshot: InvestigationSnapshot): Map<string, Application> {
  const map = new Map(snapshot.applications.map(a => [a.id, a]));
  if (map.size !== snapshot.applications.length || !map.has(snapshot.applicationId)) throw new AnalysisInputError('INVALID_INPUT', 'Duplicate application IDs or missing target');
  const organizationId = map.get(snapshot.applicationId)!.organizationId;
  if ([...map.values()].some(a => a.organizationId !== organizationId)) throw new AnalysisInputError('INVALID_INPUT', 'Mixed organization snapshot');
  return map;
}
export function captureSourceRevisions(apps: readonly Application[]): SourceRevision[] {
  if (new Set(apps.map(a => a.id)).size !== apps.length) throw new AnalysisInputError('INVALID_INPUT', 'Duplicate source applications');
  return apps.map(a => ({ applicationId: a.id, applicationRevision: a.applicationRevision, collateralRevision: a.collateralRevision, paymentRevision: a.paymentRevision })).sort((a, b) => a.applicationId < b.applicationId ? -1 : a.applicationId > b.applicationId ? 1 : 0);
}
export function getChangedSourceIds(captured: readonly SourceRevision[], current: readonly SourceRevision[]): string[] {
  const before = new Map(captured.map(r => [r.applicationId, r]));
  const after = new Map(current.map(r => [r.applicationId, r]));
  if (before.size !== captured.length || after.size !== current.length) throw new AnalysisInputError('INVALID_INPUT', 'Duplicate source revision IDs');
  return sortedUnique([...before.keys(), ...after.keys()]).filter(id => {
    const a = before.get(id), b = after.get(id);
    return !a || !b || a.applicationRevision !== b.applicationRevision || a.collateralRevision !== b.collateralRevision || a.paymentRevision !== b.paymentRevision;
  });
}
function revisionsFor(ids: string[], apps: Map<string, Application>): SourceRevision[] {
  return captureSourceRevisions(ids.map(id => {
    const app = apps.get(id);
    if (!app) throw new AnalysisInputError('INVALID_INPUT', 'Unknown source application');
    return app;
  }));
}

export function checkCollateralConflicts(snapshot: InvestigationSnapshot, policy: IdentifierPolicy = DEMO_IDENTIFIER_POLICY): CheckResult[] {
  const apps = applications(snapshot);
  const evidence = new Map(snapshot.evidence.map(e => [e.id, e]));
  const groups = new Map<string, { identifier: string; assetType: string; claims: Collateral[] }>();
  const hasIdentifierEvidence = (claim: Collateral, normalized: string) => claim.evidenceIds.some(id => {
    const e = evidence.get(id);
    const value = normalizeIdentifier(e?.extractedValue, policy);
    return e?.applicationId === claim.applicationId && e.fieldName === 'identifier' && value.state === 'valid' && value.normalized === normalized;
  });
  const hasExclusiveEvidence = (claim: Collateral) => claim.exclusiveOwnershipClaim === true && claim.ownershipEvidenceIds.some(id => {
    const e = evidence.get(id);
    return e?.applicationId === claim.applicationId && e.fieldName === 'exclusiveOwnershipClaim' && e.extractedValue === 'true';
  });
  for (const claim of snapshot.collateral) {
    const app = apps.get(claim.applicationId);
    if (!app) throw new AnalysisInputError('INVALID_INPUT', 'Collateral references unknown application');
    if (!claim.active || !activeStages.has(app.stage)) continue;
    const normalized = normalizeIdentifier(claim.identifier, policy);
    if (normalized.state !== 'valid' || !hasIdentifierEvidence(claim, normalized.normalized)) continue;
    const namespaceKey = JSON.stringify([claim.assetType, normalized.normalized]);
    const group = groups.get(namespaceKey) ?? { identifier: normalized.normalized, assetType: claim.assetType, claims: [] };
    group.claims.push(claim); groups.set(namespaceKey, group);
  }
  const results: CheckResult[] = [];
  for (const [, { identifier, assetType, claims }] of [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const allIds = sortedUnique(claims.map(c => c.applicationId));
    if (allIds.length < 2 || !allIds.includes(snapshot.applicationId)) continue;
    const exclusive = claims.filter(hasExclusiveEvidence);
    const exclusiveIds = sortedUnique(exclusive.map(c => c.applicationId));
    let sources: Collateral[], type: CheckResult['findingType'];
    if (exclusiveIds.length >= 2 && exclusiveIds.includes(snapshot.applicationId)) {
      sources = exclusive; type = 'collateral_conflict';
    } else {
      const unknown = claims.some(c => c.exclusiveOwnershipClaim === null || (c.exclusiveOwnershipClaim === true && !hasExclusiveEvidence(c)));
      const ownClaims = claims.filter(c => c.applicationId === snapshot.applicationId);
      if (!unknown || ownClaims.every(c => c.exclusiveOwnershipClaim === false)) continue;
      sources = claims; type = 'collateral_ownership_unknown';
    }
    const applicationIds = sortedUnique(sources.map(c => c.applicationId));
    const evidenceIds = sortedUnique(sources.flatMap(c => [...c.evidenceIds, ...c.ownershipEvidenceIds].filter(id => evidence.get(id)?.applicationId === c.applicationId)));
    results.push({
      findingType: type, severity: type === 'collateral_conflict' ? 'high' : 'review', evidenceState: type === 'collateral_conflict' ? 'contradicted' : 'unknown',
      title: type === 'collateral_conflict' ? 'Conflicting exclusive equipment ownership claims' : 'Shared equipment identifier needs ownership evidence',
      explanation: type === 'collateral_conflict' ? `Equipment ${identifier} appears in exclusive ownership claims across ${applicationIds.length} applications.` : `Equipment ${identifier} appears across applications, but exclusive ownership evidence is incomplete.`,
      uncertainty: 'Submitted documents are not independently authenticated. A clerical error, an outdated schedule, or a change of ownership may explain the records.',
      suggestedNextStep: 'Ask for a current ownership document and corrected collateral schedule; have an officer review the response.',
      applicationIds, evidenceIds, observedRevisions: revisionsFor(applicationIds, apps), ruleVersion: COLLATERAL_RULE_VERSION,
      deduplicationKey: key(COLLATERAL_RULE_VERSION, type, assetType, identifier, ...applicationIds), facts: { normalizedIdentifier: identifier, assetType },
    });
  }
  return results;
}

export function checkGroupThreshold(snapshot: InvestigationSnapshot, policy: GroupReviewPolicy = DEMO_GROUP_POLICY): CheckResult[] {
  const apps = applications(snapshot);
  if (!Number.isSafeInteger(policy.thresholdCents) || policy.thresholdCents < 0) throw new AnalysisInputError('INVALID_INPUT', 'Invalid threshold cents');
  const stages = new Set(policy.activeStages);
  const evidence = new Map(snapshot.evidence.map(e => [e.id, e]));
  // Inactive requests do not contribute money, but confirmed relationships through
  // inactive members still establish the group. Capture their revisions as well.
  const edges = snapshot.relationships.filter(r => {
    if (!apps.has(r.leftApplicationId) || !apps.has(r.rightApplicationId)) throw new AnalysisInputError('INVALID_INPUT', 'Unknown relationship endpoint');
    return (r.decision === 'confirmed_related' || r.decision === 'confirmed_same_entity') && r.reviewedBy !== null && r.reviewedAt !== null && r.evidenceIds.length > 0 && r.evidenceIds.every(id => {
      const e = evidence.get(id); return !!e && [r.leftApplicationId, r.rightApplicationId].includes(e.applicationId);
    });
  });
  const members = new Set([snapshot.applicationId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) if (members.has(edge.leftApplicationId) || members.has(edge.rightApplicationId)) {
      for (const id of [edge.leftApplicationId, edge.rightApplicationId]) if (!members.has(id)) { members.add(id); changed = true; }
    }
  }
  const applicationIds = [...members].sort();
  const active = applicationIds.map(id => apps.get(id)!).filter(a => stages.has(a.stage));
  if (active.length < 2) return [];
  if (active.some(a => a.currency !== policy.currency)) throw new AnalysisInputError('MIXED_CURRENCY', 'Do not aggregate unlike currencies; partition or review the group');
  let total = 0;
  const amountEvidenceIds: string[] = [];
  for (const app of active) {
    if (!Number.isSafeInteger(app.amountCents) || app.amountCents < 0) throw new AnalysisInputError('INVALID_INPUT', 'Invalid application cents');
    total += app.amountCents;
    if (!Number.isSafeInteger(total)) throw new AnalysisInputError('UNSAFE_TOTAL', 'Group total exceeds safe integer cents');
  }
  if (total <= policy.thresholdCents) return [];
  for (const app of active) {
    for (const [field, value] of [['amountCents', String(app.amountCents)], ['currency', app.currency]]) {
      const source = snapshot.evidence.filter(e => e.applicationId === app.id && e.fieldName === field && e.extractedValue === value);
      if (source.length === 0) throw new AnalysisInputError('INVALID_INPUT', 'Missing amount/currency evidence for active group member');
      amountEvidenceIds.push(...source.map(e => e.id));
    }
  }
  const evidenceIds = sortedUnique([...edges.filter(r => members.has(r.leftApplicationId) && members.has(r.rightApplicationId)).flatMap(r => r.evidenceIds), ...amountEvidenceIds]);
  return [{
    findingType: 'group_review_required', severity: 'review', evidenceState: 'supported', title: 'Confirmed group exceeds the demo review threshold',
    explanation: `${active.length} distinct active requests total ${total} ${policy.currency} cents, above ${policy.thresholdCents} under ${policy.name} ${policy.version}. Confirmed relationships establish membership; inactive members are not counted in the total.`,
    uncertainty: 'This is a synthetic review policy, not a legal limit or evidence of intentional loan splitting.',
    suggestedNextStep: 'Have an authorized reviewer assess the confirmed group and document the review.',
    applicationIds, evidenceIds, observedRevisions: revisionsFor(applicationIds, apps), ruleVersion: GROUP_RULE_VERSION,
    deduplicationKey: key(GROUP_RULE_VERSION, policy.name, policy.version, ...applicationIds),
    facts: { totalCents: total, thresholdCents: policy.thresholdCents, currency: policy.currency, policyVersion: policy.version },
  }];
}

export function getVerificationState(checkType: CheckType, currentRevision: number, reviews: readonly ReviewRecord[]): VerificationState {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) throw new AnalysisInputError('INVALID_INPUT', 'Invalid current revision');
  const relevant = reviews.filter(r => r.checkType === checkType);
  if (new Set(relevant.map(r => r.applicationId)).size > 1 || new Set(relevant.map(r => r.sequence)).size !== relevant.length) throw new AnalysisInputError('INVALID_INPUT', 'Ambiguous review history');
  const latest = relevant.reduce<ReviewRecord | undefined>((previous, r) => !previous || r.sequence > previous.sequence ? r : previous, undefined);
  if (!latest) return { status: 'pending', currentRevision, observedRevision: null, reviewId: null };
  const status = latest.observedRelevantRevision !== currentRevision || latest.status === 'stale' ? 'stale' : latest.status === 'passed' ? 'current' : latest.status === 'pending' ? 'pending' : 'needs_review';
  return { status, currentRevision, observedRevision: latest.observedRelevantRevision, reviewId: latest.id };
}
export function getPaymentVerificationState(currentRevision: number, reviews: readonly ReviewRecord[] = []): VerificationState {
  return getVerificationState('payment_verification', currentRevision, reviews);
}
export function analyzeSnapshot(snapshot: InvestigationSnapshot): AnalysisToolResult {
  const apps = applications(snapshot);
  const evidence = new Map(snapshot.evidence.map(e => [e.id, e]));
  const skippedCollateralIds = sortedUnique(snapshot.collateral.filter(c => {
    if (!c.active || !activeStages.has(apps.get(c.applicationId)?.stage ?? '')) return false;
    const normalized = normalizeIdentifier(c.identifier);
    return normalized.state !== 'valid' || !c.evidenceIds.some(id => {
      const e = evidence.get(id), value = normalizeIdentifier(e?.extractedValue);
      return e?.applicationId === c.applicationId && e.fieldName === 'identifier' && value.state === 'valid' && value.normalized === normalized.normalized;
    });
  }).map(c => c.id));
  return {
    applicationId: snapshot.applicationId,
    results: [...checkCollateralConflicts(snapshot), ...checkGroupThreshold(snapshot)],
    sourceRevisions: captureSourceRevisions(snapshot.applications), skippedCollateralIds,
  };
}
// Domain-only readiness: caller authorization and transactional recheck stay in DB.
export function getPolicyReadiness(input: {
  application: Application; reviews: readonly ReviewRecord[];
  findings: readonly Pick<Finding, 'applicationId' | 'severity' | 'status'>[];
  releases: readonly DemoRelease[];
}): PolicyReadiness {
  const { application } = input;
  const reviews = input.reviews.filter(r => r.applicationId === application.id);
  const checks = Object.fromEntries(CHECK_TYPES.map(type => [type, getVerificationState(type, application[REVIEW_REVISION_MAP[type]], reviews)])) as PolicyReadiness['checks'];
  const reasons: PolicyReadiness['reasons'] = [];
  if (!['reviewing', 'clarification_needed', 'ready_for_release'].includes(application.stage)) reasons.push({ code: 'INVALID_STAGE', checkType: null });
  if (input.releases.some(r => r.applicationId === application.id) || application.stage === 'released_demo') reasons.push({ code: 'ALREADY_RELEASED', checkType: null });
  for (const type of CHECK_TYPES) {
    const state = checks[type].status;
    if (state !== 'current') reasons.push({ code: state === 'pending' ? 'REVIEW_PENDING' : state === 'stale' ? 'STALE_REVIEW' : 'REVIEW_REQUIRED', checkType: type });
  }
  if (input.findings.some(f => f.applicationId === application.id && f.severity === 'high' && ['open', 'awaiting_response', 'escalated'].includes(f.status))) reasons.push({ code: 'BLOCKING_FINDINGS', checkType: null });
  return { eligibleByPolicy: reasons.length === 0, reasons, checks };
}
