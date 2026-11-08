// QA regression suite (Claude): authorization, tenant isolation, worker leases, and the AGREED release policy.
// These assert behavior the backend is supposed to have today; any failure is a regression.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { DbConnection } from '../bindings'
import {
  adminToken, authorizeGrant, borrowerViews, capability, eventually, f4Policy, helpers, makeConnector, obs, org, otherOrg, rejectsWith, settle, staffViews, uid, workerViews,
} from './qa-harness'

test('QA regression: authorization and release policy', { timeout: 90_000 }, async suite => {
  const connections: DbConnection[] = []
  suite.after(() => connections.forEach(c => c.disconnect()))
  const connect = makeConnector(connections)
  const [admin, officer, reviewer, reviewer2, borrowerA, borrowerB, workerA, workerB,
    otherOfficer, otherReviewer, otherWorker, anon] = await Promise.all([
    connect([], adminToken), connect(staffViews), connect(staffViews), connect(staffViews), connect(borrowerViews), connect(borrowerViews),
    connect(workerViews), connect(workerViews), connect(staffViews), connect(staffViews), connect(workerViews), connect([...staffViews, ...borrowerViews]),
  ])
  for (const [s, name, role, o] of [
    [officer, 'officer', 'officer', org], [reviewer, 'reviewer', 'reviewer', org], [reviewer2, 'reviewer2', 'reviewer', org],
    [borrowerA, 'borrower-a', 'borrower', org], [borrowerB, 'borrower-b', 'borrower', org],
    [workerA, 'worker-a', 'worker', org], [workerB, 'worker-b', 'worker', org],
    [otherOfficer, 'other-officer', 'officer', otherOrg], [otherReviewer, 'other-reviewer', 'reviewer', otherOrg],
    [otherWorker, 'other-worker', 'worker', otherOrg],
  ] as const) {
    await admin.client.reducers.assignDemoUser({ identity: s.identity, id: uid(name), organizationId: o, role, displayName: name, active: true })
  }
  await admin.client.reducers.seedDemo({ organizationId: org, borrowerAId: uid('borrower-a'), borrowerBId: uid('borrower-b') })
  await eventually(() => [...officer.client.db.staffApplications.iter()].length === 8, 'seeded cases')
  const h = helpers(officer, reviewer, workerA)
  const { ops, rev, wk, app, staffJob, readiness, checkMap, request, claim, investigateClean, passChecks, passAll, payment } = h
  const releases = (id: string) => [...reviewer.client.db.staffReleases.iter()].filter(r => r.applicationId === id)

  await suite.test('R1 role matrix: every privileged reducer rejects the wrong role with UNAUTHORIZED', async () => {
    const job = await request('demo-case-8', 'r1-probe')
    const dummyFinding = { ...h.highConflict, deduplicationKey: 'probe' }
    const attach = { grantId: 'probe', claimId: 'probe', byteLength: 1, documentId: 'probe', replacesDocumentId: undefined, sha256: '0'.repeat(64),
      displayFilename: 'probe.txt', storageKey: 'probe', extractionStatus: 'extracted', evidence: [] }
    const claimProbe = { grantId: 'probe', claimId: 'probe', applicationId: 'demo-case-8', requestId: undefined,
      documentType: 'supporting_document', byteLength: 1 }
    const grantProbe = { secretHash: 'a'.repeat(64), applicationId: 'demo-case-8', requestId: undefined, workerUserId: uid('worker-a'),
      documentType: 'supporting_document', maxBytes: 100, ttlSeconds: undefined }
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['worker.recordReview', () => workerA.client.reducers.recordReview({ applicationId: 'demo-case-8', checkType: 'payment_verification',
        expectedRevision: 1, status: 'passed', rationale: 'x', evidenceIds: ['demo-evidence-8'] })],
      ['worker.changePaymentInstructions', () => workerA.client.reducers.changePaymentInstructions(payment('demo-case-8', 1))],
      ['worker.simulateRelease', () => workerA.client.reducers.simulateRelease({ applicationId: 'demo-case-8', idempotencyKey: 'x' })],
      ['worker.decideFinding', () => workerA.client.reducers.decideFinding({ findingId: 'x', decision: 'resolve', rationale: 'x', evidenceIds: [] })],
      ['worker.sendClarification', () => workerA.client.reducers.sendClarification({ requestId: 'x' })],
      ['worker.requestInvestigation', () => workerA.client.reducers.requestInvestigation({ applicationId: 'demo-case-8', runKey: 'x', executionMode: 'fixture', modelId: undefined })],
      ['worker.cancelInvestigation', () => workerA.client.reducers.cancelInvestigation({ jobId: job.id })],
      ['worker.reviewMatchCandidate', () => workerA.client.reducers.reviewMatchCandidate({ candidateId: 'demo-address-candidate', decision: 'confirmed_same_entity', rationale: 'x' })],
      ['worker.authorizeUpload', () => workerA.client.reducers.authorizeUpload(grantProbe)],
      ['worker.revokeUpload', () => workerA.client.reducers.revokeUpload({ grantId: 'probe' })],
      ['officer.claimUpload', () => ops.claimUpload(claimProbe)],
      ['borrower.claimUpload', () => borrowerA.client.reducers.claimUpload(claimProbe)],
      ['borrower.attachDocument', () => borrowerA.client.reducers.attachDocument(attach)],
      ['reviewer.authorizeUpload', () => rev.authorizeUpload(grantProbe)],
      ['anonymous.authorizeUpload', () => anon.client.reducers.authorizeUpload(grantProbe)],
      ['anonymous.claimUpload', () => anon.client.reducers.claimUpload(claimProbe)],
      ['officer.recordReview', () => ops.recordReview({ applicationId: 'demo-case-8', checkType: 'payment_verification', expectedRevision: 1, status: 'passed', rationale: 'x', evidenceIds: ['demo-evidence-8'] })],
      ['officer.changePaymentInstructions', () => ops.changePaymentInstructions(payment('demo-case-8', 1))],
      ['officer.simulateRelease', () => ops.simulateRelease({ applicationId: 'demo-case-8', idempotencyKey: 'x' })],
      ['officer.claimInvestigation', () => ops.claimInvestigation({ jobId: job.id, leaseSeconds: 30 })],
      ['officer.completeInvestigation', () => ops.completeInvestigation({ jobId: job.id, claimEpoch: 1, modelId: undefined, findings: [dummyFinding] })],
      ['officer.attachDocument', () => ops.attachDocument(attach)],
      ['officer.submitBorrowerResponse', () => ops.submitBorrowerResponse({ requestId: 'x', message: 'x', documentIds: [] })],
      ['officer.assignDemoUser', () => ops.assignDemoUser({ identity: officer.identity, id: uid('officer'), organizationId: org, role: 'reviewer', displayName: 'x', active: true })],
      ['officer.seedDemo', () => ops.seedDemo({ organizationId: org, borrowerAId: uid('borrower-a'), borrowerBId: uid('borrower-b') })],
      ['reviewer.requestInvestigation', () => rev.requestInvestigation({ applicationId: 'demo-case-8', runKey: 'x', executionMode: 'fixture', modelId: undefined })],
      ['reviewer.sendClarification', () => rev.sendClarification({ requestId: 'x' })],
      ['reviewer.createClarificationDraft', () => rev.createClarificationDraft({ requestId: 'x', findingId: 'x', template: 'collateral' })],
      ['reviewer.recordCollateralClaim', () => rev.recordCollateralClaim({ id: 'x', applicationId: 'demo-case-8', expectedCollateralRevision: 1,
        identifier: 'X', normalizedIdentifier: 'X', description: 'x', active: false, exclusiveOwnershipClaim: false, evidenceIds: [] })],
      ['reviewer.claimInvestigation', () => rev.claimInvestigation({ jobId: job.id, leaseSeconds: 30 })],
      ['borrower.requestInvestigation', () => borrowerA.client.reducers.requestInvestigation({ applicationId: 'demo-case-1', runKey: 'x', executionMode: 'fixture', modelId: undefined })],
      ['borrower.recordReview', () => borrowerA.client.reducers.recordReview({ applicationId: 'demo-case-1', checkType: 'payment_verification', expectedRevision: 1, status: 'passed', rationale: 'x', evidenceIds: [] })],
      ['borrower.simulateRelease', () => borrowerA.client.reducers.simulateRelease({ applicationId: 'demo-case-1', idempotencyKey: 'x' })],
      ['borrower.decideFinding', () => borrowerA.client.reducers.decideFinding({ findingId: 'x', decision: 'resolve', rationale: 'x', evidenceIds: [] })],
      ['borrower.createClarificationDraft', () => borrowerA.client.reducers.createClarificationDraft({ requestId: 'x', findingId: 'x', template: 'collateral' })],
      ['borrower.changePaymentInstructions', () => borrowerA.client.reducers.changePaymentInstructions(payment('demo-case-1', 1))],
      ['borrower.claimInvestigation', () => borrowerA.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 30 })],
      ['anonymous.createApplication', () => anon.client.reducers.createApplication({ id: uid('anon-app'), borrowerUserId: uid('borrower-a'), businessName: 'x', amountCents: 1n, currency: 'USD' })],
      ['anonymous.submitBorrowerResponse', () => anon.client.reducers.submitBorrowerResponse({ requestId: 'x', message: 'x', documentIds: [] })],
      ['anonymous.simulateRelease', () => anon.client.reducers.simulateRelease({ applicationId: 'demo-case-8', idempotencyKey: 'x' })],
      ['anonymous.assignDemoUser', () => anon.client.reducers.assignDemoUser({ identity: anon.identity, id: uid('anon'), organizationId: org, role: 'reviewer', displayName: 'x', active: true })],
    ]
    const wrong: string[] = []
    for (const [label, call] of calls) {
      const result = await settle(call())
      if (result.ok || !/\bUNAUTHORIZED\b/.test(result.error)) wrong.push(`${label} -> ${result.ok ? 'SUCCEEDED' : result.error}`)
    }
    obs('R1', { probed: calls.length, unexpected: wrong })
    assert.deepEqual(wrong, [], 'Role matrix violations')
    assert.equal(staffJob('r1-probe')?.status, 'queued', 'probe job must be untouched by rejected calls')
    await ops.cancelInvestigation({ jobId: job.id })
    await delay(100)
    assert.equal([...anon.client.db.staffApplications.iter()].length + [...anon.client.db.borrowerApplications.iter()].length, 0,
      'anonymous identity sees no cases')
    const privateRead = await new Promise<string>(resolve => anon.client.subscriptionBuilder()
      .onApplied(() => resolve('applied')).onError(() => resolve('rejected')).subscribe('SELECT * FROM demo_releases'))
    assert.equal(privateRead, 'rejected', 'private table subscription must be rejected')
  })

  await suite.test('R2 tenant isolation: borrowers, other organizations, inactive users', async () => {
    // Odd seeded cases belong to borrower A, even ones to borrower B.
    await eventually(() => [...borrowerA.client.db.borrowerApplications.iter()].length === 4, 'borrower A cases')
    const aIds = [...borrowerA.client.db.borrowerApplications.iter()].map(r => r.id).sort()
    assert.deepEqual(aIds, ['demo-case-1', 'demo-case-3', 'demo-case-5', 'demo-case-7'])
    assert.ok([...borrowerA.client.db.borrowerDocuments.iter()].every(d => aIds.includes(d.applicationId)), 'borrower A sees only own documents')
    await rejectsWith(borrowerA.client.reducers.submitApplication({ applicationId: 'demo-case-2' }), 'NOT_FOUND_OR_FORBIDDEN', 'A submits B case')
    await rejectsWith(borrowerA.client.reducers.createApplication({ id: uid('a-for-b'), borrowerUserId: uid('borrower-b'), businessName: 'x',
      amountCents: 100n, currency: 'USD' }), 'NOT_FOUND_OR_FORBIDDEN', 'A creates case for B')
    await rejectsWith(borrowerA.client.reducers.authorizeUpload({ secretHash: capability().secretHash, applicationId: 'demo-case-2',
      requestId: undefined, workerUserId: uid('worker-a'), documentType: 'supporting_document', maxBytes: 100, ttlSeconds: undefined }),
    'NOT_FOUND_OR_FORBIDDEN', 'A uploads to B case')

    assert.equal([...otherOfficer.client.db.staffApplications.iter()].length, 0, 'other org officer sees no demo cases')
    await rejectsWith(otherOfficer.client.reducers.requestInvestigation({ applicationId: 'demo-case-1', runKey: 'x', executionMode: 'fixture',
      modelId: undefined }), 'NOT_FOUND_OR_FORBIDDEN', 'other-org officer requests investigation')
    await rejectsWith(otherReviewer.client.reducers.recordReview({ applicationId: 'demo-case-1', checkType: 'collateral_review', expectedRevision: 1,
      status: 'passed', rationale: 'x', evidenceIds: ['demo-evidence-1'] }), 'NOT_FOUND_OR_FORBIDDEN', 'other-org reviewer records review')
    await rejectsWith(otherReviewer.client.reducers.simulateRelease({ applicationId: 'demo-case-1', idempotencyKey: 'x' }),
      'NOT_FOUND_OR_FORBIDDEN', 'other-org reviewer releases')
    const job = await request('demo-case-5', 'r2-cross-worker')
    await eventually(() => [...workerA.client.db.workerAvailableJobs.iter()].find(j => j.id === job.id), 'worker A sees queued job')
    assert.equal([...otherWorker.client.db.workerAvailableJobs.iter()].length, 0, 'other-org worker sees no jobs')
    await rejectsWith(otherWorker.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 30 }), 'NOT_FOUND_OR_FORBIDDEN', 'other-org worker claims')

    await admin.client.reducers.assignDemoUser({ identity: reviewer2.identity, id: uid('reviewer2'), organizationId: org, role: 'reviewer',
      displayName: 'reviewer2', active: false })
    await eventually(() => [...reviewer2.client.db.staffApplications.iter()].length === 0, 'inactive reviewer loses reads')
    await rejectsWith(reviewer2.client.reducers.simulateRelease({ applicationId: 'demo-case-5', idempotencyKey: 'x' }), 'UNAUTHORIZED', 'inactive reviewer releases')
  })

  await suite.test('R3 worker leases and upload grants are bound to one worker', async () => {
    const job = staffJob('r2-cross-worker')!
    const snap = await claim(job.id, workerA)
    const b = workerB.client.reducers
    await rejectsWith(b.claimInvestigation({ jobId: job.id, leaseSeconds: 30 }), 'LEASE_LOST', 'second worker claims held job')
    await rejectsWith(b.recordToolEvent({ jobId: job.id, claimEpoch: snap.claimEpoch, sequence: 1, toolName: 'probe', status: 'started',
      inputSummary: '', outputSummary: '', durationMs: 0 }), 'LEASE_LOST', 'second worker logs tool event')
    await rejectsWith(b.renewInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, leaseSeconds: 30 }), 'LEASE_LOST', 'second worker renews')
    await rejectsWith(b.failInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, errorCode: 'WORKER_ERROR' }), 'LEASE_LOST', 'second worker fails job')
    await rejectsWith(b.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [] }), 'LEASE_LOST',
      'second worker completes')
    await rejectsWith(wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch + 1, modelId: undefined, findings: [] }), 'LEASE_LOST',
      'holder with wrong epoch completes')
    await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [] })
    await eventually(() => staffJob('r2-cross-worker')?.status === 'succeeded', 'holder completes')
    if (f4Policy === 'v2') {
      await eventually(() => [...workerA.client.db.workerJobOutcomes.iter()].find(o => o.id === job.id), 'holder sees its outcome')
      assert.ok(![...workerB.client.db.workerJobOutcomes.iter()].some(o => o.id === job.id), 'another worker cannot read the outcome')
      assert.equal([...otherWorker.client.db.workerJobOutcomes.iter()].length, 0, 'other-org worker sees no outcomes')
    }

    const { grantId } = await authorizeGrant(officer, { applicationId: 'demo-case-5', documentType: 'supporting_document',
      workerUserId: uid('worker-a'), maxBytes: 100 })
    await eventually(() => [...workerA.client.db.workerUploadGrants.iter()].find(g => g.id === grantId), 'grant visible to assigned worker')
    assert.ok(![...workerB.client.db.workerUploadGrants.iter()].some(g => g.id === grantId), 'other worker cannot see grant')
    await rejectsWith(b.claimUpload({ grantId, claimId: 'r3-claim', applicationId: 'demo-case-5', requestId: undefined,
      documentType: 'supporting_document', byteLength: 10 }), 'NOT_FOUND_OR_FORBIDDEN', 'unassigned worker claims grant')
    await rejectsWith(b.attachDocument({ grantId, claimId: 'r3-claim', byteLength: 10, documentId: uid('r3-doc'), replacesDocumentId: undefined,
      sha256: 'a'.repeat(64), displayFilename: 'r3.txt', storageKey: uid('r3-key'), extractionStatus: 'unsupported', evidence: [] }),
    'NOT_FOUND_OR_FORBIDDEN', 'unassigned worker uses grant')
  })

  await suite.test('R4 release gate (agreed policy): state, pending work, idempotency, concurrency, post-release lock', async () => {
    const draftId = uid('draft-case')
    await ops.createApplication({ id: draftId, borrowerUserId: uid('borrower-a'), businessName: 'QA Draft', amountCents: 100_000n, currency: 'USD' })
    await eventually(() => app(draftId), 'draft visible')
    await rejectsWith(rev.simulateRelease({ applicationId: draftId, idempotencyKey: uid('k') }), 'INVALID_STATE', 'release draft')
    await rejectsWith(rev.recordReview({ applicationId: draftId, checkType: 'collateral_review', expectedRevision: 0, status: 'passed',
      rationale: 'x', evidenceIds: [] }), 'INVALID_STATE', 'review draft')

    const id = 'demo-case-3'
    const job = await request(id, 'r4-pending')
    await passChecks(id, 'demo-evidence-3')
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k-pending') }), 'INVESTIGATION_PENDING', 'release with queued job')
    const snap = await claim(job.id)
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k-running') }), 'INVESTIGATION_PENDING', 'release with running job')
    await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [] })
    await eventually(() => readiness(id)?.canRelease === true, 'ready after completion')
    const key = uid('k-release')
    await rev.simulateRelease({ applicationId: id, idempotencyKey: key })
    await eventually(() => releases(id).length === 1, 'one release')
    await rev.simulateRelease({ applicationId: id, idempotencyKey: key })
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k-other') }), 'ALREADY_RELEASED', 'second key')
    await rejectsWith(rev.recordReview({ applicationId: id, checkType: 'collateral_review', expectedRevision: app(id).collateralRevision,
      status: 'passed', rationale: 'x', evidenceIds: ['demo-evidence-3'] }), 'ALREADY_RELEASED', 'review after release')
    await rejectsWith(rev.changePaymentInstructions(payment(id, app(id).paymentRevision)), 'ALREADY_RELEASED', 'payment change after release')
    await rejectsWith(ops.requestInvestigation({ applicationId: id, runKey: 'r4-after', executionMode: 'fixture', modelId: undefined }),
      'ALREADY_RELEASED', 'investigation after release')
    await rejectsWith(ops.authorizeUpload({ secretHash: capability().secretHash, applicationId: id, requestId: undefined,
      workerUserId: uid('worker-a'), documentType: 'supporting_document', maxBytes: 100, ttlSeconds: undefined }), 'ALREADY_RELEASED',
    'upload after release')
    await delay(100)
    assert.equal(releases(id).length, 1, 'still exactly one release')
    assert.equal(app(id).stage, 'released_demo')

    const racer = 'demo-case-4'
    await investigateClean(racer, 'r4-race')
    await passAll(racer, 'demo-evidence-4')
    const attempts = await Promise.allSettled([reviewer, reviewer, reviewer, reviewer, reviewer].map((s, i) =>
      s.client.reducers.simulateRelease({ applicationId: racer, idempotencyKey: uid(`race-${i}`) })))
    await delay(150)
    const outcome = { fulfilled: attempts.filter(a => a.status === 'fulfilled').length,
      rejectedAlreadyReleased: attempts.filter(a => a.status === 'rejected' && /ALREADY_RELEASED/.test(String(a.reason))).length,
      releaseRows: releases(racer).length,
      auditRows: [...reviewer.client.db.staffAuditEvents.iter()].filter(e => e.applicationId === racer && e.action === 'simulated_release').length }
    obs('R4-race', outcome)
    assert.deepEqual(outcome, { fulfilled: 1, rejectedAlreadyReleased: 4, releaseRows: 1, auditRows: 1 })
  })

  await suite.test('R5 release gate (agreed policy): blocking findings in every blocking state, then positive control', async () => {
    const id = 'demo-case-1'
    const job = await request(id, 'r5-conflict')
    const snap = await claim(job.id)
    await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [h.highConflict] })
    const finding = await eventually(() => [...officer.client.db.staffFindings.iter()].find(f => f.jobId === job.id), 'finding')
    await passChecks(id, 'demo-evidence-1')
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k1') }), 'BLOCKING_FINDINGS', 'open high finding')
    await ops.decideFinding({ findingId: finding.id, decision: 'escalate', rationale: 'QA escalation', evidenceIds: [] })
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k2') }), 'BLOCKING_FINDINGS', 'escalated high finding')
    const requestId = uid('r5-request')
    await ops.createClarificationDraft({ requestId, findingId: finding.id, template: 'collateral' })
    await ops.sendClarification({ requestId })
    await eventually(() => readiness(id)?.reasons.includes('CLARIFICATION_PENDING'), 'clarification pending reason')
    const awaiting = [...officer.client.db.staffFindings.iter()].find(f => f.id === finding.id)!.status
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k3') }), 'BLOCKING_FINDINGS', 'awaiting_response high finding')
    await ops.decideFinding({ findingId: finding.id, decision: 'resolve', rationale: 'QA: resolved with evidence', evidenceIds: [] })
    await eventually(() => readiness(id)?.canRelease === true, 'ready after resolution')
    const ok = await settle(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k4') }))
    obs('R5', { awaitingStatus: awaiting, releaseAfterResolve: ok.ok ? 'RELEASED' : ok.error })
    assert.equal(awaiting, 'awaiting_response')
    assert.ok(ok.ok, 'agreed policy: resolving the only blocker with current checks permits release')
  })

  await suite.test('R6 release gate (agreed policy): stale and failed checks block release', async () => {
    const id = 'demo-case-8'
    await investigateClean(id, 'r6-clean')
    await rejectsWith(rev.recordReview({ applicationId: id, checkType: 'collateral_review', expectedRevision: app(id).collateralRevision - 1,
      status: 'passed', rationale: 'x', evidenceIds: ['demo-evidence-8'] }), 'STALE_REVIEW', 'review submitted from an older revision')
    await passAll(id, 'demo-evidence-8')
    const before = app(id).collateralRevision
    await ops.recordCollateralClaim({ id: 'demo-collateral-8', applicationId: id, expectedCollateralRevision: before, identifier: 'RT-009113',
      normalizedIdentifier: 'RT-009113', description: 'Synthetic equipment (QA edit)', active: true, exclusiveOwnershipClaim: false,
      evidenceIds: ['demo-evidence-8'] })
    await eventually(() => checkMap(id).collateral_review === 'stale', 'collateral review stale')
    const checks = checkMap(id)
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k-stale') }), 'STALE_REVIEW', 'release with stale checks')
    await passChecks(id, 'demo-evidence-8')
    await delay(100)
    const investigationAfterEdit = readiness(id).reasons
    if (f4Policy === 'v2') {
      // Intentional v2 policy: the collateral edit made the earlier investigation stale.
      assert.ok(investigationAfterEdit.includes('INVESTIGATION_STALE'), `v2: expected INVESTIGATION_STALE, got ${investigationAfterEdit}`)
      await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k-inv-stale') }), 'INVESTIGATION_STALE', 'release with stale investigation')
      await investigateClean(id, 'r6-rerun')
    }
    await eventually(() => readiness(id)?.canRelease === true, 're-reviewed')
    await rev.recordReview({ applicationId: id, checkType: 'payment_verification', expectedRevision: app(id).paymentRevision,
      status: 'needs_review', rationale: 'QA: failed verification', evidenceIds: [] })
    await rejectsWith(rev.simulateRelease({ applicationId: id, idempotencyKey: uid('k-failed') }), 'REVIEW_REQUIRED', 'release with failed check')
    obs('R6', { checksAfterCollateralEdit: checks })
    assert.deepEqual(checks, { collateral_review: 'stale', document_consistency_review: 'stale', payment_verification: 'passed' })
  })
})
