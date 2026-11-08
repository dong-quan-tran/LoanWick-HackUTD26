// QA reproductions for F1, F5, F6 and the F4 release policy (Claude). Requires commit 0bc9396+ interfaces
// (worker_job_outcomes, seeded payment evidence). Every assertion states the CORRECT behavior.
// F4 follows qa-harness.ts f4Policy (default 'v2', the policy agreed on 2026-11-07).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { DbConnection } from '../bindings'
import {
  adminToken, attachDirect, authorizeGrant, eventually, f4Policy, helpers, makeConnector, obs, org, settle, staffViews, uid, workerViews,
} from './qa-harness'

test(`QA reproductions F1 F6 F5 F4 (F4 policy: ${f4Policy})`, { timeout: 90_000 }, async suite => {
  const connections: DbConnection[] = []
  suite.after(() => connections.forEach(c => c.disconnect()))
  const connect = makeConnector(connections)
  const [admin, officer, reviewer, borrowerA, borrowerB, worker] = await Promise.all([
    connect([], adminToken), connect(staffViews), connect(staffViews), connect([]), connect([]), connect([...workerViews, 'staff_jobs']),
  ])
  for (const [s, name, role] of [[officer, 'officer', 'officer'], [reviewer, 'reviewer', 'reviewer'],
    [borrowerA, 'borrower-a', 'borrower'], [borrowerB, 'borrower-b', 'borrower'], [worker, 'worker', 'worker']] as const) {
    await admin.client.reducers.assignDemoUser({ identity: s.identity, id: uid(name), organizationId: org, role, displayName: name, active: true })
  }
  await admin.client.reducers.seedDemo({ organizationId: org, borrowerAId: uid('borrower-a'), borrowerBId: uid('borrower-b') })
  await eventually(() => [...officer.client.db.staffApplications.iter()].length === 8, 'seeded cases')
  const h = helpers(officer, reviewer, worker)
  const { ops, rev, wk, app, staffJob, readiness, checkMap, request, claim, passChecks, passAll, payment } = h
  const outcome = (jobId: string) => {
    const o = [...worker.client.db.workerJobOutcomes.iter()].find(r => r.id === jobId)
    return o ? { status: o.status, errorCode: o.errorCode ?? null, claimEpoch: o.claimEpoch, acceptedFindingIds: o.acceptedFindingIds } : null
  }
  const workerSees = (jobId: string) => ({
    outcome: outcome(jobId),
    snapshots: [...worker.client.db.workerSnapshots.iter()].filter(r => r.id === jobId).length,
    staffJobsRowsVisibleToWorker: [...worker.client.db.staffJobs.iter()].length,
  })
  const waitOutcome = (jobId: string) => eventually(() => outcome(jobId) ?? undefined, `outcome ${jobId}`, 3000).catch(() => null)
  const release = (id: string, key: string) => settle(rev.simulateRelease({ applicationId: id, idempotencyKey: uid(key) }))
  const fmt = (r: { ok: boolean; error?: string }) => r.ok ? 'OK' : (r.error ?? '').replace(/^.*?Error:\s*/, '')

  // ---------------------------------------------------------------- F1
  await suite.test('F1 [defect] worker can distinguish accepted vs stale-rejected results', async () => {
    const okJob = await request('demo-case-3', 'f1-success')
    const okSnap = await claim(okJob.id)
    const okCall = await settle(wk.completeInvestigation({ jobId: okJob.id, claimEpoch: okSnap.claimEpoch, modelId: undefined, findings: [] }))
    await waitOutcome(okJob.id)

    const staleJob = await request('demo-case-4', 'f1-stale')
    const staleSnap = await claim(staleJob.id)
    await rev.changePaymentInstructions(payment('demo-case-4', app('demo-case-4').paymentRevision))
    await eventually(() => [...worker.client.db.workerSnapshots.iter()].find(r => r.id === staleJob.id)?.inputsCurrent === false, 'inputs stale')
    const staleCall = await settle(wk.completeInvestigation({ jobId: staleJob.id, claimEpoch: staleSnap.claimEpoch, modelId: undefined, findings: [] }))
    await waitOutcome(staleJob.id)

    const claimStaleJob = await request('demo-case-3', 'f1-claim-stale')
    await rev.changePaymentInstructions(payment('demo-case-3', app('demo-case-3').paymentRevision))
    await eventually(() => app('demo-case-3').paymentRevision === 2, 'case 3 revision bump')
    const claimCall = await settle(wk.claimInvestigation({ jobId: claimStaleJob.id, leaseSeconds: 90 }))
    await waitOutcome(claimStaleJob.id)

    const result = {
      success: { call: fmt(okCall), worker: workerSees(okJob.id), server: `${staffJob('f1-success')!.status}/${staffJob('f1-success')!.errorCode ?? '-'}` },
      staleCompletion: { call: fmt(staleCall), worker: workerSees(staleJob.id), server: `${staffJob('f1-stale')!.status}/${staffJob('f1-stale')!.errorCode ?? '-'}` },
      staleClaim: { call: fmt(claimCall), worker: workerSees(claimStaleJob.id),
        server: `${staffJob('f1-claim-stale')!.status}/${staffJob('f1-claim-stale')!.errorCode ?? '-'}` },
    }
    obs('F1', result)
    assert.equal(result.success.worker.outcome?.status, 'succeeded', 'worker sees acceptance')
    assert.deepEqual(result.success.worker.outcome?.claimEpoch, okSnap.claimEpoch, 'outcome carries the claim epoch')
    assert.deepEqual([result.staleCompletion.worker.outcome?.status, result.staleCompletion.worker.outcome?.errorCode], ['failed', 'STALE_RESULTS'],
      'worker sees stale completion rejection')
    assert.deepEqual([result.staleClaim.worker.outcome?.status, result.staleClaim.worker.outcome?.errorCode], ['failed', 'STALE_RESULTS'],
      'worker sees stale claim outcome')
    assert.equal(result.staleCompletion.worker.staffJobsRowsVisibleToWorker, 0, 'worker still cannot read staff job rows')
  })

  // ---------------------------------------------------------------- F6
  await suite.test('F6 [defect] new payment-instruction document invalidates payment verification; evidence must match', async () => {
    const id = 'demo-case-7'
    await h.investigateClean(id, 'f6-clean')
    await passAll(id, 'demo-evidence-7')
    const steps: Record<string, unknown> = {}
    steps.b_paymentReviewWithCollateralEvidence = fmt(await settle(rev.recordReview({ applicationId: id, checkType: 'payment_verification',
      expectedRevision: app(id).paymentRevision, status: 'passed', rationale: 'QA', evidenceIds: ['demo-evidence-7'] })))
    const revBefore = { app: app(id).applicationRevision, payment: app(id).paymentRevision }
    const newEvidence = uid('pay-evidence'), token = 'demo_qa_new'
    const excerpt = `Updated payment instructions. Synthetic payment account token: ${token}.`
    const { grantId } = await authorizeGrant(officer, { applicationId: id, documentType: 'payment_instructions', workerUserId: uid('worker'),
      maxBytes: 4096 })
    await attachDirect(worker, grantId, { applicationId: id, documentType: 'payment_instructions', bytes: Buffer.from(excerpt),
      evidence: [{ id: newEvidence, excerpt, fieldName: 'syntheticAccountToken', fieldValue: token, extractionMethod: 'fixture', locator: 'line 1' }] })
    await eventually(() => app(id).applicationRevision > revBefore.app, 'revision bump after upload')
    await delay(100)
    steps.d_afterUpload = { revisions: { before: revBefore, after: { app: app(id).applicationRevision, payment: app(id).paymentRevision } }, checks: checkMap(id) }
    await rev.recordReview({ applicationId: id, checkType: 'document_consistency_review', expectedRevision: app(id).applicationRevision,
      status: 'passed', rationale: 'QA re-review of documents', evidenceIds: [newEvidence] })
    await delay(100)
    steps.e_releaseAfterOnlyDocReReview = fmt(await release(id, 'f6-e'))
    const verify = () => settle(rev.recordReview({ applicationId: id, checkType: 'payment_verification', expectedRevision: app(id).paymentRevision,
      status: 'passed', rationale: 'QA payment verification', evidenceIds: [newEvidence] }))
    steps.f_verifyBeforeSelectingInstruction = fmt(await verify())
    await rev.changePaymentInstructions({ ...payment(id, app(id).paymentRevision), syntheticAccountToken: 'demo_qa_wrong', evidenceIds: [newEvidence] })
    await delay(100)
    steps.g_verifyWithMismatchedToken = fmt(await verify())
    await rev.changePaymentInstructions({ ...payment(id, app(id).paymentRevision), syntheticAccountToken: token, evidenceIds: [newEvidence] })
    await delay(100)
    steps.h_verifyWithMatchingToken = fmt(await verify())
    await h.investigateClean(id, 'f6-rerun')
    await passChecks(id, 'demo-evidence-7', newEvidence)
    await eventually(() => readiness(id)?.canRelease === true, 'ready after re-verification', 3000).catch(() => undefined)
    steps.i_readinessAfterReverify = { canRelease: readiness(id).canRelease, reasons: readiness(id).reasons }
    steps.i_release = fmt(await release(id, 'f6-i'))
    obs('F6', steps)
    assert.match(String(steps.b_paymentReviewWithCollateralEvidence), /INVALID_EVIDENCE/, 'F6b: collateral evidence must not verify payment')
    assert.equal((steps.d_afterUpload as { checks: Record<string, string> }).checks.payment_verification, 'stale', 'payment doc stales payment verification')
    assert.notEqual(steps.e_releaseAfterOnlyDocReReview, 'OK', 'release blocked until payment is re-verified')
    assert.match(String(steps.f_verifyBeforeSelectingInstruction), /INVALID_EVIDENCE/, 'new evidence needs a selected instruction')
    assert.match(String(steps.g_verifyWithMismatchedToken), /INVALID_EVIDENCE/, 'evidence token must match the instruction')
    assert.equal(steps.h_verifyWithMatchingToken, 'OK', 'matching instruction + evidence verifies')
    assert.equal(steps.i_release, 'OK', 'positive control: release after re-verification and a current investigation')
  })

  // ---------------------------------------------------------------- F5
  await suite.test('F5 [defect] re-running an investigation does not accumulate duplicate findings', async () => {
    const id = 'demo-case-1'
    const accepted: string[][] = []
    for (const runKey of ['f5-run-1', 'f5-run-2']) {
      const job = await request(id, runKey)
      const snap = await claim(job.id)
      await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [h.highConflict] })
      accepted.push((await waitOutcome(job.id))?.acceptedFindingIds ?? [])
    }
    await delay(150)
    const open = () => [...officer.client.db.staffFindings.iter()]
      .filter(f => f.applicationId === id && f.deduplicationKey === 'FL-004821' && f.status !== 'resolved')
    const afterTwoRuns = open().map(f => ({ id: f.id, status: f.status, isCurrent: f.isCurrent }))
    await ops.decideFinding({ findingId: open()[0].id, decision: 'resolve', rationale: 'QA: resolved', evidenceIds: [] })
    await delay(150)
    const result = { acceptedFindingIdsPerRun: accepted, unresolvedAfterTwoRuns: afterTwoRuns, stillOpenAfterResolve: open().length,
      reasons: readiness(id).reasons }
    obs('F5', result)
    assert.equal(afterTwoRuns.length, 1, 'one unresolved finding per deduplication key')
    assert.equal(accepted[0][0], accepted[1][0], 'rerun refreshes the same finding ID')
    assert.ok(!result.reasons.includes('BLOCKING_FINDINGS'), 'resolving the single finding clears the blocker')
  })

  // ---------------------------------------------------------------- F4-C cross-case ownership hold
  await suite.test(`F4-C [policy:${f4Policy}] unresolved evidence-backed ownership conflict blocks every implicated case`, async () => {
    const owner = 'demo-case-2', implicated = 'demo-case-1'
    const job = await request(owner, 'f4c-conflict')
    const snap = await claim(job.id)
    const conflict = { ...h.highConflict, evidenceIds: ['demo-evidence-2', 'demo-evidence-1'], relatedApplicationIds: [implicated],
      explanation: 'Pineworks Supply and Northline Foods both claim exclusive ownership of forklift FL-004821.' }
    await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [conflict] })
    const finding = await eventually(() => [...officer.client.db.staffFindings.iter()].find(f => f.jobId === job.id), 'conflict finding')
    await passChecks(implicated, 'demo-evidence-1')
    await delay(150)
    const held = { reasons: readiness(implicated).reasons, release: fmt(await release(implicated, 'f4c-held')) }
    await ops.decideFinding({ findingId: finding.id, decision: 'resolve', rationale: 'QA: ownership clarified', evidenceIds: [] })
    await eventually(() => readiness(implicated)?.canRelease === true, 'hold lifted', 3000).catch(() => undefined)
    const lifted = { reasons: readiness(implicated).reasons, release: fmt(await release(implicated, 'f4c-lifted')) }
    obs('F4-C', { crossCaseOwnershipVerified: finding.crossCaseOwnershipVerified ?? null, held, lifted })
    if (f4Policy === 'v2') {
      assert.ok(held.reasons.includes('BLOCKING_FINDINGS') && held.release !== 'OK', 'implicated case is held while the conflict is unresolved')
      assert.equal(lifted.release, 'OK', 'positive control: resolving the conflict lifts the hold')
    } else {
      assert.equal(held.release, 'OK', 'v1: other cases are not held')
    }
  })

  // ---------------------------------------------------------------- F4-B
  await suite.test(`F4-B [policy:${f4Policy}] release after a cancelled (never completed) investigation`, async () => {
    const id = 'demo-case-8'
    const job = await request(id, 'f4b-cancel')
    await ops.cancelInvestigation({ jobId: job.id })
    await eventually(() => staffJob('f4b-cancel')?.status === 'cancelled', 'cancelled')
    await passChecks(id, 'demo-evidence-8')
    await delay(150)
    const r = { canRelease: readiness(id).canRelease, reasons: readiness(id).reasons }
    const call = fmt(await release(id, 'f4b'))
    obs('F4-B', { readiness: r, release: call })
    if (f4Policy === 'v2') {
      assert.ok(r.reasons.includes('INVESTIGATION_MISSING') && call !== 'OK', 'release needs a successful investigation')
    } else assert.equal(call, 'OK')
  })

  // ---------------------------------------------------------------- F4-D + F4-A
  await suite.test(`F4-D [policy:${f4Policy}] a worker cannot forge a hold; non-ownership findings create none`, async () => {
    const owner = 'demo-case-5', related = 'demo-case-6'
    const job = await request(owner, 'f4d-group')
    const snap = await claim(job.id)
    const forged = { ...h.highConflict, evidenceIds: ['demo-evidence-5', 'demo-evidence-6'], relatedApplicationIds: [related],
      deduplicationKey: 'forged-conflict', explanation: 'Unsupported ownership conflict.' }
    const forgedCall = fmt(await settle(wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [forged] })))
    const group = { type: 'related_group_exposure', severity: 'high', evidenceState: 'supported', title: 'Confirmed related borrower group',
      explanation: 'Cedar Equipment is a subsidiary of Cedar Service Group.', uncertainty: '', suggestedNextStep: 'Review combined exposure.',
      evidenceIds: ['demo-evidence-5', 'demo-evidence-6'], relatedApplicationIds: [related], ruleVersion: 'fixture-1', deduplicationKey: 'cedar-group' }
    await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [group] })
    await waitOutcome(job.id)
    await h.investigateClean(related, 'f4d-related-clean')
    await passChecks(related, 'demo-evidence-6')
    await delay(150)
    const relatedReasons = readiness(related).reasons
    obs('F4-D', { forgedConflict: forgedCall, relatedCaseReasons: relatedReasons, ownerReasons: readiness(owner).reasons })
    assert.match(forgedCall, /INVALID_EVIDENCE/, 'a high collateral_conflict without matching exclusive claims is rejected')
    assert.ok(!relatedReasons.includes('BLOCKING_FINDINGS'), 'a non-ownership cross-case finding does not hold the related case')
    assert.ok(readiness(owner).reasons.includes('BLOCKING_FINDINGS'), 'the high finding still blocks its own case')
  })

  await suite.test(`F4-A [policy:${f4Policy}] release after a related source case changed post-completion`, async () => {
    const id = 'demo-case-6', source = 'demo-case-5'
    await eventually(() => readiness(id)?.canRelease === true, 'case 6 ready before source change', 3000).catch(() => undefined)
    const before = { canRelease: readiness(id).canRelease, reasons: readiness(id).reasons }
    await rev.changePaymentInstructions(payment(source, app(source).paymentRevision))
    await delay(200)
    const after = { canRelease: readiness(id).canRelease, reasons: readiness(id).reasons, stage: app(id).stage }
    const staleRelease = fmt(await release(id, 'f4a-stale'))
    await h.investigateClean(id, 'f4a-rerun')
    await eventually(() => readiness(id)?.canRelease === true, 'ready after rerun', 3000).catch(() => undefined)
    const rerunRelease = fmt(await release(id, 'f4a-rerun'))
    obs('F4-A', { before, afterSourceChange: after, staleRelease, afterRerun: rerunRelease })
    assert.equal(before.canRelease, true, 'setup: case 6 releasable before the source changes')
    if (f4Policy === 'v2') {
      assert.ok(after.reasons.includes('INVESTIGATION_STALE') && staleRelease !== 'OK', 'stale related-case investigation blocks release')
      assert.equal(rerunRelease, 'OK', 'positive control: a fresh investigation restores release')
    } else assert.equal(staleRelease, 'OK')
  })
})
