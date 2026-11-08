import { schema, table, t, type Infer, type ReducerCtx, type ViewCtx } from 'spacetimedb/server'

const id = () => t.string().primaryKey()
const indexedId = () => t.string().index('btree')
const refs = () => t.array(t.string())

export const revisionVector = t.object('RevisionVector', {
  applicationRevision: t.u32(), collateralRevision: t.u32(), paymentRevision: t.u32(),
})
export const sourceRevision = t.object('SourceRevision', {
  applicationId: t.string(), revisions: revisionVector,
})

export const users = table({ name: 'users' }, {
  identity: t.identity().primaryKey(), id: t.string().unique(), organizationId: indexedId(),
  role: t.string(), displayName: t.string(), active: t.bool(),
})

export const applications = table({ name: 'applications' }, {
  id: id(), borrowerUserId: indexedId(), organizationId: indexedId(), businessName: t.string(),
  amountCents: t.u64(), currency: t.string(), stage: t.string(),
  applicationRevision: t.u32(), collateralRevision: t.u32(), paymentRevision: t.u32(),
  createdAt: t.timestamp(), updatedAt: t.timestamp(),
})

export const documentFields = {
  id: id(), applicationId: indexedId(), type: t.string(), version: t.u32(),
  sha256: t.string(), displayFilename: t.string(), extractionStatus: t.string(),
  uploadedBy: t.string(), requestId: t.option(t.string()), current: t.bool(), createdAt: t.timestamp(),
}
export const documents = table({ name: 'documents' }, {
  ...documentFields, storageKey: t.string(),
})

export const evidenceInputFields = {
  id: t.string(), excerpt: t.string(), fieldName: t.option(t.string()),
  fieldValue: t.option(t.string()), extractionMethod: t.string(),
  pageNumber: t.option(t.u32()), locator: t.option(t.string()),
}
export const evidence = table({ name: 'evidence' }, {
  ...evidenceInputFields, id: id(), applicationId: indexedId(), documentId: indexedId(),
  documentVersion: t.u32(), createdAt: t.timestamp(),
})

export const collateral = table({ name: 'collateral' }, {
  id: id(), applicationId: indexedId(), identifier: t.string(), normalizedIdentifier: indexedId(),
  description: t.string(), active: t.bool(), exclusiveOwnershipClaim: t.bool(), evidenceIds: refs(),
})

export const entityRecords = table({ name: 'entity_records' }, {
  id: id(), applicationId: indexedId(), name: t.string(), normalizedName: t.string(),
  externalIdentifier: t.option(t.string()), address: t.option(t.string()), evidenceIds: refs(),
})

export const matchCandidates = table({ name: 'match_candidates' }, {
  id: id(), leftApplicationId: indexedId(), rightApplicationId: indexedId(),
  leftEntityId: t.string(), rightEntityId: t.string(), matchedAttributes: refs(),
  similarityScore: t.u16(), decision: t.string(), reviewerId: t.option(t.string()),
  rationale: t.option(t.string()), reviewedAt: t.option(t.timestamp()),
})

export const paymentInstructions = table({ name: 'payment_instructions' }, {
  id: id(), applicationId: indexedId(), version: t.u32(), syntheticAccountToken: t.string(),
  maskedDisplay: t.string(), beneficiaryName: t.string(), evidenceIds: refs(), createdAt: t.timestamp(),
})

export const investigationJobs = table({ name: 'investigation_jobs' }, {
  id: id(), applicationId: indexedId(), organizationId: indexedId(), runKey: t.string(),
  requestKey: t.string().unique(), revisions: revisionVector, sources: t.array(sourceRevision),
  status: t.string(), workerIdentity: t.option(t.identity()), claimEpoch: t.u32(),
  leaseExpiresAt: t.option(t.timestamp()), executionMode: t.string(), modelId: t.option(t.string()),
  createdAt: t.timestamp(), startedAt: t.option(t.timestamp()), completedAt: t.option(t.timestamp()),
  errorCode: t.option(t.string()), acceptedFindingIds: t.option(t.array(t.string())),
})

export const leaseTimers = table({ name: 'lease_timers' }, {
  scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), jobId: t.string(), claimEpoch: t.u32(),
})

export const toolEvents = table({ name: 'tool_events' }, {
  id: id(), jobId: indexedId(), applicationId: indexedId(), claimEpoch: t.u32(),
  sequence: t.u32(), toolName: t.string(), status: t.string(), inputSummary: t.string(),
  outputSummary: t.string(), durationMs: t.u32(), createdAt: t.timestamp(),
})

export const findingInputFields = {
  type: t.string(), severity: t.string(), evidenceState: t.string(), title: t.string(),
  explanation: t.string(), uncertainty: t.string(), suggestedNextStep: t.string(),
  evidenceIds: refs(), relatedApplicationIds: refs(), ruleVersion: t.string(), deduplicationKey: t.string(),
}
export const findings = table({ name: 'findings' }, {
  ...findingInputFields, id: id(), applicationId: indexedId(), jobId: indexedId(),
  status: t.string(), revisions: revisionVector, sources: t.array(sourceRevision),
  crossCaseOwnershipVerified: t.option(t.bool()),
  createdAt: t.timestamp(), updatedAt: t.timestamp(),
})

export const clarificationRequests = table({ name: 'clarification_requests' }, {
  id: id(), applicationId: indexedId(), findingId: indexedId(), borrowerSafeMessage: t.string(),
  requestedDocumentType: t.option(t.string()), state: t.string(), draftedBy: t.string(),
  sentBy: t.option(t.string()), createdAt: t.timestamp(), sentAt: t.option(t.timestamp()),
})

export const borrowerResponses = table({ name: 'borrower_responses' }, {
  id: id(), requestId: t.string().unique(), applicationId: indexedId(), message: t.string(),
  documentIds: refs(), submittedBy: t.string(), createdAt: t.timestamp(),
})

export const uploadGrants = table({ name: 'upload_grants' }, {
  id: id(), applicationId: indexedId(), requestId: t.option(t.string()), uploaderId: indexedId(),
  workerIdentity: t.identity().index('btree'), documentType: t.string(),
  applicationRevision: t.u32(), expiresAt: t.timestamp(), used: t.bool(),
})

export const reviewRecords = table({ name: 'review_records' }, {
  id: id(), applicationId: indexedId(), checkType: t.string(), observedRelevantRevision: t.u32(),
  status: t.string(), rationale: t.string(), evidenceIds: refs(), reviewerId: t.string(),
  superseded: t.bool(), createdAt: t.timestamp(),
})

export const auditEvents = table({ name: 'audit_events' }, {
  id: id(), applicationId: indexedId(), actorId: t.string(), action: t.string(),
  safeDetails: t.string(), createdAt: t.timestamp(),
})

export const demoReleases = table({ name: 'demo_releases' }, {
  id: id(), applicationId: t.string().unique(), idempotencyKey: t.string(),
  releasedBy: t.string(), releasedAt: t.timestamp(), syntheticAmountCents: t.u64(), currency: t.string(),
})

const admins = table({ name: 'demo_admins' }, { identity: t.identity().primaryKey() })

export const db = schema({
  admins, users, applications, documents, evidence, collateral, entityRecords, matchCandidates,
  paymentInstructions, investigationJobs, leaseTimers, toolEvents, findings, clarificationRequests,
  borrowerResponses, uploadGrants, reviewRecords, auditEvents, demoReleases,
})

type LoanwickSchema = typeof db.schemaType
export type WriteContext = ReducerCtx<LoanwickSchema>
export type ReadContext = ViewCtx<LoanwickSchema>
export type ReadableDb = ReadContext['db']
export type User = Infer<typeof users.rowType>
export type Application = Infer<typeof applications.rowType>
export type RevisionVector = Infer<typeof revisionVector>
export type InvestigationJob = Infer<typeof investigationJobs.rowType>
