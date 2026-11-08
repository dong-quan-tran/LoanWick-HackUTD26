import { t } from 'spacetimedb/server'
import {
  actor, audit, caseFor, changeRevisions, deadline, documentTypes, requireCondition, requireDistinct,
  requireEditable, requireId, requireText, validateEvidence,
} from './domain'
import { db, evidenceInputFields } from './schema'

export const authorizeUpload = db.reducer({
  grantId: t.string(), applicationId: t.string(), requestId: t.option(t.string()), workerUserId: t.string(), documentType: t.string(),
}, (ctx, args) => {
  const user = actor(ctx, 'officer', 'borrower')
  const application = caseFor(ctx.db, user, args.applicationId)
  requireEditable(application)
  requireId(args.grantId)
  requireCondition(documentTypes.some(type => type === args.documentType) && !ctx.db.uploadGrants.id.find(args.grantId), 'INVALID_INPUT')
  const worker = ctx.db.users.id.find(args.workerUserId)
  requireCondition(worker?.active && worker.role === 'worker' && worker.organizationId === user.organizationId, 'NOT_FOUND_OR_FORBIDDEN')
  if (args.requestId !== undefined || user.role === 'borrower') {
    const request = args.requestId !== undefined ? ctx.db.clarificationRequests.id.find(args.requestId) : undefined
    requireCondition(request?.applicationId === application.id && request.state === 'sent' &&
      request.requestedDocumentType === args.documentType, 'NOT_FOUND_OR_FORBIDDEN')
  }
  ctx.db.uploadGrants.insert({
    id: args.grantId, applicationId: application.id, requestId: args.requestId, uploaderId: user.id,
    workerIdentity: worker.identity, documentType: args.documentType, applicationRevision: application.applicationRevision,
    expiresAt: deadline(ctx, 300), used: false,
  })
  audit(ctx, application.id, user.id, 'upload_authorized', args.grantId)
})

export const attachDocument = db.reducer({
  grantId: t.string(), documentId: t.string(), replacesDocumentId: t.option(t.string()), sha256: t.string(),
  displayFilename: t.string(), storageKey: t.string(), extractionStatus: t.string(),
  evidence: t.array(t.object('EvidenceInput', evidenceInputFields)),
}, (ctx, args) => {
  const worker = actor(ctx, 'worker')
  const grant = ctx.db.uploadGrants.id.find(args.grantId)
  requireCondition(grant && grant.workerIdentity.isEqual(ctx.sender), 'NOT_FOUND_OR_FORBIDDEN')
  requireCondition(!grant.used && grant.expiresAt.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch, 'INVALID_STATE')
  const application = caseFor(ctx.db, worker, grant.applicationId)
  requireEditable(application)
  requireCondition(application.applicationRevision === grant.applicationRevision, 'STALE_RESULTS')
  const uploader = ctx.db.users.id.find(grant.uploaderId)
  requireCondition(uploader?.active && ['borrower', 'officer'].includes(uploader.role), 'NOT_FOUND_OR_FORBIDDEN')
  caseFor(ctx.db, uploader, application.id)
  if (grant.requestId !== undefined) {
    const request = ctx.db.clarificationRequests.id.find(grant.requestId)
    requireCondition(request?.applicationId === application.id && request.state === 'sent', 'INVALID_STATE')
  }
  requireId(args.documentId)
  requireId(args.storageKey)
  requireText(args.displayFilename, 140)
  requireCondition(/^[0-9a-f]{64}$/i.test(args.sha256) && !/[<>:"/\\|?*\x00-\x1f]/.test(args.displayFilename) &&
    !['.', '..'].includes(args.displayFilename.trim()) && !ctx.db.documents.id.find(args.documentId), 'INVALID_INPUT')
  requireCondition(['extracted', 'failed', 'unsupported'].includes(args.extractionStatus) &&
    (args.extractionStatus === 'extracted' || args.evidence.length === 0), 'INVALID_INPUT')
  requireDistinct(args.evidence.map(item => item.id), 64)
  let version = 1
  if (args.replacesDocumentId !== undefined) {
    const prior = ctx.db.documents.id.find(args.replacesDocumentId)
    requireCondition(prior?.applicationId === application.id && prior.type === grant.documentType && prior.current &&
      (uploader.role === 'officer' || prior.uploadedBy === uploader.id), 'NOT_FOUND_OR_FORBIDDEN')
    version = prior.version + 1
    ctx.db.documents.id.update({ ...prior, current: false })
    if (grant.documentType === 'collateral_schedule') {
      for (const claim of ctx.db.collateral.applicationId.filter(application.id)) {
        if (claim.active && claim.evidenceIds.some(id => ctx.db.evidence.id.find(id)?.documentId === prior.id)) {
          ctx.db.collateral.id.update({ ...claim, active: false })
        }
      }
    }
  }
  if (grant.documentType === 'payment_instructions') {
    for (const prior of ctx.db.documents.applicationId.filter(application.id)) {
      if (prior.type !== 'payment_instructions') continue
      version = Math.max(version, prior.version + 1)
      if (prior.current) ctx.db.documents.id.update({ ...prior, current: false })
    }
  }
  ctx.db.documents.insert({
    id: args.documentId, applicationId: application.id, type: grant.documentType, version,
    sha256: args.sha256.toLowerCase(), displayFilename: args.displayFilename.trim(), extractionStatus: args.extractionStatus,
    uploadedBy: uploader.id, requestId: grant.requestId, storageKey: args.storageKey, current: true, createdAt: ctx.timestamp,
  })
  for (const item of args.evidence) {
    requireId(item.id)
    requireText(item.excerpt, 5000)
    requireId(item.extractionMethod)
    for (const field of [item.fieldName, item.fieldValue, item.locator]) {
      if (field !== undefined) requireText(field, 1000)
    }
    requireCondition((item.pageNumber === undefined || item.pageNumber > 0) && !ctx.db.evidence.id.find(item.id), 'INVALID_INPUT')
    ctx.db.evidence.insert({ ...item, applicationId: application.id, documentId: args.documentId, documentVersion: version, createdAt: ctx.timestamp })
  }
  ctx.db.uploadGrants.id.update({ ...grant, used: true })
  const scope = grant.documentType === 'collateral_schedule' ? 'collateral'
    : grant.documentType === 'payment_instructions' ? 'payment' : 'other'
  changeRevisions(ctx, application, scope)
  audit(ctx, application.id, worker.id, 'document_attached', args.documentId)
})

export const recordCollateralClaim = db.reducer({
  id: t.string(), applicationId: t.string(), expectedCollateralRevision: t.u32(), identifier: t.string(), normalizedIdentifier: t.string(),
  description: t.string(), active: t.bool(), exclusiveOwnershipClaim: t.bool(), evidenceIds: t.array(t.string()),
}, (ctx, { expectedCollateralRevision, ...claim }) => {
  const officer = actor(ctx, 'officer')
  const application = caseFor(ctx.db, officer, claim.applicationId)
  requireEditable(application)
  requireCondition(application.collateralRevision === expectedCollateralRevision, 'STALE_REVIEW')
  requireId(claim.id)
  requireText(claim.identifier, 100)
  requireText(claim.normalizedIdentifier, 100)
  requireText(claim.description, 500)
  const evidence = validateEvidence(ctx.db, claim.evidenceIds, new Set([application.id]))
  requireCondition(!claim.active || (evidence.length > 0 && evidence.every(item => ctx.db.documents.id.find(item.documentId)?.current)), 'INVALID_EVIDENCE')
  const existing = ctx.db.collateral.id.find(claim.id)
  requireCondition(!existing || existing.applicationId === application.id, 'NOT_FOUND_OR_FORBIDDEN')
  if (existing) ctx.db.collateral.id.update(claim)
  else ctx.db.collateral.insert(claim)
  changeRevisions(ctx, application, 'collateral')
  audit(ctx, application.id, officer.id, 'collateral_changed', claim.id)
})

export const recordEntity = db.reducer({
  id: t.string(), applicationId: t.string(), name: t.string(), normalizedName: t.string(),
  externalIdentifier: t.option(t.string()), address: t.option(t.string()), evidenceIds: t.array(t.string()),
}, (ctx, entity) => {
  const officer = actor(ctx, 'officer')
  const application = caseFor(ctx.db, officer, entity.applicationId)
  requireEditable(application)
  requireId(entity.id)
  requireText(entity.name, 160)
  requireText(entity.normalizedName, 160)
  if (entity.externalIdentifier !== undefined) requireText(entity.externalIdentifier, 100)
  if (entity.address !== undefined) requireText(entity.address, 250)
  validateEvidence(ctx.db, entity.evidenceIds, new Set([application.id]))
  requireCondition(!ctx.db.entityRecords.id.find(entity.id), 'INVALID_INPUT')
  ctx.db.entityRecords.insert({ ...entity, externalIdentifier: entity.externalIdentifier, address: entity.address })
  changeRevisions(ctx, application, 'other')
  audit(ctx, application.id, officer.id, 'entity_recorded', entity.id)
})

export const createMatchCandidate = db.reducer({
  id: t.string(), leftEntityId: t.string(), rightEntityId: t.string(), matchedAttributes: t.array(t.string()), similarityScore: t.u16(),
}, (ctx, args) => {
  const officer = actor(ctx, 'officer')
  const leftEntity = ctx.db.entityRecords.id.find(args.leftEntityId)
  const rightEntity = ctx.db.entityRecords.id.find(args.rightEntityId)
  requireCondition(leftEntity && rightEntity, 'NOT_FOUND_OR_FORBIDDEN')
  const left = caseFor(ctx.db, officer, leftEntity.applicationId)
  const right = caseFor(ctx.db, officer, rightEntity.applicationId)
  requireId(args.id)
  requireDistinct(args.matchedAttributes, 12)
  for (const attribute of args.matchedAttributes) requireId(attribute)
  requireCondition(left.id !== right.id && args.similarityScore <= 10000 && !ctx.db.matchCandidates.id.find(args.id), 'INVALID_INPUT')
  ctx.db.matchCandidates.insert({
    ...args, leftApplicationId: left.id, rightApplicationId: right.id, decision: 'candidate',
    reviewerId: undefined, rationale: undefined, reviewedAt: undefined,
  })
  audit(ctx, left.id, officer.id, 'match_candidate_created', args.id)
})

export const reviewMatchCandidate = db.reducer({ candidateId: t.string(), decision: t.string(), rationale: t.string() }, (ctx, args) => {
  const staff = actor(ctx, 'officer', 'reviewer')
  const edge = ctx.db.matchCandidates.id.find(args.candidateId)
  requireCondition(edge, 'NOT_FOUND_OR_FORBIDDEN')
  const left = caseFor(ctx.db, staff, edge.leftApplicationId)
  const right = caseFor(ctx.db, staff, edge.rightApplicationId)
  requireText(args.rationale, 1600)
  requireCondition(['confirmed_same_entity', 'confirmed_related', 'rejected'].includes(args.decision), 'INVALID_INPUT')
  if (args.decision !== edge.decision && (edge.decision.startsWith('confirmed_') || args.decision.startsWith('confirmed_'))) {
    changeRevisions(ctx, left, 'other')
    changeRevisions(ctx, right, 'other')
  }
  ctx.db.matchCandidates.id.update({
    ...edge, decision: args.decision, reviewerId: staff.id, rationale: args.rationale.trim(), reviewedAt: ctx.timestamp,
  })
  audit(ctx, left.id, staff.id, 'match_candidate_reviewed', edge.id)
  audit(ctx, right.id, staff.id, 'match_candidate_reviewed', edge.id)
})
