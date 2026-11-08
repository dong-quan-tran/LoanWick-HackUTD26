import { t } from 'spacetimedb/server'
import {
  actor, audit, caseFor, changeRevisions, currentRevision, readiness, requireCondition, requireDistinct,
  requireEditable, requireId, requiredChecks, requireText, syncStage, validateEvidence,
} from './domain'
import { db } from './schema'

export const createApplication = db.reducer({
  id: t.string(), borrowerUserId: t.string(), businessName: t.string(), amountCents: t.u64(), currency: t.string(),
}, (ctx, args) => {
  const user = actor(ctx, 'officer', 'borrower')
  requireId(args.id)
  requireText(args.businessName, 160)
  requireCondition(args.amountCents > 0n && args.amountCents <= BigInt(Number.MAX_SAFE_INTEGER) &&
    /^[A-Z]{3}$/.test(args.currency) && !ctx.db.applications.id.find(args.id), 'INVALID_INPUT')
  const borrower = ctx.db.users.id.find(args.borrowerUserId)
  requireCondition(borrower?.active && borrower.role === 'borrower' && borrower.organizationId === user.organizationId &&
    (user.role !== 'borrower' || user.id === borrower.id), 'NOT_FOUND_OR_FORBIDDEN')
  ctx.db.applications.insert({
    ...args, organizationId: user.organizationId, stage: 'draft', applicationRevision: 1, collateralRevision: 0,
    paymentRevision: 0, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
  })
  audit(ctx, args.id, user.id, 'application_created', '')
})

export const submitApplication = db.reducer({ applicationId: t.string() }, (ctx, { applicationId }) => {
  const user = actor(ctx, 'officer', 'borrower')
  const application = caseFor(ctx.db, user, applicationId)
  requireCondition(application.stage === 'draft', 'INVALID_STATE')
  ctx.db.applications.id.update({ ...application, stage: 'submitted', updatedAt: ctx.timestamp })
  audit(ctx, application.id, user.id, 'application_submitted', '')
})

const requestTemplates = new Map([
  ['collateral', {
    message: 'Please confirm the equipment you intend to pledge and provide an updated schedule or proof of ownership.',
    documentType: 'collateral_schedule',
  }],
  ['financials', {
    message: 'Please provide a current financial statement and confirm the reporting period it covers.',
    documentType: 'financial_statement',
  }],
  ['supporting', {
    message: 'Please clarify the information in your application and provide supporting documentation if available.',
    documentType: 'supporting_document',
  }],
])

export const createClarificationDraft = db.reducer({
  requestId: t.string(), findingId: t.string(), template: t.string(),
}, (ctx, { requestId, findingId, template }) => {
  const user = actor(ctx, 'officer', 'worker')
  requireId(requestId)
  const selected = requestTemplates.get(template)
  requireCondition(selected && !ctx.db.clarificationRequests.id.find(requestId), 'INVALID_INPUT')
  const finding = ctx.db.findings.id.find(findingId)
  requireCondition(finding, 'NOT_FOUND_OR_FORBIDDEN')
  const application = caseFor(ctx.db, user, finding.applicationId)
  requireEditable(application)
  if (user.role === 'worker') {
    const job = ctx.db.investigationJobs.id.find(finding.jobId)
    requireCondition(job?.status === 'succeeded' && job.workerIdentity?.isEqual(ctx.sender), 'NOT_FOUND_OR_FORBIDDEN')
  }
  requireCondition(finding.status === 'open' || finding.status === 'escalated', 'INVALID_STATE')
  ctx.db.clarificationRequests.insert({
    id: requestId, applicationId: application.id, findingId, borrowerSafeMessage: selected.message,
    requestedDocumentType: selected.documentType, state: 'draft', draftedBy: user.id, sentBy: undefined,
    createdAt: ctx.timestamp, sentAt: undefined,
  })
  audit(ctx, application.id, user.id, 'clarification_drafted', requestId)
})

export const sendClarification = db.reducer({ requestId: t.string() }, (ctx, { requestId }) => {
  const officer = actor(ctx, 'officer')
  const request = ctx.db.clarificationRequests.id.find(requestId)
  requireCondition(request, 'NOT_FOUND_OR_FORBIDDEN')
  const application = caseFor(ctx.db, officer, request.applicationId)
  requireEditable(application)
  const finding = ctx.db.findings.id.find(request.findingId)
  requireCondition(request.state === 'draft' && finding &&
    (finding.status === 'open' || finding.status === 'escalated') &&
    !Array.from(ctx.db.clarificationRequests.findingId.filter(finding.id))
      .some(item => item.state === 'sent' || item.state === 'answered'), 'INVALID_STATE')
  ctx.db.clarificationRequests.id.update({ ...request, state: 'sent', sentBy: officer.id, sentAt: ctx.timestamp })
  ctx.db.findings.id.update({ ...finding, status: 'awaiting_response', updatedAt: ctx.timestamp })
  syncStage(ctx, application)
  audit(ctx, application.id, officer.id, 'clarification_sent', requestId)
})

export const submitBorrowerResponse = db.reducer({
  requestId: t.string(), message: t.string(), documentIds: t.array(t.string()),
}, (ctx, { requestId, message, documentIds }) => {
  const borrower = actor(ctx, 'borrower')
  const request = ctx.db.clarificationRequests.id.find(requestId)
  requireCondition(request && request.sentAt, 'NOT_FOUND_OR_FORBIDDEN')
  const application = caseFor(ctx.db, borrower, request.applicationId)
  requireEditable(application)
  requireCondition(request.state === 'sent', 'INVALID_STATE')
  requireText(message, 3000)
  requireDistinct(documentIds, 16)
  for (const id of documentIds) {
    const document = ctx.db.documents.id.find(id)
    requireCondition(document?.applicationId === application.id && document.requestId === requestId &&
      document.uploadedBy === borrower.id && document.current, 'NOT_FOUND_OR_FORBIDDEN')
  }
  ctx.db.borrowerResponses.insert({
    id: ctx.newUuidV7().toString(), requestId, applicationId: application.id, message: message.trim(), documentIds,
    submittedBy: borrower.id, createdAt: ctx.timestamp,
  })
  ctx.db.clarificationRequests.id.update({ ...request, state: 'answered' })
  changeRevisions(ctx, application, 'other')
  audit(ctx, application.id, borrower.id, 'clarification_answered', requestId)
})

export const decideFinding = db.reducer({
  findingId: t.string(), decision: t.string(), rationale: t.string(), evidenceIds: t.array(t.string()),
}, (ctx, { findingId, decision, rationale, evidenceIds }) => {
  const user = actor(ctx, 'officer', 'reviewer')
  const finding = ctx.db.findings.id.find(findingId)
  requireCondition(finding, 'NOT_FOUND_OR_FORBIDDEN')
  const application = caseFor(ctx.db, user, finding.applicationId)
  requireEditable(application)
  requireText(rationale, 1600)
  requireCondition(['resolve', 'escalate', 'reopen'].includes(decision), 'INVALID_INPUT')
  requireCondition(decision === 'reopen' ? finding.status === 'resolved' : finding.status !== 'resolved', 'INVALID_STATE')
  validateEvidence(ctx.db, evidenceIds, new Set([application.id, ...finding.relatedApplicationIds]))
  const status = decision === 'resolve' ? 'resolved' : decision === 'escalate' ? 'escalated' : 'open'
  ctx.db.findings.id.update({ ...finding, status, updatedAt: ctx.timestamp })
  for (const request of ctx.db.clarificationRequests.findingId.filter(findingId)) {
    if (request.state !== 'closed') ctx.db.clarificationRequests.id.update({ ...request, state: 'closed' })
  }
  syncStage(ctx, application)
  audit(ctx, application.id, user.id, `finding_${status}`, JSON.stringify({ findingId, rationale: rationale.trim(), evidenceIds }))
})

export const recordReview = db.reducer({
  applicationId: t.string(), checkType: t.string(), expectedRevision: t.u32(), status: t.string(),
  rationale: t.string(), evidenceIds: t.array(t.string()),
}, (ctx, args) => {
  const reviewer = actor(ctx, 'reviewer')
  const application = caseFor(ctx.db, reviewer, args.applicationId)
  requireEditable(application)
  requireCondition(application.stage !== 'draft' && application.stage !== 'submitted', 'INVALID_STATE')
  requireCondition(requiredChecks.some(check => check === args.checkType) &&
    ['passed', 'needs_review'].includes(args.status), 'INVALID_INPUT')
  requireText(args.rationale, 1600)
  const actualRevision = currentRevision(application, args.checkType)
  requireCondition(actualRevision === args.expectedRevision, 'STALE_REVIEW')
  const evidence = validateEvidence(ctx.db, args.evidenceIds, new Set([application.id]))
  if (args.status === 'passed') {
    requireCondition(evidence.length > 0 && evidence.every(item => ctx.db.documents.id.find(item.documentId)?.current), 'INVALID_EVIDENCE')
    if (args.checkType === 'payment_verification') {
      requireCondition(ctx.db.paymentInstructions.id.find(`${application.id}/${application.paymentRevision}`), 'INVALID_STATE')
    }
  }
  for (const review of ctx.db.reviewRecords.applicationId.filter(application.id)) {
    if (!review.superseded && review.checkType === args.checkType) ctx.db.reviewRecords.id.update({ ...review, superseded: true })
  }
  const id = ctx.newUuidV7().toString()
  ctx.db.reviewRecords.insert({
    id, applicationId: application.id, checkType: args.checkType, observedRelevantRevision: actualRevision, status: args.status,
    rationale: args.rationale.trim(), evidenceIds: args.evidenceIds, reviewerId: reviewer.id, superseded: false, createdAt: ctx.timestamp,
  })
  syncStage(ctx, application)
  audit(ctx, application.id, reviewer.id, 'review_recorded', id)
})

export const changePaymentInstructions = db.reducer({
  applicationId: t.string(), expectedPaymentRevision: t.u32(), syntheticAccountToken: t.string(),
  maskedDisplay: t.string(), beneficiaryName: t.string(), evidenceIds: t.array(t.string()),
}, (ctx, args) => {
  const reviewer = actor(ctx, 'reviewer')
  const application = caseFor(ctx.db, reviewer, args.applicationId)
  requireEditable(application)
  requireCondition(args.expectedPaymentRevision === application.paymentRevision, 'STALE_REVIEW')
  requireCondition(/^demo_[a-zA-Z0-9_-]{1,64}$/.test(args.syntheticAccountToken) &&
    /^\*{4} [0-9]{4}$/.test(args.maskedDisplay), 'INVALID_INPUT')
  requireText(args.beneficiaryName, 160)
  validateEvidence(ctx.db, args.evidenceIds, new Set([application.id]))
  const version = application.paymentRevision + 1
  ctx.db.paymentInstructions.insert({
    id: `${application.id}/${version}`, applicationId: application.id, version, syntheticAccountToken: args.syntheticAccountToken,
    maskedDisplay: args.maskedDisplay, beneficiaryName: args.beneficiaryName.trim(), evidenceIds: args.evidenceIds,
    createdAt: ctx.timestamp,
  })
  changeRevisions(ctx, application, 'payment')
  audit(ctx, application.id, reviewer.id, 'payment_instructions_changed', `version ${version}`)
})

export const simulateRelease = db.reducer({ applicationId: t.string(), idempotencyKey: t.string() }, (ctx, args) => {
  const reviewer = actor(ctx, 'reviewer')
  const application = caseFor(ctx.db, reviewer, args.applicationId)
  requireId(args.idempotencyKey)
  const prior = ctx.db.demoReleases.applicationId.find(application.id)
  if (prior) {
    requireCondition(prior.idempotencyKey === args.idempotencyKey, 'ALREADY_RELEASED')
    return
  }
  const result = readiness(ctx.db, application)
  requireCondition(result.canRelease, result.reasons[0] ?? 'INVALID_STATE')
  requireCondition(application.stage === 'ready_for_release', 'INVALID_STATE')
  ctx.db.demoReleases.insert({
    id: ctx.newUuidV7().toString(), applicationId: application.id, idempotencyKey: args.idempotencyKey,
    releasedBy: reviewer.id, releasedAt: ctx.timestamp, syntheticAmountCents: application.amountCents, currency: application.currency,
  })
  ctx.db.applications.id.update({ ...application, stage: 'released_demo', updatedAt: ctx.timestamp })
  audit(ctx, application.id, reviewer.id, 'simulated_release', 'SIMULATED RELEASE — NO MONEY MOVED')
})
