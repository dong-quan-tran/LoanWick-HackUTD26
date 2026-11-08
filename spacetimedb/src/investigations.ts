import { ScheduleAt } from 'spacetimedb'
import { t } from 'spacetimedb/server'
import {
  activeJob, actor, audit, caseFor, deadline, requireCondition, requireDistinct,
  requireEditable, requireId, requireText, revisions, syncStage, validateEvidence,
} from './domain'
import { db, findingInputFields, leaseTimers, type InvestigationJob, type WriteContext } from './schema'

import { jobEvidence, matchesRevisions, relatedSources, sourcesMatch, verifiesOwnershipConflict } from './scope'

function jobFor(ctx: WriteContext, jobId: string, organizationId: string) {
  const job = ctx.db.investigationJobs.id.find(jobId)
  requireCondition(job && job.organizationId === organizationId, 'NOT_FOUND_OR_FORBIDDEN')
  return job
}

function hasLease(ctx: WriteContext, job: ReturnType<typeof jobFor>, epoch: number) {
  return job.status === 'running' && job.workerIdentity?.isEqual(ctx.sender) && job.claimEpoch === epoch &&
    job.leaseExpiresAt && job.leaseExpiresAt.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch
}

function stopJob(ctx: WriteContext, job: ReturnType<typeof jobFor>, status: string, errorCode?: string) {
  ctx.db.investigationJobs.id.update({ ...job, status, errorCode, completedAt: ctx.timestamp })
  const application = ctx.db.applications.id.find(job.applicationId)
  if (application) syncStage(ctx, application)
}

function assignLease(ctx: WriteContext, job: InvestigationJob, leaseSeconds: number) {
  const leaseExpiresAt = deadline(ctx, leaseSeconds)
  ctx.db.investigationJobs.id.update({ ...job, leaseExpiresAt })
  ctx.db.leaseTimers.insert({
    scheduledId: 0n, scheduledAt: ScheduleAt.time(leaseExpiresAt.microsSinceUnixEpoch), jobId: job.id, claimEpoch: job.claimEpoch,
  })
}

export const expireInvestigationLease = db.reducer({ onSchedule: leaseTimers }, { timer: leaseTimers.rowType }, (ctx, { timer }) => {
  requireCondition(ctx.senderAuth.isInternal, 'UNAUTHORIZED')
  const job = ctx.db.investigationJobs.id.find(timer.jobId)
  if (!job || job.status !== 'running' || job.claimEpoch !== timer.claimEpoch || !job.leaseExpiresAt ||
    job.leaseExpiresAt.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch) return
  if (job.claimEpoch >= 3) stopJob(ctx, job, 'failed', 'LEASE_EXHAUSTED')
  else ctx.db.investigationJobs.id.update({ ...job, status: 'queued', workerIdentity: undefined, leaseExpiresAt: undefined })
  audit(ctx, job.applicationId, 'scheduler', 'investigation_lease_expired', job.id)
})

export const requestInvestigation = db.reducer({
  applicationId: t.string(), runKey: t.string(), executionMode: t.string(), modelId: t.option(t.string()),
}, (ctx, args) => {
  const officer = actor(ctx, 'officer')
  const application = caseFor(ctx.db, officer, args.applicationId)
  requireId(args.runKey)
  requireCondition(args.executionMode === 'fixture' || args.executionMode === 'live', 'INVALID_INPUT')
  if (args.modelId !== undefined) requireText(args.modelId, 120)
  const requestKey = `${application.id}/${args.runKey}`
  const previous = ctx.db.investigationJobs.requestKey.find(requestKey)
  if (previous) {
    requireCondition(previous.executionMode === args.executionMode && (args.modelId === undefined || previous.modelId === args.modelId), 'INVALID_INPUT')
    return
  }
  requireEditable(application)
  requireCondition(application.stage !== 'draft' &&
    !Array.from(ctx.db.investigationJobs.applicationId.filter(application.id)).some(job => activeJob(job.status)), 'INVALID_STATE')
  const id = ctx.newUuidV7().toString()
  ctx.db.investigationJobs.insert({
    ...args, modelId: args.modelId, id, requestKey, organizationId: officer.organizationId, revisions: revisions(application), sources: [],
    status: 'queued', workerIdentity: undefined, claimEpoch: 0, leaseExpiresAt: undefined,
    createdAt: ctx.timestamp, startedAt: undefined, completedAt: undefined, errorCode: undefined, acceptedFindingIds: undefined,
  })
  const next = application.stage === 'submitted'
    ? ctx.db.applications.id.update({ ...application, stage: 'reviewing', updatedAt: ctx.timestamp }) : application
  syncStage(ctx, next)
  audit(ctx, application.id, officer.id, 'investigation_requested', id)
})

export const claimInvestigation = db.reducer({ jobId: t.string(), leaseSeconds: t.u32() }, (ctx, { jobId, leaseSeconds }) => {
  const worker = actor(ctx, 'worker')
  const job = jobFor(ctx, jobId, worker.organizationId)
  requireCondition(leaseSeconds >= 1 && leaseSeconds <= 120, 'INVALID_INPUT')
  const expired = job.status === 'running' && job.leaseExpiresAt &&
    job.leaseExpiresAt.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch
  requireCondition(job.status === 'queued' || expired, 'LEASE_LOST')
  requireCondition(job.claimEpoch < 3, 'LEASE_EXHAUSTED')
  const application = caseFor(ctx.db, worker, job.applicationId)
  requireEditable(application)
  if (!matchesRevisions(application, job.revisions)) {
    stopJob(ctx, { ...job, workerIdentity: ctx.sender, claimEpoch: job.claimEpoch + 1 }, 'failed', 'STALE_RESULTS')
    audit(ctx, application.id, worker.id, 'investigation_stale', job.id)
    return
  }
  const sourceIds = relatedSources(ctx.db, application)
  requireCondition(sourceIds.length <= 64, 'SOURCE_SCOPE_TOO_LARGE')
  const sources = sourceIds.map(applicationId => ({
    applicationId, revisions: revisions(caseFor(ctx.db, worker, applicationId)),
  }))
  assignLease(ctx, {
    ...job, sources, status: 'running', workerIdentity: ctx.sender, claimEpoch: job.claimEpoch + 1,
    startedAt: job.startedAt ?? ctx.timestamp,
  }, leaseSeconds)
  audit(ctx, application.id, worker.id, 'investigation_claimed', job.id)
})

export const renewInvestigation = db.reducer({
  jobId: t.string(), claimEpoch: t.u32(), leaseSeconds: t.u32(),
}, (ctx, { jobId, claimEpoch, leaseSeconds }) => {
  const worker = actor(ctx, 'worker')
  const job = jobFor(ctx, jobId, worker.organizationId)
  requireCondition(hasLease(ctx, job, claimEpoch), 'LEASE_LOST')
  requireCondition(leaseSeconds >= 1 && leaseSeconds <= 120, 'INVALID_INPUT')
  requireCondition(job.startedAt && ctx.timestamp.microsSinceUnixEpoch - job.startedAt.microsSinceUnixEpoch < 300_000_000n, 'LEASE_EXHAUSTED')
  assignLease(ctx, job, leaseSeconds)
})

export const recordToolEvent = db.reducer({
  jobId: t.string(), claimEpoch: t.u32(), sequence: t.u32(), toolName: t.string(), status: t.string(),
  inputSummary: t.string(), outputSummary: t.string(), durationMs: t.u32(),
}, (ctx, args) => {
  const worker = actor(ctx, 'worker')
  const job = jobFor(ctx, args.jobId, worker.organizationId)
  requireCondition(hasLease(ctx, job, args.claimEpoch), 'LEASE_LOST')
  requireId(args.toolName)
  requireText(args.inputSummary, 280, true)
  requireText(args.outputSummary, 280, true)
  requireCondition(['started', 'succeeded', 'failed'].includes(args.status) && args.sequence >= 1 && args.sequence <= 100 &&
    args.durationMs <= 120_000 && !/[\r\n]/.test(args.inputSummary + args.outputSummary), 'INVALID_INPUT')
  const prefix = `${job.id}/${job.claimEpoch}/`
  const id = `${prefix}${args.sequence}`
  const existing = ctx.db.toolEvents.id.find(id)
  if (existing) {
    requireCondition(existing.toolName === args.toolName && existing.status === args.status &&
      existing.inputSummary === args.inputSummary && existing.outputSummary === args.outputSummary &&
      existing.durationMs === args.durationMs, 'INVALID_INPUT')
    return
  }
  requireCondition(args.sequence === 1 || ctx.db.toolEvents.id.find(`${prefix}${args.sequence - 1}`), 'INVALID_INPUT')
  ctx.db.toolEvents.insert({ ...args, id, applicationId: job.applicationId, createdAt: ctx.timestamp })
})

const findingInput = t.object('FindingInput', findingInputFields)

export const completeInvestigation = db.reducer({
  jobId: t.string(), claimEpoch: t.u32(), modelId: t.option(t.string()), findings: t.array(findingInput),
}, (ctx, args) => {
  const worker = actor(ctx, 'worker')
  const job = jobFor(ctx, args.jobId, worker.organizationId)
  if (job.status === 'succeeded' && job.workerIdentity?.isEqual(ctx.sender) && job.claimEpoch === args.claimEpoch) return
  requireCondition(hasLease(ctx, job, args.claimEpoch), 'LEASE_LOST')
  const application = caseFor(ctx.db, worker, job.applicationId)
  requireEditable(application)
  if (!sourcesMatch(ctx.db, application, job)) {
    stopJob(ctx, job, 'failed', 'STALE_RESULTS')
    audit(ctx, application.id, worker.id, 'investigation_stale', job.id)
    return
  }
  const modelId = args.modelId ?? job.modelId
  if (job.executionMode === 'live') requireCondition(modelId && (!job.modelId || modelId === job.modelId), 'INVALID_INPUT')
  if (modelId !== undefined) requireText(modelId, 120)
  requireDistinct(args.findings.map(finding => finding.deduplicationKey), 20)
  const scope = new Set([application.id, ...job.sources.map(source => source.applicationId)])
  const visibleEvidence = new Set([...scope].flatMap(id => jobEvidence(ctx.db, application.id, id, scope).map(item => item.id)))
  const acceptedFindingIds: string[] = []
  for (const finding of args.findings) {
    requireId(finding.type)
    requireText(finding.title, 140)
    requireText(finding.explanation, 1600)
    requireText(finding.uncertainty, 500, true)
    requireText(finding.suggestedNextStep, 500)
    requireText(finding.ruleVersion, 80)
    requireText(finding.deduplicationKey, 140)
    requireDistinct(finding.relatedApplicationIds, 32)
    requireCondition(['info', 'review', 'high'].includes(finding.severity) &&
      ['supported', 'contradicted', 'unknown'].includes(finding.evidenceState) &&
      (finding.evidenceState === 'unknown' || finding.evidenceIds.length > 0) &&
      (finding.evidenceState !== 'unknown' || finding.severity !== 'high') &&
      finding.relatedApplicationIds.every(id => id !== application.id && scope.has(id)), 'INVALID_INPUT')
    const citedScope = new Set([application.id, ...finding.relatedApplicationIds])
    validateEvidence(ctx.db, finding.evidenceIds, citedScope)
    requireCondition(finding.evidenceIds.every(id => visibleEvidence.has(id)), 'INVALID_EVIDENCE')
    const crossCaseOwnershipVerified = finding.type === 'collateral_conflict' && finding.severity === 'high' &&
      finding.relatedApplicationIds.length > 0
    if (crossCaseOwnershipVerified) {
      requireCondition(verifiesOwnershipConflict(ctx.db, [...citedScope], finding.evidenceIds), 'INVALID_EVIDENCE')
    }
    const active = [...ctx.db.findings.applicationId.filter(application.id)]
      .filter(prior => prior.status !== 'resolved' && prior.deduplicationKey === finding.deduplicationKey)
      .sort((a, b) => Number(b.status === 'awaiting_response') - Number(a.status === 'awaiting_response') || a.id.localeCompare(b.id))
    const [prior, ...duplicates] = active
    const id = prior?.id ?? ctx.newUuidV7().toString()
    const next = {
      ...finding, id, applicationId: application.id, jobId: job.id, status: prior?.status ?? 'open',
      revisions: job.revisions, sources: job.sources, crossCaseOwnershipVerified,
      createdAt: prior?.createdAt ?? ctx.timestamp, updatedAt: ctx.timestamp,
    }
    if (prior) {
      requireCondition(active.every(item => item.type === finding.type &&
        (item.severity !== 'high' || (finding.severity === 'high' &&
          item.relatedApplicationIds.every(caseId => finding.relatedApplicationIds.includes(caseId))))), 'INVALID_INPUT')
      const priorJob = ctx.db.investigationJobs.id.find(prior.jobId)
      if (priorJob?.status === 'succeeded' && priorJob.acceptedFindingIds === undefined) {
        ctx.db.investigationJobs.id.update({ ...priorJob,
          acceptedFindingIds: [...ctx.db.findings.jobId.filter(priorJob.id)].map(item => item.id) })
      }
      audit(ctx, application.id, worker.id, 'finding_refreshed', JSON.stringify({
        ...prior, createdAt: prior.createdAt.toISOString(), updatedAt: prior.updatedAt.toISOString(),
      }))
      ctx.db.findings.id.update(next)
    } else {
      ctx.db.findings.insert(next)
    }
    for (const duplicate of duplicates) {
      for (const request of ctx.db.clarificationRequests.findingId.filter(duplicate.id)) {
        if (request.state !== 'closed') ctx.db.clarificationRequests.id.update({ ...request, findingId: id })
      }
      ctx.db.findings.id.update({ ...duplicate, status: 'resolved', updatedAt: ctx.timestamp })
      audit(ctx, application.id, worker.id, 'finding_superseded', JSON.stringify({
        prior: { ...duplicate, createdAt: duplicate.createdAt.toISOString(), updatedAt: duplicate.updatedAt.toISOString() },
        replacementId: id,
      }))
    }
    acceptedFindingIds.push(id)
  }
  stopJob(ctx, { ...job, modelId, acceptedFindingIds }, 'succeeded')
  audit(ctx, application.id, worker.id, 'investigation_completed', job.id)
})

export const failInvestigation = db.reducer({ jobId: t.string(), claimEpoch: t.u32(), errorCode: t.string() }, (ctx, args) => {
  const worker = actor(ctx, 'worker')
  const job = jobFor(ctx, args.jobId, worker.organizationId)
  requireCondition(hasLease(ctx, job, args.claimEpoch), 'LEASE_LOST')
  requireCondition(['MODEL_UNAVAILABLE', 'MODEL_TIMEOUT', 'INVALID_MODEL_OUTPUT', 'EXTRACTION_UNSUPPORTED',
    'WORKER_ERROR'].includes(args.errorCode), 'INVALID_INPUT')
  stopJob(ctx, job, 'failed', args.errorCode)
  audit(ctx, job.applicationId, worker.id, 'investigation_failed', args.errorCode)
})

export const cancelInvestigation = db.reducer({ jobId: t.string() }, (ctx, { jobId }) => {
  const officer = actor(ctx, 'officer')
  const job = jobFor(ctx, jobId, officer.organizationId)
  requireCondition(activeJob(job.status), 'INVALID_STATE')
  stopJob(ctx, job, 'cancelled')
  audit(ctx, job.applicationId, officer.id, 'investigation_cancelled', job.id)
})
