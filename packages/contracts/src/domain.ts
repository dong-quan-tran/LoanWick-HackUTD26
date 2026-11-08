// No SDK, Node, or validation-library imports: safe for pure server-side helpers.
export const CONTRACT_VERSION = '0.1.0';
export const APPLICATION_STAGES = ['draft', 'submitted', 'reviewing', 'clarification_needed', 'ready_for_release', 'released_demo'] as const;
export const ACTOR_ROLES = ['officer', 'borrower', 'reviewer', 'worker'] as const;
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const FINDING_STATUSES = ['open', 'awaiting_response', 'resolved', 'escalated'] as const;
export const EVIDENCE_STATES = ['supported', 'contradicted', 'unknown'] as const;
export const MATCH_DECISIONS = ['candidate', 'confirmed_same_entity', 'confirmed_related', 'rejected'] as const;
export const CHECK_STATUSES = ['pending', 'passed', 'needs_review', 'stale'] as const;
export const CHECK_TYPES = ['collateral_review', 'document_consistency_review', 'payment_verification'] as const;
export const ERROR_CODES = ['UNAUTHORIZED', 'NOT_FOUND_OR_FORBIDDEN', 'INVALID_INPUT', 'INVALID_STATE', 'INVALID_EVIDENCE', 'LEASE_LOST', 'STALE_RESULTS', 'STALE_REVIEW', 'BLOCKING_FINDINGS', 'ALREADY_RELEASED', 'MODEL_UNAVAILABLE', 'MODEL_TIMEOUT', 'INVALID_MODEL_OUTPUT', 'WORKER_ERROR', 'EXTRACTION_UNSUPPORTED', 'INVESTIGATION_MISSING', 'INVESTIGATION_STALE', 'INVESTIGATION_PENDING', 'CLARIFICATION_PENDING'] as const;
export type ApplicationStage = typeof APPLICATION_STAGES[number];
export type ActorRole = typeof ACTOR_ROLES[number];
export type FindingStatus = typeof FINDING_STATUSES[number];
export type CheckType = typeof CHECK_TYPES[number];
export type CheckStatus = typeof CHECK_STATUSES[number];
export type ExecutionMode = 'live' | 'fixture';
export type RevisionVector = { applicationRevision: number; collateralRevision: number; paymentRevision: number };
export type SourceRevision = RevisionVector & { applicationId: string };

export interface User {
  id: string; identity: string; role: ActorRole; organizationId: string; displayName: string; active: boolean;
}
export interface Application extends RevisionVector {
  id: string; borrowerUserId: string; organizationId: string; businessName: string;
  amountCents: number; currency: string; stage: ApplicationStage; createdAt: string; updatedAt: string;
}
export interface DocumentMetadata {
  id: string; applicationId: string; type: string; version: number; sha256: string;
  displayFilename: string; extractionStatus: 'pending' | 'succeeded' | 'failed' | 'unsupported';
  createdAt: string; uploadedBy: string;
}
// Storage keys belong to a private database/worker record, never this public type.
export interface Evidence {
  id: string; applicationId: string; documentId: string; documentVersion: number;
  pageNumber: number | null; locator: string | null; excerpt: string;
  fieldName: string | null; extractedValue: string | null;
  extractionMethod: 'structured' | 'csv' | 'pdf_text' | 'manual' | 'fixture'; createdAt: string;
}
export interface EntityRecord {
  id: string; applicationId: string; originalName: string; normalizedName: string;
  normalizedAddress: string | null; syntheticRegistrationId: string | null; evidenceIds: string[];
}
export interface MatchCandidate {
  id: string; leftEntityId: string; rightEntityId: string; similarityScore: number;
  matchedAttributes: string[]; decision: typeof MATCH_DECISIONS[number];
  reviewedBy: string | null; reviewedAt: string | null;
}
export interface Collateral {
  id: string; applicationId: string; assetType: string; identifier: string | null;
  description: string; exclusiveOwnershipClaim: boolean | null; active: boolean;
  evidenceIds: string[]; ownershipEvidenceIds: string[];
}
export interface ApplicationRelationship {
  id: string; leftApplicationId: string; rightApplicationId: string;
  decision: typeof MATCH_DECISIONS[number]; reason: string; evidenceIds: string[];
  reviewedBy: string | null; reviewedAt: string | null;
}
export interface PaymentInstruction {
  id: string; applicationId: string; version: number; syntheticAccountToken: string;
  maskedDisplay: string; beneficiaryName: string; evidenceIds: string[]; createdAt: string;
}
export interface InvestigationJob {
  id: string; applicationId: string; capturedRevisions: SourceRevision[];
  status: typeof JOB_STATUSES[number]; runKey: string; executionMode: ExecutionMode;
  claimedBy: string | null; claimToken: string | null; leaseExpiresAt: string | null;
  startedAt: string | null; completedAt: string | null; modelId: string | null;
  errorCode: typeof ERROR_CODES[number] | null;
}
export interface ToolEvent {
  id: string; investigationJobId: string; sequence: number; toolName: string;
  status: 'running' | 'succeeded' | 'failed'; safeInputSummary: string; safeOutputSummary: string;
  durationMs: number; createdAt: string;
}
export interface CheckResult {
  findingType: 'collateral_conflict' | 'collateral_ownership_unknown' | 'group_review_required';
  severity: 'info' | 'review' | 'high'; evidenceState: typeof EVIDENCE_STATES[number];
  title: string; explanation: string; uncertainty: string; suggestedNextStep: string;
  applicationIds: string[]; evidenceIds: string[]; observedRevisions: SourceRevision[];
  ruleVersion: string; deduplicationKey: string;
  facts: {
    normalizedIdentifier?: string | undefined;
    assetType?: string | undefined;
    totalCents?: number | undefined; thresholdCents?: number | undefined; currency?: string | undefined; policyVersion?: string | undefined;
  };
}
export interface Finding extends CheckResult {
  id: string; applicationId: string; investigationJobId: string | null;
  status: FindingStatus; createdAt: string; updatedAt: string;
}
export interface ClarificationRequest {
  id: string; applicationId: string; findingId: string; borrowerSafeMessage: string;
  requestedDocumentType: string | null; state: 'draft' | 'sent' | 'answered' | 'closed';
  draftedBy: string; sentBy: string | null; createdAt: string;
}
export interface BorrowerResponse {
  id: string; requestId: string; applicationId: string; message: string;
  documentIds: string[]; submittedBy: string; createdAt: string;
}
export interface ReviewRecord {
  id: string; applicationId: string; checkType: CheckType; observedRelevantRevision: number;
  status: CheckStatus; rationale: string; evidenceIds: string[];
  reviewerId: string; sequence: number; createdAt: string;
}
export interface AuditEvent {
  id: string; applicationId: string | null; actorId: string; action: string;
  safeDetails: string; createdAt: string;
}
export interface DemoRelease {
  id: string; applicationId: string; idempotencyKey: string; releasedBy: string;
  releasedAt: string; syntheticAmountCents: number;
}
export interface InvestigationSnapshot {
  applicationId: string; applications: Application[]; documents: DocumentMetadata[];
  evidence: Evidence[]; collateral: Collateral[]; relationships: ApplicationRelationship[];
  reviews: ReviewRecord[];
}
export interface GroupReviewPolicy {
  name: string; version: string; thresholdCents: number; currency: string;
  activeStages: ApplicationStage[];
}
export interface VerificationState {
  status: 'pending' | 'current' | 'stale' | 'needs_review';
  currentRevision: number; observedRevision: number | null; reviewId: string | null;
}
export interface PolicyReadiness {
  eligibleByPolicy: boolean;
  reasons: Array<{ code: 'INVALID_STAGE' | 'INVALID_STATE' | 'MISSING_REVIEW' | 'REVIEW_PENDING' | 'STALE_REVIEW' | 'REVIEW_REQUIRED' | 'BLOCKING_FINDINGS' | 'ALREADY_RELEASED' | 'INVESTIGATION_MISSING' | 'INVESTIGATION_STALE' | 'INVESTIGATION_PENDING' | 'CLARIFICATION_PENDING' | 'PAYMENT_EVIDENCE_REQUIRED'; checkType: CheckType | null }>;
  checks: Record<CheckType, VerificationState>;
}
export interface ReleaseReadiness extends PolicyReadiness {
  canRelease: boolean; // Server adds authenticated actor/organization authorization.
}
export type StaffInvestigationJob = Pick<InvestigationJob, 'id' | 'applicationId' | 'runKey' | 'status' | 'executionMode' | 'modelId' | 'startedAt' | 'completedAt'> & { errorCode: string | null; capturedRevisions?: SourceRevision[] | undefined; claimedBy?: string | null | undefined; leaseExpiresAt?: string | null | undefined };
// Stored server findings may lack worker-only structured facts. Do not invent them at a presentation boundary.
export type PresentedFinding = Omit<Finding, 'facts'> & { facts?: Finding['facts'] | undefined };
export type PresentedCollateral = Omit<Collateral, 'assetType' | 'ownershipEvidenceIds'> & { assetType?: string | undefined; ownershipEvidenceIds?: string[] | undefined };
export interface ClarificationDraft {
  applicationId: string; findingId: string; borrowerSafeMessage: string; requestedDocumentType: string | null;
}
export interface AnalysisToolResult {
  applicationId: string; results: CheckResult[]; sourceRevisions: SourceRevision[];
  skippedCollateralIds: string[];
}
export interface StaffCaseView {
  application: Application; documents: DocumentMetadata[]; evidence: Evidence[];
  collateral: PresentedCollateral[]; findings: PresentedFinding[]; relationships: ApplicationRelationship[];
  investigations: StaffInvestigationJob[]; toolEvents: ToolEvent[];
  clarificationRequests: ClarificationRequest[]; responses: BorrowerResponse[];
  reviews: ReviewRecord[]; auditEvents: AuditEvent[]; readiness: ReleaseReadiness; release: DemoRelease | null;
  paymentSummary?: Pick<PaymentInstruction, 'id' | 'applicationId' | 'version' | 'maskedDisplay' | 'beneficiaryName' | 'evidenceIds'> | null | undefined;
  relatedApplications?: Array<Pick<Application, 'id' | 'businessName' | 'amountCents' | 'currency'>> | undefined;
  findingCurrentness?: Record<string, boolean> | undefined;
  currentDocumentIds?: string[] | undefined;
}
export type BorrowerRequest = Pick<ClarificationRequest, 'id' | 'applicationId' | 'borrowerSafeMessage' | 'requestedDocumentType' | 'state' | 'createdAt'>;
export type BorrowerDocument = DocumentMetadata & { requestId?: string | null | undefined };
export interface BorrowerCaseView {
  application: Pick<Application, 'id' | 'businessName' | 'amountCents' | 'currency' | 'stage'>;
  requests: BorrowerRequest[]; responses: BorrowerResponse[];
  documents?: BorrowerDocument[] | undefined;
}
export interface DomainError { code: typeof ERROR_CODES[number]; message: string; correlationId: string }
export type OperationResult<T> = { ok: true; value: T; correlationId: string } | { ok: false; error: DomainError };
export interface MutationReceipt { correlationId: string }
export interface PortfolioItem {
  application: Application; openFindingCount: number;
  lastInvestigationStatus: typeof JOB_STATUSES[number] | null;
}
export type Unsubscribe = () => void;
// Logical adapter contract only. Person 1 implements correlation using actual SDK behavior.
export interface CaseAdapter {
  subscribePortfolio(onValue: (value: PortfolioItem[]) => void, onError: (error: DomainError) => void): Unsubscribe;
  subscribeCase(applicationId: string, onValue: (value: StaffCaseView) => void, onError: (error: DomainError) => void): Unsubscribe;
  subscribeBorrowerCase(applicationId: string, onValue: (value: BorrowerCaseView) => void, onError: (error: DomainError) => void): Unsubscribe;
  requestInvestigation(input: { applicationId: string; executionMode: ExecutionMode; correlationId: string }): Promise<OperationResult<{ jobId: string }>>;
  createClarificationDraft(input: ClarificationDraft & { correlationId: string }): Promise<OperationResult<{ requestId: string }>>;
  updateClarificationDraft?(input: { requestId: string; borrowerSafeMessage: string; requestedDocumentType: string | null; correlationId: string }): Promise<OperationResult<MutationReceipt>>;
  sendClarification(input: { requestId: string; borrowerSafeMessage: string; correlationId: string }): Promise<OperationResult<MutationReceipt>>;
  submitBorrowerResponse(input: { requestId: string; message: string; documentIds: string[]; correlationId: string }): Promise<OperationResult<MutationReceipt>>;
  decideFinding(input: { findingId: string; decision: 'resolved' | 'escalate' | 'reopen'; rationale: string; correlationId: string }): Promise<OperationResult<MutationReceipt>>;
  recordReview(input: { applicationId: string; checkType: CheckType; observedRelevantRevision: number; rationale: string; evidenceIds: string[]; status?: 'passed' | 'needs_review'; correlationId: string }): Promise<OperationResult<MutationReceipt>>;
  changePaymentInstructions(input: { applicationId: string; observedPaymentRevision: number; syntheticAccountToken: string; beneficiaryName: string; evidenceIds: string[]; correlationId: string }): Promise<OperationResult<MutationReceipt>>;
  simulateRelease(input: { applicationId: string; idempotencyKey: string; correlationId: string }): Promise<OperationResult<DemoRelease>>;
}
