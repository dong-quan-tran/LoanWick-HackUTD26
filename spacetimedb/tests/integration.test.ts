import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { Identity } from 'spacetimedb'
import { DbConnection } from '../bindings'

const endpoint = process.env.LOANWICK_DB_URL ?? 'http://127.0.0.1:4310'
const database = process.env.LOANWICK_DB_NAME ?? 'loanwick-dev'
const adminToken = process.env.LOANWICK_ADMIN_TOKEN
const case1 = 'demo-case-1'
const case2 = 'demo-case-2'
const case5 = 'demo-case-5'
const case6 = 'demo-case-6'
const case7 = 'demo-case-7'
const case8 = 'demo-case-8'

const staffViews = ['staff_applications', 'staff_documents', 'staff_evidence', 'staff_jobs', 'staff_findings', 'staff_tool_events',
  'staff_clarifications', 'staff_responses', 'staff_reviews', 'staff_readiness', 'staff_releases', 'staff_audit_events']
const borrowerViews = ['borrower_applications', 'borrower_clarifications', 'borrower_documents', 'borrower_own_responses',
  'my_upload_grants', 'staff_applications', 'staff_findings', 'staff_evidence']
const workerViews = ['worker_available_jobs', 'worker_snapshots', 'worker_upload_grants', 'staff_evidence']

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
  const caseRow = (id: string) => [...officer.client.db.staffApplications.iter()].find(row => row.id === id)
  const jobRow = (key: string) => [...officer.client.db.staffJobs.iter()].find(job => job.runKey === key)
  const releaseRow = (id: string) => [...reviewer.client.db.staffReleases.iter()].find(row => row.applicationId === id)
  const checkRow = (id: string) => [...reviewer.client.db.staffReadiness.iter()].find(row => row.applicationId === id)
  const requestJob = async (applicationId: string, runKey: string) => {
    await ops.requestInvestigation({ applicationId, runKey, executionMode: 'fixture' })
    return eventually(() => jobRow(runKey), `queued job ${runKey}`)
  }
  const payment = (applicationId: string, expectedPaymentRevision: number) => ({
    applicationId, expectedPaymentRevision, syntheticAccountToken: 'demo_replacement', maskedDisplay: '**** 2026',
    beneficiaryName: 'Synthetic beneficiary', evidenceIds: [],
  })
  const allReviews = async (applicationId: string, evidenceId: string) => {
    const application = caseRow(applicationId)
    assert.ok(application)
    for (const [checkType, expectedRevision] of [
      ['collateral_review', application.collateralRevision], ['document_consistency_review', application.applicationRevision],
      ['payment_verification', application.paymentRevision],
    ] as const) {
      await review.recordReview({ applicationId, checkType, expectedRevision, status: 'passed',
        rationale: 'Reviewed the current synthetic case.', evidenceIds: [evidenceId] })
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
  await suite.test('competing workers produce one evidence-linked live finding and invalid results roll back', async () => {
    const job = await requestJob(case1, 'collateral-conflict')
    await ops.requestInvestigation({ applicationId: case1, runKey: 'collateral-conflict', executionMode: 'fixture' })
    const contenders = [workerA, workerB]
    const claims = await Promise.allSettled(contenders.map(worker => worker.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })))
    assert.equal(claims.filter(claim => claim.status === 'fulfilled').length, 1)
    const worker = contenders[claims.findIndex(claim => claim.status === 'fulfilled')]
    const snapshot = await eventually(() => [...worker.client.db.workerSnapshots.iter()].find(row => row.id === job.id), 'claimed job snapshot')
    assert.deepEqual(snapshot.evidence.map(item => item.id).sort(), ['demo-evidence-1', 'demo-evidence-2'])
    assert.equal([...worker.client.db.staffEvidence.iter()].length, 0)
    const toolEvent = { jobId: job.id, claimEpoch: snapshot.claimEpoch, toolName: 'collateral_check', status: 'succeeded',
      inputSummary: '2 synthetic claims', outputSummary: '1 shared equipment identifier', durationMs: 1 }
    await assert.rejects(worker.client.reducers.recordToolEvent({ ...toolEvent, sequence: 2 }), /INVALID_INPUT/)
    await worker.client.reducers.recordToolEvent({ ...toolEvent, sequence: 1 })
    const finding = { type: 'collateral_conflict', severity: 'high', evidenceState: 'supported', title: 'Conflicting ownership claims',
      explanation: 'Two schedules claim exclusive ownership of forklift FL-004821.', uncertainty: 'A schedule may be out of date.',
      suggestedNextStep: 'Ask for an updated equipment schedule.', evidenceIds: ['demo-evidence-1', 'demo-evidence-2'],
      relatedApplicationIds: [case2], ruleVersion: 'fixture-1', deduplicationKey: 'FL-004821' }
    const completion = { jobId: job.id, claimEpoch: snapshot.claimEpoch, findings: [finding] }
    await assert.rejects(worker.client.reducers.completeInvestigation({ ...completion, findings: [finding,
      { ...finding, deduplicationKey: 'bad-source', evidenceIds: ['demo-evidence-8'] }] }), /INVALID_EVIDENCE/)
    assert.equal([...officer.client.db.staffFindings.iter()].length, 0)
    const liveFinding = new Promise<string>(resolve => officer.client.db.staffFindings.onInsert((_ctx, item) => {
      if (item.jobId === job.id) resolve(item.id)
    }))
    await worker.client.reducers.completeInvestigation(completion)
    findingId = await liveFinding
    await worker.client.reducers.completeInvestigation(completion)
    await ops.requestInvestigation({ applicationId: case1, runKey: 'collateral-conflict', executionMode: 'fixture' })
    assert.equal([...officer.client.db.staffFindings.iter()].filter(row => row.jobId === job.id).length, 1)
    assert.equal([...borrowerA.client.db.staffFindings.iter()].length, 0)
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'test-blocked' }), /BLOCKING_FINDINGS/)
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
    await assert.rejects(borrowerB.client.reducers.submitBorrowerResponse({ requestId, message: 'Unauthorized', documentIds: [] }), /NOT_FOUND_OR_FORBIDDEN/)
    const upload = { grantId: 'demo-grant-1', applicationId: case1, requestId, workerUserId: 'worker-a', documentType: 'collateral_schedule' }
    await assert.rejects(borrowerB.client.reducers.authorizeUpload(upload), /NOT_FOUND_OR_FORBIDDEN/)
    await borrower.authorizeUpload(upload)
    const excerpt = 'Northline Foods removed forklift FL-004821 from its proposed collateral.'
    const attachment = { grantId: upload.grantId, documentId: 'demo-doc-correction', replacesDocumentId: 'demo-doc-1',
      sha256: createHash('sha256').update(excerpt).digest('hex'), displayFilename: 'synthetic-correction.txt',
      storageKey: 'demo-correction', extractionStatus: 'extracted',
      evidence: [{ id: 'demo-evidence-correction', excerpt, extractionMethod: 'fixture', locator: 'line 1',
        fieldName: undefined, fieldValue: undefined, pageNumber: undefined }] }
    await assert.rejects(workerB.client.reducers.attachDocument(attachment), /NOT_FOUND_OR_FORBIDDEN/)
    await workerA.client.reducers.attachDocument(attachment)
    await assert.rejects(workerA.client.reducers.attachDocument(attachment), /INVALID_STATE/)
    await borrower.submitBorrowerResponse({ requestId, message: 'We removed the forklift from the schedule.', documentIds: [attachment.documentId] })
    await eventually(() => [...officer.client.db.staffResponses.iter()].find(row => row.requestId === requestId), 'officer sees response')
    const openFinding = [...officer.client.db.staffFindings.iter()].find(row => row.id === findingId)
    assert.equal(openFinding?.status, 'awaiting_response')
    assert.equal(openFinding?.isCurrent, false)
    await assert.rejects(workerA.client.reducers.decideFinding({ findingId, decision: 'resolve', rationale: 'Invalid actor', evidenceIds: [] }), /UNAUTHORIZED/)
    await ops.decideFinding({ findingId, decision: 'resolve', rationale: 'The corrected schedule removes the disputed equipment.',
      evidenceIds: ['demo-evidence-correction'] })
  })

  await suite.test('review revisions and release uniqueness are enforced by the database', async () => {
    await assert.rejects(review.simulateRelease({ applicationId: case1, idempotencyKey: 'test-missing' }), /MISSING_REVIEW/)
    await allReviews(case1, 'demo-evidence-correction')
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
    assert.deepEqual(first.relationships.flatMap(edge => edge.evidenceIds).sort(), ['demo-evidence-5', 'demo-evidence-6'])
    await eventually(() => jobRow('related-revision')?.status === 'queued', 'scheduler requeues expired lease')
    await eventually(() => ![...workerA.client.db.workerSnapshots.iter()].some(row => row.id === job.id), 'expired worker loses snapshot')
    await workerB.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 })
    const second = await eventually(() => [...workerB.client.db.workerSnapshots.iter()].find(row => row.id === job.id), 'second lease')
    assert.equal(second.claimEpoch, first.claimEpoch + 1)
    await assert.rejects(workerA.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: first.claimEpoch, findings: [] }), /LEASE_LOST/)
    await review.changePaymentInstructions(payment(case6, 1))
    await eventually(() => [...workerB.client.db.workerSnapshots.iter()].some(row => row.id === job.id && !row.inputsCurrent), 'related revision invalidation')
    await workerB.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: second.claimEpoch, findings: [] })
    await eventually(() => jobRow('related-revision')?.errorCode === 'STALE_RESULTS', 'persisted stale outcome')
    assert.equal(jobRow('related-revision')?.status, 'failed')
    assert.ok(![...officer.client.db.staffFindings.iter()].some(row => row.jobId === job.id))
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
})
