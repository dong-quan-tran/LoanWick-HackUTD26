import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { Identity } from 'spacetimedb'
import { DbConnection } from '../bindings'
import { createUploadCapability } from '../transport/capability'
import { startUploadTestServer } from './upload-https'

const endpoint = process.env.LOANWICK_DB_URL ?? 'http://127.0.0.1:4310'
const database = process.env.LOANWICK_DB_NAME ?? 'loanwick-dev'
const adminToken = process.env.LOANWICK_ADMIN_TOKEN
const case1 = 'demo-case-1'
const case2 = 'demo-case-2'
const case3 = 'demo-case-3'
const case4 = 'demo-case-4'
const case5 = 'demo-case-5'
const case6 = 'demo-case-6'
const case7 = 'demo-case-7'
const case8 = 'demo-case-8'

const staffViews = ['staff_applications', 'staff_documents', 'staff_evidence', 'staff_jobs', 'staff_findings', 'staff_tool_events',
  'staff_clarifications', 'staff_responses', 'staff_reviews', 'staff_readiness', 'staff_releases', 'staff_audit_events', 'my_upload_grants']
const borrowerViews = ['borrower_applications', 'borrower_clarifications', 'borrower_documents', 'borrower_own_responses',
  'my_upload_grants', 'staff_applications', 'staff_findings', 'staff_evidence']
const workerViews = ['worker_available_jobs', 'worker_snapshots', 'worker_job_outcomes', 'worker_upload_grants', 'staff_evidence']

async function eventually<T>(read: () => T | undefined | false, description: string): Promise<T> {
  const deadline = Date.now() + 5000
  do {
    const value = read()
    if (value !== undefined && value !== false) return value
    await delay(15)
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${description}`)
}

test('LoanWick policy and live views on a real SpacetimeDB server', { timeout: 45_000 }, async suite => {
  assert.ok(adminToken, 'Set LOANWICK_ADMIN_TOKEN to the owner token of a fresh local test database')
  const connections: DbConnection[] = []
  suite.after(() => connections.forEach(connection => connection.disconnect()))

  function connect(views: string[], token?: string) {
    return new Promise<{ client: DbConnection; identity: Identity }>((resolve, reject) => {
      const builder = DbConnection.builder().withUri(endpoint).withDatabaseName(database)
      if (token) builder.withToken(token)
      const connection = builder.onConnect((client, identity) => {
        client.subscriptionBuilder()
          .onApplied(() => resolve({ client, identity }))
          .onError(ctx => reject(ctx.event ?? new Error('Subscription rejected')))
          .subscribe(['my_user', ...views].map(view => `SELECT * FROM ${view}`))
      }).onConnectError((_ctx, error) => reject(error)).build()
      connections.push(connection)
    })
  }

  const [admin, officer, reviewer, reviewerPeer, borrowerA, borrowerB, workerA, workerB, otherOfficer, otherBorrower, outsider] = await Promise.all([
    connect([], adminToken), connect(staffViews), connect(staffViews), connect(staffViews), connect(borrowerViews), connect(borrowerViews),
    connect(workerViews), connect(workerViews), connect(staffViews), connect(borrowerViews), connect([...staffViews, 'borrower_applications']),
  ])
  const ops = officer.client.reducers
  const review = reviewer.client.reducers
  const borrower = borrowerA.client.reducers
  const issueUpload = async (client: DbConnection, scope: Omit<Parameters<DbConnection['reducers']['authorizeUpload']>[0], 'secretHash'>,
    issued?: Awaited<ReturnType<typeof createUploadCapability>>) => {
    const capability = issued ?? await createUploadCapability()
    await client.reducers.authorizeUpload({ ...scope, secretHash: capability.secretHash })
    const grant = await eventually(() => [...client.db.myUploadGrants.iter()].find(row => row.secretHash === capability.secretHash),
      'server-generated upload grant')
    return { ...grant, secret: capability.secret }
  }
  const jobRow = (key: string) => [...officer.client.db.staffJobs.iter()].find(job => job.runKey === key)
  const releaseRow = (id: string) => [...reviewer.client.db.staffReleases.iter()].find(row => row.applicationId === id)
  const checkRow = (id: string) => [...reviewer.client.db.staffReadiness.iter()].find(row => row.applicationId === id)
  const requestJob = async (applicationId: string, runKey: string) => {
    await ops.requestInvestigation({ applicationId, runKey, executionMode: 'fixture' })
    return eventually(() => jobRow(runKey), `queued job ${runKey}`)
  }
  const outcome = (client: DbConnection, id: string) => [...client.db.workerJobOutcomes.iter()].find(row => row.id === id)
  const cleanRun = async (applicationId: string, runKey: string) => {
    const job = await requestJob(applicationId, runKey)
    await workerA.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })
    await workerA.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: 1, findings: [] })
    const terminal = await eventually(() => outcome(workerA.client, job.id), `outcome for ${runKey}`)
    assert.equal(terminal.status, 'succeeded')
    return terminal
  }
  const fixturePaymentEvidence = (id: string) => `demo-payment-evidence-${id.split('-').at(-1)}`
  const payment = (applicationId: string, expectedPaymentRevision: number) => ({
    applicationId, expectedPaymentRevision, syntheticAccountToken: `demo_account_${applicationId.split('-').at(-1)}`, maskedDisplay: '**** 2026',
    beneficiaryName: 'Synthetic beneficiary', evidenceIds: [fixturePaymentEvidence(applicationId)],
  })
  const allReviews = async (applicationId: string, evidenceId: string, paymentEvidenceId = fixturePaymentEvidence(applicationId)) => {
    const application = [...reviewer.client.db.staffApplications.iter()].find(row => row.id === applicationId)
    assert.ok(application)
    for (const [checkType, expectedRevision] of [
      ['collateral_review', application.collateralRevision], ['document_consistency_review', application.applicationRevision],
      ['payment_verification', application.paymentRevision],
    ] as const) {
      await review.recordReview({ applicationId, checkType, expectedRevision, status: 'passed',
        rationale: 'Reviewed the current synthetic case.', evidenceIds: [checkType === 'payment_verification' ? paymentEvidenceId : evidenceId] })
    }
  }

  await suite.test('private tables and views enforce identity, role, and organization', async () => {
    const assign = admin.client.reducers.assignDemoUser
    await assert.rejects(outsider.client.reducers.assignDemoUser({ identity: outsider.identity, id: 'bad',
      organizationId: 'demo-org', role: 'reviewer', displayName: 'Unauthorized', active: true }), /UNAUTHORIZED/)
    for (const [session, id, role, organizationId] of [
      [officer, 'officer', 'officer', 'demo-org'], [reviewer, 'reviewer', 'reviewer', 'demo-org'],
      [reviewerPeer, 'reviewer-peer', 'reviewer', 'demo-org'],
      [borrowerA, 'borrower-a', 'borrower', 'demo-org'], [borrowerB, 'borrower-b', 'borrower', 'demo-org'],
      [workerA, 'worker-a', 'worker', 'demo-org'], [workerB, 'worker-b', 'worker', 'demo-org'],
      [otherOfficer, 'other-officer', 'officer', 'other-org'], [otherBorrower, 'other-borrower', 'borrower', 'other-org'],
    ] as const) {
      await assign({ identity: session.identity, id, role, organizationId, displayName: id, active: true })
    }
    const seed = { organizationId: 'demo-org', borrowerAId: 'borrower-a', borrowerBId: 'borrower-b' }
    await admin.client.reducers.seedDemo(seed)
    await admin.client.reducers.seedDemo(seed)
    await otherOfficer.client.reducers.createApplication({ id: 'other-case', borrowerUserId: 'other-borrower',
      businessName: 'Other Organization', amountCents: 100_000n, currency: 'USD' })
    await eventually(() => [...officer.client.db.staffApplications.iter()].length === 8, 'eight seeded staff cases')
    await eventually(() => [...borrowerA.client.db.borrowerApplications.iter()].length === 4, 'Borrower A cases')
    await eventually(() => [...borrowerB.client.db.borrowerApplications.iter()].length === 4, 'Borrower B cases')
    assert.equal([...outsider.client.db.staffApplications.iter()].length, 0)
    assert.equal([...outsider.client.db.borrowerApplications.iter()].length, 0)
    assert.equal([...borrowerA.client.db.staffApplications.iter()].length, 0)
    assert.ok(![...borrowerB.client.db.borrowerApplications.iter()].some(row => row.id === case1))
    assert.ok(![...otherOfficer.client.db.staffApplications.iter()].some(row => row.id === case1))
    assert.ok(![...officer.client.db.staffDocuments.iter()].some(row => 'storageKey' in row))
    await assert.rejects(otherOfficer.client.reducers.requestInvestigation({ applicationId: case1, runKey: 'forbidden', executionMode: 'fixture' }), /NOT_FOUND_OR_FORBIDDEN/)
    await eventually(() => [...otherOfficer.client.db.staffApplications.iter()].some(row => row.id === 'other-case'), 'second organization case')
    await assign({ identity: otherOfficer.identity, id: 'other-officer', role: 'officer', organizationId: 'other-org',
      displayName: 'other-officer', active: false })
    await eventually(() => [...otherOfficer.client.db.staffApplications.iter()].length === 0, 'inactive officer loses read access')
    await assert.rejects(otherOfficer.client.reducers.submitApplication({ applicationId: 'other-case' }), /UNAUTHORIZED/)
    await assert.rejects(workerA.client.reducers.simulateRelease({ applicationId: case1, idempotencyKey: 'forbidden' }), /UNAUTHORIZED/)
    await new Promise<void>((resolve, reject) => outsider.client.subscriptionBuilder()
      .onError(() => resolve()).onApplied(() => reject(new Error('Private table was visible')))
      .subscribe('SELECT * FROM applications'))
  })

  let findingId: string
  let firstFindingJobId: string
  const conflict = { type: 'collateral_conflict', severity: 'high', evidenceState: 'supported', title: 'Conflicting ownership claims',
    explanation: 'Two schedules claim exclusive ownership of forklift FL-004821.', uncertainty: 'A schedule may be out of date.',
    suggestedNextStep: 'Ask for an updated equipment schedule.', evidenceIds: ['demo-evidence-1', 'demo-evidence-2'],
    relatedApplicationIds: [case2], ruleVersion: 'fixture-1', deduplicationKey: 'FL-004821' }
  await suite.test('competing workers produce one evidence-linked live finding and invalid results roll back', async () => {
    const job = await requestJob(case1, 'collateral-conflict')
    firstFindingJobId = job.id
    await ops.requestInvestigation({ applicationId: case1, runKey: 'collateral-conflict', executionMode: 'fixture' })
    const contenders = [workerA, workerB]
    const claims = await Promise.allSettled(contenders.map(worker => worker.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })))
    assert.equal(claims.filter(claim => claim.status === 'fulfilled').length, 1)
    const worker = contenders[claims.findIndex(claim => claim.status === 'fulfilled')]
    const snapshot = await eventually(() => [...worker.client.db.workerSnapshots.iter()].find(row => row.id === job.id), 'claimed job snapshot')
    assert.deepEqual(snapshot.evidence.map(item => item.id).sort(), ['demo-evidence-1', 'demo-evidence-2', 'demo-ownership-evidence-1', 'demo-ownership-evidence-2', 'demo-payment-evidence-1'])
    assert.equal([...worker.client.db.staffEvidence.iter()].length, 0)
    const toolEvent = { jobId: job.id, claimEpoch: snapshot.claimEpoch, toolName: 'collateral_check', status: 'succeeded',
      inputSummary: '2 synthetic claims', outputSummary: '1 shared equipment identifier', durationMs: 1 }
    await assert.rejects(worker.client.reducers.recordToolEvent({ ...toolEvent, sequence: 2 }), /INVALID_INPUT/)
    await worker.client.reducers.recordToolEvent({ ...toolEvent, sequence: 1 })
    const finding = conflict
    const completion = { jobId: job.id, claimEpoch: snapshot.claimEpoch, findings: [finding] }
    await assert.rejects(worker.client.reducers.completeInvestigation({ ...completion, findings: [finding,
      { ...finding, deduplicationKey: 'bad-source', evidenceIds: ['demo-evidence-8'] }] }), /INVALID_EVIDENCE/)
    assert.equal([...officer.client.db.staffFindings.iter()].length, 0)
    const liveFinding = new Promise<string>(resolve => officer.client.db.staffFindings.onInsert((_ctx, item) => {
      if (item.jobId === job.id) resolve(item.id)
    }))
    await worker.client.reducers.completeInvestigation(completion)
    findingId = await liveFinding
    const terminal = await eventually(() => outcome(worker.client, job.id), 'accepted worker result')
    assert.equal(terminal.status, 'succeeded')
    assert.deepEqual(terminal.acceptedFindingIds, [findingId])
    const otherWorker = contenders.find(contender => contender !== worker)!
    assert.equal(outcome(otherWorker.client, job.id), undefined)
    await worker.client.reducers.completeInvestigation(completion)
    await ops.requestInvestigation({ applicationId: case1, runKey: 'collateral-conflict', executionMode: 'fixture' })
    assert.equal([...officer.client.db.staffFindings.iter()].filter(row => row.jobId === job.id).length, 1)
    assert.equal([...borrowerA.client.db.staffFindings.iter()].length, 0)
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'test-blocked' }), /BLOCKING_FINDINGS/)
  })

  await suite.test('F4 missing and cancelled investigations and unresolved ownership conflicts block release', async () => {
    const initial = await eventually(() => checkRow(case2), 'peer case readiness')
    assert.ok(initial.reasons.includes('INVESTIGATION_MISSING'))
    const cancelled = await requestJob(case2, 'cancelled-peer')
    await ops.cancelInvestigation({ jobId: cancelled.id })
    await allReviews(case2, 'demo-evidence-2')
    await assert.rejects(review.simulateRelease({ applicationId: case2, idempotencyKey: 'cancelled-peer' }), /BLOCKING_FINDINGS/)
    const blocked = await eventually(() => checkRow(case2)?.reasons.includes('INVESTIGATION_MISSING') && checkRow(case2), 'missing investigation reason')
    assert.ok(blocked.reasons.includes('BLOCKING_FINDINGS'))
    await cleanRun(case2, 'empty-peer-run')
    await assert.rejects(review.simulateRelease({ applicationId: case2, idempotencyKey: 'cross-case-peer' }), /BLOCKING_FINDINGS/)
  })

  await suite.test('borrower clarification and a scoped replacement document reach the officer live', async () => {
    const requestId = 'demo-request-1'
    await ops.createClarificationDraft({ requestId, findingId, template: 'collateral' })
    assert.equal([...borrowerA.client.db.borrowerClarifications.iter()].length, 0)
    await assert.rejects(workerA.client.reducers.sendClarification({ requestId }), /UNAUTHORIZED/)
    await ops.sendClarification({ requestId })
    const request = await eventually(() => [...borrowerA.client.db.borrowerClarifications.iter()].find(row => row.id === requestId), 'borrower request')
    assert.ok(!('findingId' in request))
    assert.equal([...borrowerB.client.db.borrowerClarifications.iter()].length, 0)
    const rerun = await requestJob(case1, 'dedup-with-open-clarification')
    await workerA.client.reducers.claimInvestigation({ jobId: rerun.id, leaseSeconds: 90 })
    await workerA.client.reducers.completeInvestigation({ jobId: rerun.id, claimEpoch: 1, findings: [conflict] })
    const refreshed = await eventually(() => [...officer.client.db.staffFindings.iter()].find(row => row.jobId === rerun.id), 'refreshed finding')
    assert.equal(refreshed.id, findingId)
    assert.equal(refreshed.status, 'awaiting_response')
    assert.equal([...officer.client.db.staffFindings.iter()].filter(row => row.deduplicationKey === conflict.deduplicationKey && row.status !== 'resolved').length, 1)
    const history = [...officer.client.db.staffAuditEvents.iter()].find(event => event.action === 'finding_refreshed')
    assert.equal(history && JSON.parse(history.safeDetails).jobId, firstFindingJobId)
    const accepted = await eventually(() => outcome(workerA.client, rerun.id), 'deduplicated worker outcome')
    assert.deepEqual(accepted.acceptedFindingIds, [findingId])
    await assert.rejects(borrowerB.client.reducers.submitBorrowerResponse({ requestId, message: 'Unauthorized', documentIds: [] }), /NOT_FOUND_OR_FORBIDDEN/)
    const upload = { applicationId: case1, requestId, workerUserId: 'worker-a', documentType: 'collateral_schedule', maxBytes: 1024 }
    const capability = await createUploadCapability()
    await assert.rejects(borrowerB.client.reducers.authorizeUpload({ ...upload, secretHash: capability.secretHash }), /NOT_FOUND_OR_FORBIDDEN/)
    const grant = await issueUpload(borrowerA.client, upload, capability)
    const excerpt = 'Northline Foods removed forklift FL-004821 from its proposed collateral.'
    const claim = { grantId: grant.id, applicationId: case1, requestId, documentType: upload.documentType,
      claimId: 'correction-claim', byteLength: Buffer.byteLength(excerpt) }
    const attachment = { grantId: claim.grantId, claimId: claim.claimId, byteLength: claim.byteLength,
      documentId: 'demo-doc-correction', replacesDocumentId: 'demo-doc-1',
      sha256: createHash('sha256').update(excerpt).digest('hex'), displayFilename: 'synthetic-correction.txt',
      storageKey: 'demo-correction', extractionStatus: 'extracted',
      evidence: [{ id: 'demo-evidence-correction', excerpt, extractionMethod: 'fixture', locator: 'line 1',
        fieldName: undefined, fieldValue: undefined, pageNumber: undefined }] }
    await assert.rejects(workerB.client.reducers.attachDocument(attachment), /NOT_FOUND_OR_FORBIDDEN/)
    await assert.rejects(workerA.client.reducers.attachDocument(attachment), /INVALID_STATE/)
    await workerA.client.reducers.claimUpload(claim)
    await assert.rejects(workerA.client.reducers.attachDocument({ ...attachment, claimId: 'another-claim' }), /INVALID_STATE/)
    await assert.rejects(workerA.client.reducers.attachDocument({ ...attachment, byteLength: claim.byteLength + 1 }), /INVALID_STATE/)
    await workerA.client.reducers.attachDocument(attachment)
    await assert.rejects(workerA.client.reducers.attachDocument(attachment), /INVALID_STATE/)
    await borrower.submitBorrowerResponse({ requestId, message: 'We removed the forklift from the schedule.', documentIds: [attachment.documentId] })
    await eventually(() => [...officer.client.db.staffResponses.iter()].find(row => row.requestId === requestId), 'officer sees response')
    const openFinding = [...officer.client.db.staffFindings.iter()].find(row => row.id === findingId)
    assert.equal(openFinding?.status, 'awaiting_response')
    assert.equal(openFinding?.isCurrent, false)
    assert.ok(checkRow(case2)?.reasons.includes('BLOCKING_FINDINGS'), 'a correction still requires human resolution')
    await assert.rejects(workerA.client.reducers.decideFinding({ findingId, decision: 'resolve', rationale: 'Invalid actor', evidenceIds: [] }), /UNAUTHORIZED/)
    await ops.decideFinding({ findingId, decision: 'resolve', rationale: 'The corrected schedule removes the disputed equipment.',
      evidenceIds: ['demo-evidence-correction'] })
    await eventually(() => checkRow(case2) && !checkRow(case2)?.reasons.includes('BLOCKING_FINDINGS'), 'resolution clears the peer block')
  })

  await suite.test('review revisions and release uniqueness are enforced by the database', async () => {
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'test-missing' }), /MISSING_REVIEW/)
    await allReviews(case1, 'demo-evidence-correction')
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'pre-clarification-result' }), /INVESTIGATION_STALE/)
    await cleanRun(case1, 'post-clarification')
    await eventually(() => checkRow(case1)?.canRelease === true, 'all three checks pass')
    await review.recordReview({ applicationId: case1, checkType: 'payment_verification', expectedRevision: 1,
      status: 'needs_review', rationale: 'Additional verification required.', evidenceIds: ['demo-evidence-correction'] })
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'test-failed-check' }), /REVIEW_REQUIRED/)
    await allReviews(case1, 'demo-evidence-correction')
    await review.changePaymentInstructions(payment(case1, 1))
    const gate = await eventually(() => {
      const result = checkRow(case1)
      return result?.reasons.includes('STALE_REVIEW') && result
    }, 'live stale review gate')
    assert.deepEqual(Object.fromEntries(gate.checks.map(check => [check.checkType, check.status])), {
      collateral_review: 'passed', document_consistency_review: 'stale', payment_verification: 'stale',
    })
    await assert.rejects(review.recordReview({ applicationId: case1, checkType: 'payment_verification', expectedRevision: 1,
      status: 'passed', rationale: 'Old payment approval.', evidenceIds: ['demo-evidence-correction'] }), /STALE_REVIEW/)
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'test-stale' }), /STALE_REVIEW/)
    await allReviews(case1, 'demo-evidence-correction')
    await cleanRun(case1, 'post-payment-change')
    const attempts = await Promise.allSettled([
      review.simulateRelease({ applicationId: case1, idempotencyKey: 'payout-a' }),
      reviewerPeer.client.reducers.simulateRelease({ applicationId: case1, idempotencyKey: 'payout-b' }),
    ])
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    const release = await eventually(() => releaseRow(case1), 'one audited release')
    await review.simulateRelease({ applicationId: case1, idempotencyKey: release.idempotencyKey })
    await assert.rejects(review.changePaymentInstructions(payment(case1, 2)), /ALREADY_RELEASED/)
    assert.equal([...reviewer.client.db.staffReleases.iter()].filter(row => row.applicationId === case1).length, 1)
    assert.equal([...reviewer.client.db.staffAuditEvents.iter()].filter(row => row.applicationId === case1 && row.action === 'simulated_release').length, 1)
  })

  await suite.test('expired claims are fenced and a related-case edit invalidates a result', async () => {
    const job = await requestJob(case5, 'related-revision')
    await workerA.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 1 })
    const first = await eventually(() => [...workerA.client.db.workerSnapshots.iter()].find(row => row.id === job.id), 'first lease')
    assert.deepEqual(first.sources.map(source => source.applicationId), [case6])
    assert.deepEqual(first.relationships.flatMap(edge => edge.evidenceIds).sort(), ['demo-amount-evidence-5', 'demo-amount-evidence-6', 'demo-currency-evidence-5', 'demo-currency-evidence-6', 'demo-evidence-5', 'demo-evidence-6'])
    await eventually(() => jobRow('related-revision')?.status === 'queued', 'scheduler requeues expired lease')
    await eventually(() => ![...workerA.client.db.workerSnapshots.iter()].some(row => row.id === job.id), 'expired worker loses snapshot')
    await workerB.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })
    const second = await eventually(() => [...workerB.client.db.workerSnapshots.iter()].find(row => row.id === job.id), 'second lease')
    assert.equal(second.claimEpoch, first.claimEpoch + 1)
    await assert.rejects(workerA.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: first.claimEpoch, findings: [] }), /LEASE_LOST/)
    await review.changePaymentInstructions(payment(case6, 1))
    await eventually(() => [...workerB.client.db.workerSnapshots.iter()].some(row => row.id === job.id && !row.inputsCurrent), 'related revision invalidation')
    await workerB.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: second.claimEpoch, findings: [] })
    const terminal = await eventually(() => outcome(workerB.client, job.id), 'worker sees rejected completion')
    assert.equal(terminal.status, 'failed')
    assert.equal(terminal.claimEpoch, second.claimEpoch)
    assert.equal(terminal.errorCode, 'STALE_RESULTS')
    assert.deepEqual(terminal.acceptedFindingIds, [])
    assert.equal(outcome(workerA.client, job.id), undefined)
    await eventually(() => jobRow('related-revision')?.errorCode === 'STALE_RESULTS', 'persisted stale outcome')
    assert.equal(jobRow('related-revision')?.status, 'failed')
    assert.ok(![...officer.client.db.staffFindings.iter()].some(row => row.jobId === job.id))
  })

  await suite.test('F1 worker sees terminal failure and stale rejection at claim time', async () => {
    const worker = workerA.client.reducers
    const failedJob = await requestJob(case4, 'worker-failure')
    await worker.claimInvestigation({ jobId: failedJob.id, leaseSeconds: 90 })
    await worker.failInvestigation({ jobId: failedJob.id, claimEpoch: 1, errorCode: 'MODEL_UNAVAILABLE' })
    const failure = await eventually(() => outcome(workerA.client, failedJob.id), 'worker failure outcome')
    assert.equal(failure.status, 'failed')
    assert.equal(failure.errorCode, 'MODEL_UNAVAILABLE')
    const staleJob = await requestJob(case4, 'stale-before-claim')
    await review.changePaymentInstructions(payment(case4, 1))
    await worker.claimInvestigation({ jobId: staleJob.id, leaseSeconds: 90 })
    const stale = await eventually(() => outcome(workerA.client, staleJob.id), 'stale claim outcome')
    assert.equal(stale.status, 'failed')
    assert.equal(stale.claimEpoch, 1)
    assert.equal(stale.errorCode, 'STALE_RESULTS')
    const cancelled = await requestJob(case4, 'cancelled-before-success')
    await ops.cancelInvestigation({ jobId: cancelled.id })
    await allReviews(case4, 'demo-evidence-4')
    await assert.rejects(review.simulateRelease({ applicationId: case4, idempotencyKey: 'never-successful' }), /INVESTIGATION_MISSING/)
  })

  await suite.test('F4 a completed investigation becomes ineligible when a related source changes', async () => {
    await cleanRun(case6, 'completed-with-related-source')
    await allReviews(case6, 'demo-evidence-6')
    await eventually(() => checkRow(case6)?.canRelease === true, 'current dependent investigation')
    await review.changePaymentInstructions(payment(case5, 1))
    await eventually(() => checkRow(case6)?.reasons.includes('INVESTIGATION_STALE') === true, 'dependent readiness invalidated')
    assert.equal(jobRow('completed-with-related-source')?.status, 'succeeded')
    await assert.rejects(review.simulateRelease({ applicationId: case6, idempotencyKey: 'stale-related-source' }), /INVESTIGATION_STALE/)
    await cleanRun(case6, 'reinvestigate-related-source')
    await review.simulateRelease({ applicationId: case6, idempotencyKey: 'current-related-source' })
  })

  await suite.test('F6 new payment evidence invalidates the old approval and must support the new instruction', async () => {
    await cleanRun(case3, 'pre-payment-document')
    const approvePayment = (expectedRevision: number, evidenceIds: string[]) => review.recordReview({
      applicationId: case3, checkType: 'payment_verification', expectedRevision, status: 'passed',
      rationale: 'Confirmed the synthetic payment destination.', evidenceIds,
    })
    await assert.rejects(approvePayment(1, ['demo-evidence-3']), /INVALID_EVIDENCE/)
    await allReviews(case3, 'demo-evidence-3')
    await eventually(() => checkRow(case3)?.canRelease === true, 'shared address does not block case 3')
    const grant = await issueUpload(officer.client, { applicationId: case3, workerUserId: 'worker-a',
      documentType: 'payment_instructions', maxBytes: 1024 })
    const excerpt = 'Synthetic payment account token: demo_replacement.'
    const newEvidence = 'new-payment-evidence'
    const claim = { grantId: grant.id, applicationId: case3, documentType: grant.documentType,
      claimId: 'payment-claim', byteLength: Buffer.byteLength(excerpt) }
    await workerA.client.reducers.claimUpload(claim)
    await workerA.client.reducers.attachDocument({ grantId: claim.grantId, claimId: claim.claimId, byteLength: claim.byteLength,
      documentId: 'new-payment-doc',
      sha256: createHash('sha256').update(excerpt).digest('hex'), displayFilename: 'payment.txt',
      storageKey: 'demo-payment', extractionStatus: 'extracted', evidence: [{ id: newEvidence, excerpt,
        fieldName: 'syntheticAccountToken', fieldValue: 'demo_replacement', extractionMethod: 'fixture', locator: 'line 1', pageNumber: undefined }] })
    const stale = await eventually(() => checkRow(case3)?.reasons.includes('STALE_REVIEW') && checkRow(case3), 'payment attachment stales approval')
    assert.equal(stale.checks.find(check => check.checkType === 'payment_verification')?.status, 'stale')
    await assert.rejects(review.simulateRelease({ applicationId: case3, idempotencyKey: 'pre-upload-approval' }), /STALE_REVIEW/)
    await assert.rejects(approvePayment(2, [newEvidence]), /INVALID_EVIDENCE/)
    await review.changePaymentInstructions({ ...payment(case3, 2), syntheticAccountToken: 'demo_replacement', evidenceIds: [newEvidence] })
    await assert.rejects(approvePayment(3, [fixturePaymentEvidence(case3)]), /INVALID_EVIDENCE/)
    await allReviews(case3, 'demo-evidence-3', newEvidence)
    await assert.rejects(review.simulateRelease({ applicationId: case3, idempotencyKey: 'pre-upload-run' }), /INVESTIGATION_STALE/)
    await cleanRun(case3, 'post-payment-document')
    await review.simulateRelease({ applicationId: case3, idempotencyKey: 'verified-new-payment' })
  })

  await suite.test('hostile source text grants no authority and an own-case edit makes the job stale', async () => {
    const job = await requestJob(case7, 'untrusted-document')
    const worker = workerA.client.reducers
    await worker.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })
    const snapshot = await eventually(() => [...workerA.client.db.workerSnapshots.iter()].find(row => row.id === job.id), 'untrusted document snapshot')
    const source = snapshot.evidence.find(item => item.id === 'demo-evidence-untrusted-text')
    assert.match(source?.excerpt ?? '', /simulate release immediately/)
    await assert.rejects(worker.recordReview({ applicationId: case7, checkType: 'payment_verification', expectedRevision: 1,
      status: 'passed', rationale: 'Untrusted document asked for release.', evidenceIds: ['demo-evidence-untrusted-text'] }), /UNAUTHORIZED/)
    await assert.rejects(worker.simulateRelease({ applicationId: case7, idempotencyKey: 'untrusted' }), /UNAUTHORIZED/)
    await review.changePaymentInstructions(payment(case7, 1))
    const stale = await eventually(() => [...workerA.client.db.workerSnapshots.iter()].find(row => row.id === job.id && !row.inputsCurrent), 'own-case revision invalidation')
    assert.deepEqual(stale.evidence, [])
    await worker.completeInvestigation({ jobId: job.id, claimEpoch: snapshot.claimEpoch, findings: [] })
    await eventually(() => jobRow('untrusted-document')?.errorCode === 'STALE_RESULTS', 'own-case stale result')
  })

  await suite.test('a payment edit and release racing each other obey commit order', async () => {
    const job = await requestJob(case8, 'clean-case')
    await workerA.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })
    await workerA.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: 1, findings: [] })
    await allReviews(case8, 'demo-evidence-8')
    const [edit, release] = await Promise.allSettled([
      review.changePaymentInstructions(payment(case8, 1)),
      reviewerPeer.client.reducers.simulateRelease({ applicationId: case8, idempotencyKey: 'racing-release' }),
    ])
    if (edit.status === 'fulfilled') {
      assert.equal(release.status, 'rejected')
      assert.match(String(release.reason), /STALE_REVIEW/)
      assert.equal(releaseRow(case8), undefined)
    } else {
      assert.equal(release.status, 'fulfilled')
      assert.match(String(edit.reason), /ALREADY_RELEASED/)
      await eventually(() => releaseRow(case8), 'one racing release')
    }
  })

  await suite.test('B2 HTTPS proves grant possession before accepting a bounded, single-use upload', async uploadTest => {
    const payload = Buffer.from('Synthetic upload')
    let stored = 0
    const post = await startUploadTestServer(uploadTest, workerA.client, async input => {
      stored++
      assert.equal(input.applicationId, case4)
      assert.deepEqual(input.bytes, payload)
      assert.equal(input.sha256, createHash('sha256').update(payload).digest('hex'))
      return { displayFilename: 'upload.txt', storageKey: input.documentId, extractionStatus: 'unsupported', evidence: [] }
    })
    const scope = { applicationId: case4, workerUserId: 'worker-a', documentType: 'supporting_document', maxBytes: payload.length }
    const grant = await issueUpload(officer.client, scope)
    assert.match(grant.id, /^[0-9a-f-]{36}$/)
    assert.ok(!('secret' in [...officer.client.db.myUploadGrants.iter()].find(row => row.id === grant.id)!))
    const onWorker = (id: string) => [...workerA.client.db.workerUploadGrants.iter()].find(row => row.id === id)
    await eventually(() => onWorker(grant.id), 'assigned worker sees grant')
    assert.ok(![...workerB.client.db.workerUploadGrants.iter()].some(row => row.id === grant.id))
    const headers = (id: string, secret: string) => ({
      'x-upload-grant': id, 'x-upload-secret': secret, 'x-application-id': case4, 'x-document-type': scope.documentType,
    })
    const valid = headers(grant.id, grant.secret)
    const preflight = await post({ origin: 'https://loanwick.test', 'access-control-request-method': 'POST' },
      Buffer.alloc(0), 'OPTIONS')
    assert.equal(preflight.status, 204)
    assert.equal(preflight.allowedOrigin, 'https://loanwick.test')
    const denied = async (overrides: Record<string, string | number>, status = 403) => {
      const result = await post({ ...valid, ...overrides }, payload)
      assert.equal(result.status, status)
      assert.equal(result.continued, false)
    }
    await denied({ 'x-upload-secret': (await createUploadCapability()).secret })
    await denied({ 'x-application-id': case7 })
    await denied({ 'x-request-id': 'foreign-request' })
    await denied({ 'x-document-type': 'payment_instructions' })
    await denied({ authorization: 'Bearer example-token' })
    await denied({ origin: 'https://other.test' })
    await denied({ 'content-length': payload.length + 1 }, 413)

    const expired = await issueUpload(officer.client, { ...scope, ttlSeconds: 1 })
    await delay(1100)
    await denied(headers(expired.id, expired.secret))
    const revoked = await issueUpload(officer.client, scope)
    await assert.rejects(borrower.revokeUpload({ grantId: revoked.id }), /NOT_FOUND_OR_FORBIDDEN/)
    await ops.revokeUpload({ grantId: revoked.id })
    await denied(headers(revoked.id, revoked.secret))
    const claim = { grantId: grant.id, claimId: 'manual-claim', applicationId: case4, documentType: scope.documentType, byteLength: payload.length }
    await assert.rejects(workerA.client.reducers.claimUpload({ ...claim, applicationId: case7 }), /NOT_FOUND_OR_FORBIDDEN/)
    await assert.rejects(workerB.client.reducers.claimUpload(claim), /NOT_FOUND_OR_FORBIDDEN/)
    await assert.rejects(workerA.client.reducers.claimUpload({ ...claim, byteLength: payload.length + 1 }), /INVALID_INPUT/)
    await assert.rejects(workerA.client.reducers.claimUpload({ ...claim, grantId: expired.id }), /INVALID_STATE/)
    await assert.rejects(workerA.client.reducers.claimUpload({ ...claim, grantId: revoked.id }), /INVALID_STATE/)
    const inFlight = await issueUpload(officer.client, scope)
    await workerA.client.reducers.claimUpload({ ...claim, grantId: inFlight.id })
    await ops.revokeUpload({ grantId: inFlight.id })
    await assert.rejects(workerA.client.reducers.attachDocument({ grantId: inFlight.id, claimId: claim.claimId,
      byteLength: payload.length, documentId: 'revoked-in-flight', sha256: createHash('sha256').update(payload).digest('hex'),
      displayFilename: 'upload.txt', storageKey: 'revoked-in-flight', extractionStatus: 'unsupported', evidence: [] }), /INVALID_STATE/)
    assert.equal(stored, 0)
    const browserHeaders = { ...valid, origin: 'https://loanwick.test' }
    const [left, right] = await Promise.all([post(browserHeaders, payload), post(browserHeaders, payload)])
    assert.deepEqual([left.status, right.status].sort(), [201, 403])
    const successful = [left, right].find(result => result.status === 201)!
    assert.equal(successful.continued, true)
    assert.equal(successful.allowedOrigin, 'https://loanwick.test')
    assert.equal([left, right].find(result => result.status === 403)?.continued, false)
    assert.equal(stored, 1)
    const receipt = await eventually(() => onWorker(grant.id)?.status === 'attached' && onWorker(grant.id), 'attached grant receipt')
    assert.equal(receipt.attachedDocumentId, JSON.parse(successful.body).documentId)
    await denied({})
  })
})
