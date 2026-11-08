import { Timestamp } from 'spacetimedb'
import { SenderError } from 'spacetimedb/server'
import type { Application, ReadableDb, RevisionVector, User, WriteContext } from './schema'

export const roles = ['officer', 'borrower', 'reviewer', 'worker'] as const
export type Role = (typeof roles)[number]
export const requiredChecks = ['collateral_review', 'document_consistency_review', 'payment_verification'] as const
export const documentTypes = ['collateral_schedule', 'financial_statement', 'payment_instructions', 'supporting_document'] as const
export const activeJob = (status: string) => status === 'queued' || status === 'running'

export function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new SenderError(code)
}

export function actor(ctx: WriteContext, ...allowed: Role[]): User {
  const user = ctx.db.users.identity.find(ctx.sender)
  requireCondition(user?.active && allowed.some(role => user.role === role), 'UNAUTHORIZED')
  return user
}

export function caseFor(db: ReadableDb, user: User, applicationId: string): Application {
  const application = db.applications.id.find(applicationId)
  requireCondition(application && application.organizationId === user.organizationId &&
    (user.role !== 'borrower' || application.borrowerUserId === user.id), 'NOT_FOUND_OR_FORBIDDEN')
  return application
}

export function requireEditable(application: Application) {
  requireCondition(application.stage !== 'released_demo', 'ALREADY_RELEASED')
}

export function requireId(value: string) {
  requireCondition(/^[a-zA-Z0-9_-]{1,100}$/.test(value), 'INVALID_INPUT')
}

export function requireText(value: string, max: number, allowEmpty = false) {
  requireCondition(value.length <= max && (allowEmpty || value.trim().length > 0), 'INVALID_INPUT')
}

export function requireDistinct(values: readonly string[], max: number) {
  requireCondition(values.length <= max && new Set(values).size === values.length, 'INVALID_INPUT')
}

export function validateEvidence(db: ReadableDb, evidenceIds: readonly string[], scope: ReadonlySet<string>) {
  requireDistinct(evidenceIds, 32)
  return evidenceIds.map(id => {
    const item = db.evidence.id.find(id)
    const document = item && db.documents.id.find(item.documentId)
    requireCondition(item && scope.has(item.applicationId) && document &&
      document.applicationId === item.applicationId && document.version === item.documentVersion,
    'INVALID_EVIDENCE')
    return item
  })
}

export function revisions(application: Application): RevisionVector {
  return {
    applicationRevision: application.applicationRevision,
    collateralRevision: application.collateralRevision,
    paymentRevision: application.paymentRevision,
  }
}

export function matchesRevisions(actual: RevisionVector, expected: RevisionVector) {
  return actual.applicationRevision === expected.applicationRevision &&
    actual.collateralRevision === expected.collateralRevision && actual.paymentRevision === expected.paymentRevision
}

export function deadline(ctx: WriteContext, seconds: number) {
  return new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(seconds) * 1_000_000n)
}

export function audit(ctx: WriteContext, applicationId: string, actorId: string, action: string, safeDetails: string) {
  ctx.db.auditEvents.insert({
    id: ctx.newUuidV7().toString(), applicationId, actorId, action, safeDetails, createdAt: ctx.timestamp,
  })
}

export function currentRevision(application: Application, checkType: string) {
  if (checkType === 'collateral_review') return application.collateralRevision
  if (checkType === 'payment_verification') return application.paymentRevision
  return application.applicationRevision
}

export function readiness(db: ReadableDb, application: Application) {
  const reviews = Array.from(db.reviewRecords.applicationId.filter(application.id))
    .filter(review => !review.superseded)
  const checks = requiredChecks.map(checkType => {
    const review = reviews.find(item => item.checkType === checkType)
    const revision = currentRevision(application, checkType)
    let status = review?.status ?? 'pending'
    if (review && revision !== review.observedRelevantRevision) status = 'stale'
    return { checkType, revision, status }
  })
  const reasons: string[] = []
  if (application.stage === 'released_demo' || db.demoReleases.applicationId.find(application.id)) {
    reasons.push('ALREADY_RELEASED')
  } else if (application.stage === 'draft' || application.stage === 'submitted') {
    reasons.push('INVALID_STATE')
  }
  if (Array.from(db.findings.applicationId.filter(application.id))
    .some(finding => finding.severity === 'high' && finding.status !== 'resolved')) {
    reasons.push('BLOCKING_FINDINGS')
  }
  const clarificationPending = Array.from(db.clarificationRequests.applicationId.filter(application.id))
    .some(request => request.state === 'sent' || request.state === 'answered')
  if (clarificationPending) reasons.push('CLARIFICATION_PENDING')
  if (Array.from(db.investigationJobs.applicationId.filter(application.id)).some(job => activeJob(job.status))) {
    reasons.push('INVESTIGATION_PENDING')
  }
  if (checks.some(check => check.status === 'stale')) reasons.push('STALE_REVIEW')
  if (checks.some(check => check.status === 'pending')) reasons.push('MISSING_REVIEW')
  if (checks.some(check => check.status === 'needs_review')) reasons.push('REVIEW_REQUIRED')
  return { applicationId: application.id, checks, reasons, canRelease: reasons.length === 0, clarificationPending }
}

export function syncStage(ctx: WriteContext, application: Application) {
  if (['draft', 'submitted', 'released_demo'].includes(application.stage)) return
  const { canRelease, clarificationPending } = readiness(ctx.db, application)
  const stage = clarificationPending ? 'clarification_needed' : canRelease ? 'ready_for_release' : 'reviewing'
  if (stage !== application.stage) ctx.db.applications.id.update({ ...application, stage, updatedAt: ctx.timestamp })
}

export function changeRevisions(ctx: WriteContext, application: Application, scope: 'collateral' | 'payment' | 'other') {
  requireEditable(application)
  const next = ctx.db.applications.id.update({
    ...application, applicationRevision: application.applicationRevision + 1,
    collateralRevision: application.collateralRevision + (scope === 'collateral' ? 1 : 0),
    paymentRevision: application.paymentRevision + (scope === 'payment' ? 1 : 0),
    updatedAt: ctx.timestamp,
  })
  syncStage(ctx, next)
  return next
}
