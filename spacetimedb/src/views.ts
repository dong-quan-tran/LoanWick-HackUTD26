import { t } from 'spacetimedb/server'
import { activeJob, readiness, revisions } from './domain'
import { jobCollateral, jobEvidence, sourcesMatch } from './investigations'
import {
  applications, auditEvents, borrowerResponses, clarificationRequests, collateral, db, demoReleases, documentFields,
  entityRecords, evidence, findings, matchCandidates, reviewRecords, revisionVector, sourceRevision, toolEvents,
  type ReadContext,
} from './schema'

function staffCases(ctx: ReadContext) {
  const user = ctx.db.users.identity.find(ctx.sender)
  if (!user?.active || (user.role !== 'officer' && user.role !== 'reviewer')) return []
  return Array.from(ctx.db.applications.organizationId.filter(user.organizationId))
}

function borrowerCases(ctx: ReadContext) {
  const user = ctx.db.users.identity.find(ctx.sender)
  if (!user?.active || user.role !== 'borrower') return []
  return Array.from(ctx.db.applications.borrowerUserId.filter(user.id))
    .filter(application => application.organizationId === user.organizationId)
}

export const myUser = db.view({ name: 'my_user', public: true }, t.option(t.row('SessionUser', {
  id: t.string().primaryKey(), organizationId: t.string(), role: t.string(), displayName: t.string(),
})), ctx => {
  const user = ctx.db.users.identity.find(ctx.sender)
  if (!user?.active) return undefined
  const { id, organizationId, role, displayName } = user
  return { id, organizationId, role, displayName }
})

export const staffApplications = db.view({ name: 'staff_applications', public: true }, t.array(applications.rowType), staffCases)
export const borrowerApplications = db.view({ name: 'borrower_applications', public: true }, t.array(applications.rowType), borrowerCases)

const safeDocument = t.row('DocumentSummary', documentFields)
export const staffDocuments = db.view({ name: 'staff_documents', public: true }, t.array(safeDocument), ctx =>
  staffCases(ctx).flatMap(application => Array.from(ctx.db.documents.applicationId.filter(application.id),
    ({ storageKey: _private, ...document }) => document)))

export const borrowerDocuments = db.view({ name: 'borrower_documents', public: true }, t.array(safeDocument), ctx =>
  borrowerCases(ctx).flatMap(application => Array.from(ctx.db.documents.applicationId.filter(application.id))
    .filter(document => document.uploadedBy === application.borrowerUserId)
    .map(({ storageKey: _private, ...document }) => document)))

export const staffEvidence = db.view({ name: 'staff_evidence', public: true }, t.array(evidence.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.evidence.applicationId.filter(application.id)]))

export const staffCollateral = db.view({ name: 'staff_collateral', public: true }, t.array(collateral.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.collateral.applicationId.filter(application.id)]))

export const staffEntities = db.view({ name: 'staff_entities', public: true }, t.array(entityRecords.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.entityRecords.applicationId.filter(application.id)]))

export const staffMatchCandidates = db.view({ name: 'staff_match_candidates', public: true }, t.array(matchCandidates.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.matchCandidates.leftApplicationId.filter(application.id)]))

const paymentSummary = t.row('PaymentSummary', {
  id: t.string().primaryKey(), applicationId: t.string(), version: t.u32(), maskedDisplay: t.string(),
  beneficiaryName: t.string(), evidenceIds: t.array(t.string()), createdAt: t.timestamp(),
})
export const staffPayments = db.view({ name: 'staff_payments', public: true }, t.array(paymentSummary), ctx =>
  staffCases(ctx).flatMap(application => Array.from(ctx.db.paymentInstructions.applicationId.filter(application.id),
    ({ syntheticAccountToken: _private, ...payment }) => payment)))

const jobSummary = t.row('JobSummary', {
  id: t.string().primaryKey(), applicationId: t.string(), runKey: t.string(), revisions: revisionVector,
  status: t.string(), executionMode: t.string(), modelId: t.option(t.string()), errorCode: t.option(t.string()),
  createdAt: t.timestamp(), startedAt: t.option(t.timestamp()), completedAt: t.option(t.timestamp()),
})
export const staffJobs = db.view({ name: 'staff_jobs', public: true }, t.array(jobSummary), ctx =>
  staffCases(ctx).flatMap(application => Array.from(ctx.db.investigationJobs.applicationId.filter(application.id),
    ({ id, applicationId, runKey, revisions, status, executionMode, modelId, errorCode, createdAt, startedAt, completedAt }) =>
      ({ id, applicationId, runKey, revisions, status, executionMode, modelId, errorCode, createdAt, startedAt, completedAt }))))

export const staffToolEvents = db.view({ name: 'staff_tool_events', public: true }, t.array(toolEvents.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.toolEvents.applicationId.filter(application.id)]))

const findingSummary = t.row('FindingSummary', { ...findings.rowType.row, isCurrent: t.bool() })
export const staffFindings = db.view({ name: 'staff_findings', public: true }, t.array(findingSummary), ctx =>
  staffCases(ctx).flatMap(application => Array.from(ctx.db.findings.applicationId.filter(application.id), finding => ({
    ...finding,
    isCurrent: sourcesMatch(ctx.db, application, finding),
  }))))

export const staffClarifications = db.view({ name: 'staff_clarifications', public: true }, t.array(clarificationRequests.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.clarificationRequests.applicationId.filter(application.id)]))

const borrowerClarification = t.row('BorrowerClarification', {
  id: t.string().primaryKey(), applicationId: t.string(), borrowerSafeMessage: t.string(),
  requestedDocumentType: t.option(t.string()), state: t.string(), sentAt: t.timestamp(),
})
export const borrowerClarifications = db.view({ name: 'borrower_clarifications', public: true }, t.array(borrowerClarification), ctx =>
  borrowerCases(ctx).flatMap(application => [...ctx.db.clarificationRequests.applicationId.filter(application.id)]
    .flatMap(({ id, applicationId, borrowerSafeMessage, requestedDocumentType, state, sentAt }) =>
      sentAt ? [{ id, applicationId, borrowerSafeMessage, requestedDocumentType, state, sentAt }] : [])))

export const staffResponses = db.view({ name: 'staff_responses', public: true }, t.array(borrowerResponses.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.borrowerResponses.applicationId.filter(application.id)]))
export const borrowerOwnResponses = db.view({ name: 'borrower_own_responses', public: true }, t.array(borrowerResponses.rowType), ctx =>
  borrowerCases(ctx).flatMap(application => [...ctx.db.borrowerResponses.applicationId.filter(application.id)]))

export const staffReviews = db.view({ name: 'staff_reviews', public: true }, t.array(reviewRecords.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.reviewRecords.applicationId.filter(application.id)]))

const checkSummary = t.object('CheckSummary', { checkType: t.string(), revision: t.u32(), status: t.string() })
const releaseReadiness = t.row('ReleaseReadiness', {
  applicationId: t.string().primaryKey(), checks: t.array(checkSummary), reasons: t.array(t.string()), canRelease: t.bool(),
})
export const staffReadiness = db.view({ name: 'staff_readiness', public: true }, t.array(releaseReadiness), ctx =>
  staffCases(ctx).map(application => {
    const { clarificationPending: _internal, ...result } = readiness(ctx.db, application)
    return result
  }))

export const staffAuditEvents = db.view({ name: 'staff_audit_events', public: true }, t.array(auditEvents.rowType), ctx =>
  staffCases(ctx).flatMap(application => [...ctx.db.auditEvents.applicationId.filter(application.id)]))
export const staffReleases = db.view({ name: 'staff_releases', public: true }, t.array(demoReleases.rowType), ctx =>
  staffCases(ctx).flatMap(application => {
    const release = ctx.db.demoReleases.applicationId.find(application.id)
    return release ? [release] : []
  }))

function workerJobs(ctx: ReadContext) {
  const user = ctx.db.users.identity.find(ctx.sender)
  if (!user?.active || user.role !== 'worker') return []
  return Array.from(ctx.db.investigationJobs.organizationId.filter(user.organizationId))
}

const availableJob = t.row('AvailableJob', {
  id: t.string().primaryKey(), status: t.string(), leaseExpiresAt: t.option(t.timestamp()), createdAt: t.timestamp(),
})
export const workerAvailableJobs = db.view({ name: 'worker_available_jobs', public: true }, t.array(availableJob), ctx =>
  workerJobs(ctx).filter(job => activeJob(job.status))
    .map(({ id, status, leaseExpiresAt, createdAt }) => ({ id, status, leaseExpiresAt, createdAt })))

const scopedApplication = t.object('ScopedApplication', {
  id: t.string(), businessName: t.string(), amountCents: t.u64(), currency: t.string(), stage: t.string(),
  revisions: revisionVector,
})
const scopedRelationship = t.object('ScopedRelationship', {
  id: t.string(), leftApplicationId: t.string(), rightApplicationId: t.string(), leftEntityId: t.string(),
  rightEntityId: t.string(), decision: t.string(), evidenceIds: t.array(t.string()),
})
const workerSnapshot = t.row('WorkerSnapshot', {
  id: t.string().primaryKey(), applicationId: t.string(), revisions: revisionVector, sources: t.array(sourceRevision),
  claimEpoch: t.u32(), leaseExpiresAt: t.timestamp(), executionMode: t.string(), modelId: t.option(t.string()),
  inputsCurrent: t.bool(), applications: t.array(scopedApplication), documents: t.array(safeDocument),
  evidence: t.array(evidence.rowType), collateral: t.array(collateral.rowType),
  relationships: t.array(scopedRelationship), payment: t.option(paymentSummary),
})
export const workerSnapshots = db.view({ name: 'worker_snapshots', public: true }, t.array(workerSnapshot), ctx => {
  return workerJobs(ctx).flatMap(job => {
    if (job.status !== 'running' || !job.workerIdentity?.isEqual(ctx.sender) || !job.leaseExpiresAt) return []
    const scope = [{ applicationId: job.applicationId, revisions: job.revisions }, ...job.sources]
    const cases = scope.map(source => ctx.db.applications.id.find(source.applicationId))
    const main = cases[0]
    const inputsCurrent = Boolean(main && main.organizationId === job.organizationId && sourcesMatch(ctx.db, main, job))
    const scopedIds = new Set(scope.map(source => source.applicationId))
    const payment = inputsCurrent ? ctx.db.paymentInstructions.id.find(`${job.applicationId}/${job.revisions.paymentRevision}`) : null
    const visibleEvidence = inputsCurrent ? scope.flatMap(({ applicationId }) => jobEvidence(ctx.db, job.applicationId, applicationId, scopedIds)) : []
    const visibleDocs = new Set(visibleEvidence.map(item => item.documentId))
    const visibleEvidenceIds = new Set(visibleEvidence.map(item => item.id))
    return [{
      id: job.id, applicationId: job.applicationId, revisions: job.revisions, sources: job.sources,
      claimEpoch: job.claimEpoch, leaseExpiresAt: job.leaseExpiresAt, executionMode: job.executionMode, modelId: job.modelId,
      inputsCurrent, applications: inputsCurrent ? cases.flatMap(application => {
        if (!application) return []
        const { id, businessName, amountCents, currency, stage } = application
        return [{ id, businessName, amountCents, currency, stage, revisions: revisions(application) }]
      }) : [],
      documents: inputsCurrent ? scope.flatMap(({ applicationId }) => [...ctx.db.documents.applicationId.filter(applicationId)]
        .filter(document => document.current && (applicationId === job.applicationId || visibleDocs.has(document.id)))
        .map(({ storageKey: _private, ...document }) => document)) : [],
      evidence: visibleEvidence,
      collateral: inputsCurrent ? scope.flatMap(({ applicationId }) => jobCollateral(ctx.db, job.applicationId, applicationId)) : [],
      relationships: inputsCurrent ? scope.flatMap(({ applicationId }) => [...ctx.db.matchCandidates.leftApplicationId.filter(applicationId)]
        .filter(edge => edge.decision.startsWith('confirmed_') && scopedIds.has(edge.rightApplicationId))
        .map(({ id, leftApplicationId, rightApplicationId, leftEntityId, rightEntityId, decision }) => {
          const evidenceIds = [...new Set([leftEntityId, rightEntityId].flatMap(entityId =>
            ctx.db.entityRecords.id.find(entityId)?.evidenceIds ?? []))].filter(evidenceId => visibleEvidenceIds.has(evidenceId))
          return { id, leftApplicationId, rightApplicationId, leftEntityId, rightEntityId, decision, evidenceIds }
        })) : [],
      payment: payment ? {
        id: payment.id, applicationId: payment.applicationId, version: payment.version, maskedDisplay: payment.maskedDisplay,
        beneficiaryName: payment.beneficiaryName, evidenceIds: payment.evidenceIds, createdAt: payment.createdAt,
      } : undefined,
    }]
  })
})

const uploadSummary = t.row('UploadSummary', {
  id: t.string().primaryKey(), applicationId: t.string(), requestId: t.option(t.string()), uploaderId: t.string(),
  documentType: t.string(), applicationRevision: t.u32(), expiresAt: t.timestamp(),
})
export const myUploadGrants = db.view({ name: 'my_upload_grants', public: true }, t.array(uploadSummary), ctx => {
  const user = ctx.db.users.identity.find(ctx.sender)
  if (!user?.active || !['officer', 'borrower'].includes(user.role)) return []
  return [...ctx.db.uploadGrants.uploaderId.filter(user.id)].filter(grant => !grant.used)
    .map(({ workerIdentity: _worker, used: _used, ...grant }) => grant)
})

export const workerUploadGrants = db.view({ name: 'worker_upload_grants', public: true }, t.array(uploadSummary), ctx => {
  const user = ctx.db.users.identity.find(ctx.sender)
  if (!user?.active || user.role !== 'worker') return []
  return [...ctx.db.uploadGrants.workerIdentity.filter(ctx.sender)].filter(grant => !grant.used &&
    ctx.db.applications.id.find(grant.applicationId)?.organizationId === user.organizationId)
    .map(({ workerIdentity: _worker, used: _used, ...grant }) => grant)
})
