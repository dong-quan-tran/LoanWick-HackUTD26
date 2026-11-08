// Cloud smoke test (Claude). Safe for the shared dev database:
// - demo-org: READ-ONLY checks plus calls that are REJECTED by authorization (rolled back, no writes).
// - qa-cloud org: isolated QA identities and a nonce-named application; never touches demo-case-1..8.
// Env: LOANWICK_DB_URL, LOANWICK_DB_NAME, LOANWICK_SESSIONS_DIR (<role>.token files; tokens are never printed).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { DbConnection } from '../bindings'
import { eventually, obs, rejectsWith, settle } from './qa-harness'

const endpoint = process.env.LOANWICK_DB_URL!
const database = process.env.LOANWICK_DB_NAME!
const dir = process.env.LOANWICK_SESSIONS_DIR!
const nonce = Date.now().toString(36)
const views = {
  staff: ['staff_applications', 'staff_jobs', 'staff_findings', 'staff_readiness', 'staff_releases', 'staff_documents', 'my_upload_grants'],
  borrower: ['borrower_applications', 'borrower_clarifications', 'borrower_documents', 'my_upload_grants'],
  worker: ['worker_available_jobs', 'worker_snapshots', 'worker_job_outcomes', 'worker_upload_grants'],
}
type S = { client: DbConnection; role: string }

test(`cloud smoke on ${database}`, { timeout: 120_000 }, async suite => {
  assert.ok(endpoint && database && dir, 'set LOANWICK_DB_URL, LOANWICK_DB_NAME, LOANWICK_SESSIONS_DIR')
  const open: DbConnection[] = []
  suite.after(() => open.forEach(c => c.disconnect()))
  const connect = (role: string | undefined, subscribe: string[]) => new Promise<S>((resolve, reject) => {
    const b = DbConnection.builder().withUri(endpoint).withDatabaseName(database)
    if (role) b.withToken(readFileSync(join(dir, `${role}.token`), 'utf8').trim())
    open.push(b.onConnect(client => {
      client.subscriptionBuilder().onApplied(() => resolve({ client, role: role ?? 'anonymous' }))
        .onError(ctx => reject(ctx.event ?? new Error('subscription rejected'))).subscribe(['my_user', ...subscribe].map(v => `SELECT * FROM ${v}`))
    }).onConnectError((_c, e) => reject(e)).build())
  })
  const [officer, reviewer, worker, borrowerA, borrowerB, anon, qOfficer, qReviewer, qWorker, qBorrower] = await Promise.all([
    connect('officer', views.staff), connect('reviewer', views.staff), connect('worker', views.worker),
    connect('borrower-a', views.borrower), connect('borrower-b', views.borrower), connect(undefined, [...views.staff, ...views.borrower]),
    connect('qa-officer', views.staff), connect('qa-reviewer', views.staff), connect('qa-worker', views.worker), connect('qa-borrower', views.borrower),
  ])
  const me = (s: S) => [...s.client.db.myUser.iter()][0]
  const out: Record<string, unknown> = {}

  await suite.test('C1 identities, seeded data, and read isolation', async () => {
    out.roles = Object.fromEntries([officer, reviewer, worker, borrowerA, borrowerB, qOfficer, qWorker].map(s => [s.role, `${me(s)?.role}@${me(s)?.organizationId}`]))
    const demoIds = [...officer.client.db.staffApplications.iter()].map(r => r.id).sort()
    const aIds = [...borrowerA.client.db.borrowerApplications.iter()].map(r => r.id).sort()
    const bIds = [...borrowerB.client.db.borrowerApplications.iter()].map(r => r.id).sort()
    out.isolation = { demoOfficerCases: demoIds.length, borrowerA: aIds, borrowerB: bIds,
      qaOfficerSeesDemo: [...qOfficer.client.db.staffApplications.iter()].filter(r => r.id.startsWith('demo-case-')).length,
      anonymousRows: [...anon.client.db.staffApplications.iter()].length + [...anon.client.db.borrowerApplications.iter()].length }
    assert.deepEqual(demoIds, Array.from({ length: 8 }, (_, i) => `demo-case-${i + 1}`).sort())
    assert.deepEqual(aIds, ['demo-case-1', 'demo-case-3', 'demo-case-5', 'demo-case-7'])
    assert.deepEqual(bIds, ['demo-case-2', 'demo-case-4', 'demo-case-6', 'demo-case-8'])
    assert.equal((out.isolation as { qaOfficerSeesDemo: number }).qaOfficerSeesDemo, 0)
    assert.equal((out.isolation as { anonymousRows: number }).anonymousRows, 0)
    const priv = await new Promise<string>(r => anon.client.subscriptionBuilder().onApplied(() => r('applied')).onError(() => r('rejected'))
      .subscribe('SELECT * FROM applications'))
    assert.equal(priv, 'rejected', 'private tables are not subscribable')
  })

  await suite.test('C2 authorization probes are rejected (no writes)', async () => {
    const probes: Array<[string, () => Promise<unknown>, string]> = [
      ['worker.simulateRelease', () => worker.client.reducers.simulateRelease({ applicationId: 'demo-case-8', idempotencyKey: 'x' }), 'UNAUTHORIZED'],
      ['worker.recordReview', () => worker.client.reducers.recordReview({ applicationId: 'demo-case-8', checkType: 'payment_verification',
        expectedRevision: 1, status: 'passed', rationale: 'x', evidenceIds: ['demo-payment-evidence-8'] }), 'UNAUTHORIZED'],
      ['worker.decideFinding', () => worker.client.reducers.decideFinding({ findingId: 'x', decision: 'resolve', rationale: 'x', evidenceIds: [] }), 'UNAUTHORIZED'],
      ['officer.simulateRelease', () => officer.client.reducers.simulateRelease({ applicationId: 'demo-case-8', idempotencyKey: 'x' }), 'UNAUTHORIZED'],
      ['reviewer.requestInvestigation', () => reviewer.client.reducers.requestInvestigation({ applicationId: 'demo-case-8', runKey: 'x',
        executionMode: 'fixture', modelId: undefined }), 'UNAUTHORIZED'],
      ['borrowerA.recordReview', () => borrowerA.client.reducers.recordReview({ applicationId: 'demo-case-1', checkType: 'collateral_review',
        expectedRevision: 1, status: 'passed', rationale: 'x', evidenceIds: [] }), 'UNAUTHORIZED'],
      ['borrowerA.submitApplication(B case)', () => borrowerA.client.reducers.submitApplication({ applicationId: 'demo-case-2' }), 'NOT_FOUND_OR_FORBIDDEN'],
      ['qaOfficer.requestInvestigation(demo)', () => qOfficer.client.reducers.requestInvestigation({ applicationId: 'demo-case-1', runKey: 'x',
        executionMode: 'fixture', modelId: undefined }), 'NOT_FOUND_OR_FORBIDDEN'],
      ['qaReviewer.simulateRelease(demo)', () => qReviewer.client.reducers.simulateRelease({ applicationId: 'demo-case-8', idempotencyKey: 'x' }), 'NOT_FOUND_OR_FORBIDDEN'],
      ['anonymous.assignDemoUser', () => anon.client.reducers.assignDemoUser({ identity: worker.client.identity!, id: 'worker', organizationId: 'demo-org',
        role: 'reviewer', displayName: 'x', active: true }), 'UNAUTHORIZED'],
      ['officer.seedDemo', () => officer.client.reducers.seedDemo({ organizationId: 'demo-org', borrowerAId: 'borrower-a', borrowerBId: 'borrower-b' }), 'UNAUTHORIZED'],
    ]
    const wrong: string[] = []
    for (const [label, p, code] of probes) {
      const r = await settle(p())
      if (r.ok || !new RegExp(`\\b${code}\\b`).test(r.error)) wrong.push(`${label} -> ${r.ok ? 'SUCCEEDED' : r.error}`)
    }
    out.authz = { probes: probes.length, unexpected: wrong }
    assert.deepEqual(wrong, [])
  })

  await suite.test('C3 isolated QA case: live subscriptions, job lifecycle, stale result, release protection', async () => {
    const appId = `qa-cloud-${nonce}`
    const liveOfficer = new Promise<string>(r => qOfficer.client.db.staffApplications.onInsert((_c, row) => { if (row.id === appId) r(row.id) }))
    const liveBorrower = new Promise<string>(r => qBorrower.client.db.borrowerApplications.onInsert((_c, row) => { if (row.id === appId) r(row.id) }))
    const t0 = Date.now()
    await qOfficer.client.reducers.createApplication({ id: appId, borrowerUserId: me(qBorrower)!.id, businessName: 'QA Cloud Synthetic LLC',
      amountCents: 1_000_000n, currency: 'USD' })
    await Promise.all([liveOfficer, liveBorrower])
    const subscriptionMs = Date.now() - t0
    assert.ok(![...officer.client.db.staffApplications.iter()].some(r => r.id === appId), 'demo officer must not see QA case')
    await qOfficer.client.reducers.submitApplication({ applicationId: appId })
    await qOfficer.client.reducers.requestInvestigation({ applicationId: appId, runKey: `run1-${nonce}`, executionMode: 'fixture', modelId: undefined })
    const job = await eventually(() => [...qOfficer.client.db.staffJobs.iter()].find(j => j.applicationId === appId), 'staff job', 10_000)
    await eventually(() => [...qWorker.client.db.workerAvailableJobs.iter()].find(j => j.id === job.id), 'worker sees job live', 10_000)
    assert.ok(![...worker.client.db.workerAvailableJobs.iter()].some(j => j.id === job.id), 'demo-org worker cannot see QA job')
    await rejectsWith(worker.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 30 }), 'NOT_FOUND_OR_FORBIDDEN', 'cross-org claim')
    await qWorker.client.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 60 })
    const snap = await eventually(() => [...qWorker.client.db.workerSnapshots.iter()].find(s => s.id === job.id), 'snapshot', 10_000)
    await qWorker.client.reducers.recordToolEvent({ jobId: job.id, claimEpoch: snap.claimEpoch, sequence: 1, toolName: 'cloud_smoke',
      status: 'succeeded', inputSummary: 'synthetic', outputSummary: 'no findings', durationMs: 1 })
    await qWorker.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [] })
    const ok = await eventually(() => [...qWorker.client.db.workerJobOutcomes.iter()].find(o => o.id === job.id), 'outcome', 10_000)

    await qOfficer.client.reducers.requestInvestigation({ applicationId: appId, runKey: `run2-${nonce}`, executionMode: 'fixture', modelId: undefined })
    const job2 = await eventually(() => [...qOfficer.client.db.staffJobs.iter()].find(j => j.runKey === `run2-${nonce}`), 'second job', 10_000)
    await eventually(() => [...qWorker.client.db.workerAvailableJobs.iter()].find(j => j.id === job2.id), 'worker sees job 2', 10_000)
    await qWorker.client.reducers.claimInvestigation({ jobId: job2.id, leaseSeconds: 60 })
    const snap2 = await eventually(() => [...qWorker.client.db.workerSnapshots.iter()].find(s => s.id === job2.id), 'snapshot 2', 10_000)
    await qOfficer.client.reducers.recordEntity({ id: `qa-entity-${nonce}`, applicationId: appId, name: 'QA Cloud Synthetic LLC',
      normalizedName: 'qa cloud synthetic llc', externalIdentifier: undefined, address: undefined, evidenceIds: [] })
    await qWorker.client.reducers.completeInvestigation({ jobId: job2.id, claimEpoch: snap2.claimEpoch, modelId: undefined, findings: [] })
    const stale = await eventually(() => [...qWorker.client.db.workerJobOutcomes.iter()].find(o => o.id === job2.id), 'stale outcome', 10_000)

    const readiness = await eventually(() => [...qReviewer.client.db.staffReadiness.iter()].find(r => r.applicationId === appId), 'readiness', 10_000)
    const release = await settle(qReviewer.client.reducers.simulateRelease({ applicationId: appId, idempotencyKey: `qa-${nonce}` }))
    const payReview = await settle(qReviewer.client.reducers.recordReview({ applicationId: appId, checkType: 'payment_verification',
      expectedRevision: 0, status: 'passed', rationale: 'no payment evidence', evidenceIds: [] }))
    out.qaCase = { appId, subscriptionMs, firstOutcome: `${ok.status}/${ok.errorCode ?? '-'}`, staleOutcome: `${stale.status}/${stale.errorCode ?? '-'}`,
      readinessReasons: readiness.reasons, release: release.ok ? 'RELEASED' : release.error.replace(/^.*?Error:\s*/, ''),
      paymentReviewWithoutEvidence: payReview.ok ? 'OK' : payReview.error.replace(/^.*?Error:\s*/, ''),
      releasesInDemoOrg: [...officer.client.db.staffReleases.iter()].length }
    obs('CLOUD', out)
    assert.equal(ok.status, 'succeeded')
    assert.deepEqual([stale.status, stale.errorCode], ['failed', 'STALE_RESULTS'])
    assert.ok(!release.ok, 'release must be refused without reviews and a current investigation')
    assert.ok(!payReview.ok, 'payment verification without evidence must be refused')
  })
})
