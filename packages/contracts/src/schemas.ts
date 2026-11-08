import { z } from 'zod';
import { ACTOR_ROLES, APPLICATION_STAGES, CHECK_STATUSES, CHECK_TYPES, ERROR_CODES, EVIDENCE_STATES, FINDING_STATUSES, JOB_STATUSES, MATCH_DECISIONS } from './domain.js';
import type * as D from './domain.js';

export const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
export const CentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const RevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const UtcTimestampSchema = z.string().datetime();
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const text = z.string().min(1).max(8_000);
const ids = z.array(IdSchema).max(10_000);
const revisionShape = { applicationRevision: RevisionSchema, collateralRevision: RevisionSchema, paymentRevision: RevisionSchema };
export const RevisionVectorSchema = z.strictObject(revisionShape) satisfies z.ZodType<D.RevisionVector>;
export const SourceRevisionSchema = z.strictObject({ applicationId: IdSchema, ...revisionShape }) satisfies z.ZodType<D.SourceRevision>;
export const UserSchema = z.strictObject({
  id: IdSchema, identity: text, role: z.enum(ACTOR_ROLES), organizationId: IdSchema, displayName: text, active: z.boolean(),
}) satisfies z.ZodType<D.User>;
export const ApplicationSchema = z.strictObject({
  id: IdSchema, borrowerUserId: IdSchema, organizationId: IdSchema, businessName: text,
  amountCents: CentsSchema, currency: CurrencySchema, stage: z.enum(APPLICATION_STAGES), ...revisionShape,
  createdAt: UtcTimestampSchema, updatedAt: UtcTimestampSchema,
}) satisfies z.ZodType<D.Application>;
export const DocumentMetadataSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, type: text, version: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), displayFilename: text,
  extractionStatus: z.enum(['pending', 'succeeded', 'failed', 'unsupported']), createdAt: UtcTimestampSchema, uploadedBy: IdSchema,
}) satisfies z.ZodType<D.DocumentMetadata>;
export const EvidenceSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, documentId: IdSchema, documentVersion: z.number().int().positive(),
  pageNumber: z.number().int().positive().nullable(), locator: text.nullable(), excerpt: text,
  fieldName: text.nullable(), extractedValue: z.string().max(8_000).nullable(),
  extractionMethod: z.enum(['structured', 'csv', 'pdf_text', 'manual']), createdAt: UtcTimestampSchema,
}).superRefine((e, ctx) => {
  if (e.extractionMethod !== 'pdf_text' && e.pageNumber !== null) ctx.addIssue({ code: 'custom', message: 'Only PDF evidence may use pageNumber', path: ['pageNumber'] });
  if (e.pageNumber === null && e.locator === null) ctx.addIssue({ code: 'custom', message: 'Evidence needs an actual source locator' });
}) satisfies z.ZodType<D.Evidence>;
export const EntityRecordSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, originalName: text, normalizedName: text,
  normalizedAddress: text.nullable(), syntheticRegistrationId: text.nullable(), evidenceIds: ids,
}) satisfies z.ZodType<D.EntityRecord>;
export const MatchCandidateSchema = z.strictObject({
  id: IdSchema, leftEntityId: IdSchema, rightEntityId: IdSchema, similarityScore: z.number().min(0).max(1),
  matchedAttributes: z.array(text).max(100), decision: z.enum(MATCH_DECISIONS), reviewedBy: IdSchema.nullable(), reviewedAt: UtcTimestampSchema.nullable(),
}) satisfies z.ZodType<D.MatchCandidate>;
export const CollateralSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, assetType: text, identifier: text.nullable(), description: text,
  exclusiveOwnershipClaim: z.boolean().nullable(), active: z.boolean(), evidenceIds: ids, ownershipEvidenceIds: ids,
}) satisfies z.ZodType<D.Collateral>;
export const ApplicationRelationshipSchema = z.strictObject({
  id: IdSchema, leftApplicationId: IdSchema, rightApplicationId: IdSchema, decision: z.enum(MATCH_DECISIONS),
  reason: text, evidenceIds: ids, reviewedBy: IdSchema.nullable(), reviewedAt: UtcTimestampSchema.nullable(),
}).superRefine((r, ctx) => {
  if (r.leftApplicationId === r.rightApplicationId) ctx.addIssue({ code: 'custom', message: 'Relationship endpoints must differ' });
  if (r.decision.startsWith('confirmed_') && (!r.reviewedBy || !r.reviewedAt || r.evidenceIds.length === 0)) ctx.addIssue({ code: 'custom', message: 'Confirmed relationships require evidence and human review metadata' });
}) satisfies z.ZodType<D.ApplicationRelationship>;
export const PaymentInstructionSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, version: z.number().int().positive(), syntheticAccountToken: z.string().regex(/^SYNTH-/),
  maskedDisplay: text, beneficiaryName: text, evidenceIds: ids, createdAt: UtcTimestampSchema,
}) satisfies z.ZodType<D.PaymentInstruction>;
export const InvestigationJobSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, capturedRevisions: z.array(SourceRevisionSchema).min(1).max(10_000), status: z.enum(JOB_STATUSES),
  runKey: IdSchema, executionMode: z.enum(['live', 'fixture']), claimedBy: IdSchema.nullable(), claimToken: IdSchema.nullable(),
  leaseExpiresAt: UtcTimestampSchema.nullable(), startedAt: UtcTimestampSchema.nullable(), completedAt: UtcTimestampSchema.nullable(),
  modelId: text.nullable(), errorCode: z.enum(ERROR_CODES).nullable(),
}) satisfies z.ZodType<D.InvestigationJob>;
export const ToolEventSchema = z.strictObject({
  id: IdSchema, investigationJobId: IdSchema, sequence: RevisionSchema, toolName: z.string().min(1).max(100),
  status: z.enum(['running', 'succeeded', 'failed']), safeInputSummary: z.string().max(2_000), safeOutputSummary: z.string().max(2_000),
  durationMs: RevisionSchema, createdAt: UtcTimestampSchema,
}) satisfies z.ZodType<D.ToolEvent>;
const checkShape = {
  findingType: z.enum(['collateral_conflict', 'collateral_ownership_unknown', 'group_review_required']), severity: z.enum(['info', 'review', 'high']),
  evidenceState: z.enum(EVIDENCE_STATES), title: text, explanation: text, uncertainty: text, suggestedNextStep: text,
  applicationIds: ids.min(1), evidenceIds: ids, observedRevisions: z.array(SourceRevisionSchema).min(1).max(10_000),
  ruleVersion: z.string().min(1).max(100), deduplicationKey: z.string().min(1).max(2_000),
  facts: z.strictObject({ normalizedIdentifier: text.optional(), assetType: text.optional(), totalCents: CentsSchema.optional(), thresholdCents: CentsSchema.optional(), currency: CurrencySchema.optional(), policyVersion: text.optional() }),
};
export const CheckResultSchema = z.strictObject(checkShape).superRefine((r, ctx) => {
  if (r.applicationIds.length !== new Set(r.applicationIds).size) ctx.addIssue({ code: 'custom', message: 'Result application IDs must be unique' });
  if (r.evidenceIds.length !== new Set(r.evidenceIds).size) ctx.addIssue({ code: 'custom', message: 'Result evidence IDs must be unique' });
  if (r.findingType === 'group_review_required') {
    if (r.facts.totalCents === undefined || r.facts.thresholdCents === undefined || !r.facts.currency || !r.facts.policyVersion || r.facts.totalCents <= r.facts.thresholdCents) ctx.addIssue({ code: 'custom', message: 'Group finding requires supported above-threshold facts' });
    if (r.evidenceState !== 'supported' || r.severity !== 'review' || r.evidenceIds.length === 0) ctx.addIssue({ code: 'custom', message: 'Group review requires supported evidence and review priority' });
  } else if (!r.facts.normalizedIdentifier || !r.facts.assetType) ctx.addIssue({ code: 'custom', message: 'Collateral finding requires a matched identifier and asset namespace' });
  if (r.findingType === 'collateral_conflict' && (r.evidenceState !== 'contradicted' || r.severity !== 'high' || r.evidenceIds.length < 2 || r.applicationIds.length < 2)) ctx.addIssue({ code: 'custom', message: 'Conflict requires two cases, evidence, and contradicted/high state' });
  if (r.findingType === 'collateral_ownership_unknown' && (r.evidenceState !== 'unknown' || r.severity !== 'review')) ctx.addIssue({ code: 'custom', message: 'Missing ownership is unknown/review, not proof' });
}) satisfies z.ZodType<D.CheckResult>;
export const FindingSchema = z.strictObject({
  ...checkShape, id: IdSchema, applicationId: IdSchema, investigationJobId: IdSchema.nullable(),
  status: z.enum(FINDING_STATUSES), createdAt: UtcTimestampSchema, updatedAt: UtcTimestampSchema,
}).superRefine((value, ctx) => {
  const { id: _id, applicationId, investigationJobId: _job, status: _status, createdAt: _created, updatedAt: _updated, ...result } = value;
  const parsed = CheckResultSchema.safeParse(result);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
  if (!value.applicationIds.includes(applicationId)) ctx.addIssue({ code: 'custom', message: 'Finding owner must be one of its source applications' });
}) satisfies z.ZodType<D.Finding>;
export const ClarificationRequestSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, findingId: IdSchema, borrowerSafeMessage: text, requestedDocumentType: text.nullable(),
  state: z.enum(['draft', 'sent', 'answered', 'closed']), draftedBy: IdSchema, sentBy: IdSchema.nullable(), createdAt: UtcTimestampSchema,
}) satisfies z.ZodType<D.ClarificationRequest>;
export const BorrowerResponseSchema = z.strictObject({
  id: IdSchema, requestId: IdSchema, applicationId: IdSchema, message: text, documentIds: ids, submittedBy: IdSchema, createdAt: UtcTimestampSchema,
}) satisfies z.ZodType<D.BorrowerResponse>;
export const ReviewRecordSchema = z.strictObject({
  id: IdSchema, applicationId: IdSchema, checkType: z.enum(CHECK_TYPES), observedRelevantRevision: RevisionSchema,
  status: z.enum(CHECK_STATUSES), rationale: text, evidenceIds: ids, reviewerId: IdSchema, sequence: RevisionSchema, createdAt: UtcTimestampSchema,
}) satisfies z.ZodType<D.ReviewRecord>;
export const AuditEventSchema = z.strictObject({ id: IdSchema, applicationId: IdSchema.nullable(), actorId: IdSchema, action: text, safeDetails: z.string().max(2_000), createdAt: UtcTimestampSchema }) satisfies z.ZodType<D.AuditEvent>;
export const DemoReleaseSchema = z.strictObject({ id: IdSchema, applicationId: IdSchema, idempotencyKey: IdSchema, releasedBy: IdSchema, releasedAt: UtcTimestampSchema, syntheticAmountCents: CentsSchema }) satisfies z.ZodType<D.DemoRelease>;
export const GroupReviewPolicySchema = z.strictObject({ name: text, version: text, thresholdCents: CentsSchema, currency: CurrencySchema, activeStages: z.array(z.enum(APPLICATION_STAGES)).min(1) }) satisfies z.ZodType<D.GroupReviewPolicy>;
export const DomainErrorSchema = z.strictObject({ code: z.enum(ERROR_CODES), message: text, correlationId: IdSchema }) satisfies z.ZodType<D.DomainError>;
export const VerificationStateSchema = z.strictObject({
  status: z.enum(['pending', 'current', 'stale', 'needs_review']), currentRevision: RevisionSchema,
  observedRevision: RevisionSchema.nullable(), reviewId: IdSchema.nullable(),
}) satisfies z.ZodType<D.VerificationState>;
const readinessShape = {
  eligibleByPolicy: z.boolean(), reasons: z.array(z.strictObject({
    code: z.enum(['INVALID_STAGE', 'REVIEW_PENDING', 'STALE_REVIEW', 'REVIEW_REQUIRED', 'BLOCKING_FINDINGS', 'ALREADY_RELEASED']), checkType: z.enum(CHECK_TYPES).nullable(),
  })).max(100),
  checks: z.strictObject({ collateral_review: VerificationStateSchema, document_consistency_review: VerificationStateSchema, payment_verification: VerificationStateSchema }),
};
export const PolicyReadinessSchema = z.strictObject(readinessShape) satisfies z.ZodType<D.PolicyReadiness>;
export const ReleaseReadinessSchema = z.strictObject({ ...readinessShape, canRelease: z.boolean() }).superRefine((r, ctx) => {
  if (r.eligibleByPolicy !== (r.reasons.length === 0) || (r.canRelease && !r.eligibleByPolicy)) ctx.addIssue({ code: 'custom', message: 'Readiness flags contradict blocking reasons' });
}) satisfies z.ZodType<D.ReleaseReadiness>;
export const ClarificationDraftSchema = z.strictObject({ applicationId: IdSchema, findingId: IdSchema, borrowerSafeMessage: text, requestedDocumentType: text.nullable() }) satisfies z.ZodType<D.ClarificationDraft>;
export const AnalysisToolResultSchema = z.strictObject({
  applicationId: IdSchema, results: z.array(CheckResultSchema).max(1_000), sourceRevisions: z.array(SourceRevisionSchema).min(1).max(1_000), skippedCollateralIds: ids,
}) satisfies z.ZodType<D.AnalysisToolResult>;
const borrowerApplicationSchema = ApplicationSchema.pick({ id: true, businessName: true, amountCents: true, currency: true, stage: true });
const borrowerRequestSchema = ClarificationRequestSchema.pick({ id: true, applicationId: true, borrowerSafeMessage: true, requestedDocumentType: true, state: true, createdAt: true });
export const BorrowerCaseViewSchema = z.strictObject({
  application: borrowerApplicationSchema, requests: z.array(borrowerRequestSchema).max(1_000), responses: z.array(BorrowerResponseSchema).max(1_000),
}).superRefine((view, ctx) => {
  const requests = new Set(view.requests.map(r => r.id));
  if (view.requests.some(r => r.applicationId !== view.application.id || r.state === 'draft') || view.responses.some(r => r.applicationId !== view.application.id || !requests.has(r.requestId))) ctx.addIssue({ code: 'custom', message: 'Borrower projection contains foreign or unsent data' });
}) satisfies z.ZodType<D.BorrowerCaseView>;
export const StaffCaseViewSchema = z.strictObject({
  application: ApplicationSchema, documents: z.array(DocumentMetadataSchema).max(10_000), evidence: z.array(EvidenceSchema).max(20_000), collateral: z.array(CollateralSchema).max(10_000),
  findings: z.array(FindingSchema).max(1_000), relationships: z.array(ApplicationRelationshipSchema).max(10_000),
  investigations: z.array(InvestigationJobSchema.omit({ claimToken: true })).max(1_000), toolEvents: z.array(ToolEventSchema).max(10_000),
  clarificationRequests: z.array(ClarificationRequestSchema).max(1_000), responses: z.array(BorrowerResponseSchema).max(1_000),
  reviews: z.array(ReviewRecordSchema).max(10_000), auditEvents: z.array(AuditEventSchema).max(10_000), readiness: ReleaseReadinessSchema, release: DemoReleaseSchema.nullable(),
}) satisfies z.ZodType<D.StaffCaseView>;
export const ToolArgumentsSchemas = {
  get_application_summary: z.strictObject({ applicationId: IdSchema }),
  get_application_evidence: z.strictObject({ applicationId: IdSchema, evidenceIds: ids.optional() }),
  find_related_applications: z.strictObject({ applicationId: IdSchema }),
  run_collateral_check: z.strictObject({ applicationId: IdSchema }),
  run_group_threshold_check: z.strictObject({ applicationId: IdSchema }),
  get_payment_verification_state: z.strictObject({ applicationId: IdSchema }),
  draft_clarification: z.strictObject({ applicationId: IdSchema, findingId: IdSchema, requestedEvidence: text }),
};

export const InvestigationSnapshotSchema = z.strictObject({
  applicationId: IdSchema, applications: z.array(ApplicationSchema).min(1).max(1_000), documents: z.array(DocumentMetadataSchema).max(10_000),
  evidence: z.array(EvidenceSchema).max(20_000), collateral: z.array(CollateralSchema).max(10_000),
  relationships: z.array(ApplicationRelationshipSchema).max(10_000), reviews: z.array(ReviewRecordSchema).max(10_000),
}).superRefine((s, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  for (const key of ['applications', 'documents', 'evidence', 'collateral', 'relationships', 'reviews'] as const) {
    if (new Set(s[key].map(v => v.id)).size !== s[key].length) issue(`Duplicate IDs in ${key}`);
  }
  const apps = new Map(s.applications.map(a => [a.id, a]));
  const target = apps.get(s.applicationId);
  if (!target) issue('Snapshot target application does not exist');
  if (target && s.applications.some(a => a.organizationId !== target.organizationId)) issue('Snapshot mixes organizations');
  const docs = new Map(s.documents.map(d => [d.id, d]));
  const evidence = new Map(s.evidence.map(e => [e.id, e]));
  for (const d of s.documents) if (!apps.has(d.applicationId)) issue(`Document ${d.id} has an unknown application`);
  for (const e of s.evidence) {
    const doc = docs.get(e.documentId);
    if (!doc || doc.applicationId !== e.applicationId || doc.version !== e.documentVersion) issue(`Evidence ${e.id} has a foreign/missing document or version`);
    if (doc && doc.extractionStatus !== 'succeeded') issue(`Evidence ${e.id} comes from an unextracted document`);
  }
  for (const c of s.collateral) {
    if (!apps.has(c.applicationId)) issue(`Collateral ${c.id} has an unknown application`);
    for (const id of [...c.evidenceIds, ...c.ownershipEvidenceIds]) if (evidence.get(id)?.applicationId !== c.applicationId) issue(`Collateral ${c.id} references foreign/missing evidence ${id}`);
  }
  for (const r of s.relationships) {
    if (!apps.has(r.leftApplicationId) || !apps.has(r.rightApplicationId)) issue(`Relationship ${r.id} has an unknown endpoint`);
    for (const id of r.evidenceIds) {
      const e = evidence.get(id);
      if (!e || ![r.leftApplicationId, r.rightApplicationId].includes(e.applicationId)) issue(`Relationship ${r.id} references foreign/missing evidence`);
    }
  }
  const sequences = new Set<string>();
  for (const r of s.reviews) {
    if (!apps.has(r.applicationId)) issue(`Review ${r.id} has an unknown application`);
    const key = `${r.applicationId}:${r.checkType}:${r.sequence}`;
    if (sequences.has(key)) issue('Review sequences must be unique per case/check');
    sequences.add(key);
    for (const id of r.evidenceIds) if (evidence.get(id)?.applicationId !== r.applicationId) issue(`Review ${r.id} references foreign/missing evidence`);
  }
}) satisfies z.ZodType<D.InvestigationSnapshot>;

// Boundary validation only; it cannot authenticate a caller or prove source text true.
export function validateCheckResults(snapshotInput: unknown, resultsInput: unknown): D.CheckResult[] {
  const snapshot = InvestigationSnapshotSchema.parse(snapshotInput);
  const results = z.array(CheckResultSchema).max(1_000).parse(resultsInput);
  const apps = new Map(snapshot.applications.map(a => [a.id, a]));
  const evidence = new Map(snapshot.evidence.map(e => [e.id, e]));
  const keys = new Set<string>();
  for (const result of results) {
    if (keys.has(result.deduplicationKey)) throw new Error('Duplicate finding key');
    keys.add(result.deduplicationKey);
    if (!result.applicationIds.includes(snapshot.applicationId)) throw new Error('Result is outside target case');
    if (result.applicationIds.some(id => !apps.has(id))) throw new Error('Result references unknown application');
    if (result.evidenceIds.some(id => !result.applicationIds.includes(evidence.get(id)?.applicationId ?? ''))) throw new Error('Result references foreign or missing evidence');
    if (result.findingType !== 'group_review_required' && result.applicationIds.some(id => !result.evidenceIds.some(eid => evidence.get(eid)?.applicationId === id))) throw new Error('Collateral result lacks evidence for a source application');
    const observed = new Map(result.observedRevisions.map(r => [r.applicationId, r]));
    if (observed.size !== result.observedRevisions.length || observed.size !== result.applicationIds.length) throw new Error('Result source revisions must be complete and unique');
    for (const id of result.applicationIds) {
      const app = apps.get(id)!;
      const rev = observed.get(id);
      if (!rev || rev.applicationRevision !== app.applicationRevision || rev.collateralRevision !== app.collateralRevision || rev.paymentRevision !== app.paymentRevision) throw new Error('STALE_RESULTS: source revision mismatch');
    }
  }
  return results;
}
