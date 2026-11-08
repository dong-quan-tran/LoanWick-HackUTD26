// Shared QA harness (Claude). Copied into <export>/spacetimedb/tests/ by run-qa.sh. Never run against a used database.
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Identity } from 'spacetimedb'
import { DbConnection } from '../bindings'

export const endpoint = process.env.LOANWICK_DB_URL ?? 'http://127.0.0.1:4310'
export const database = process.env.LOANWICK_DB_NAME
export const adminToken = process.env.LOANWICK_ADMIN_TOKEN
// F4 policy switch.
// 'v2' (DEFAULT, agreed 2026-11-07): release also requires a successful investigation that is current (case, related
//      source revisions, and source membership), and an unresolved evidence-backed cross-case ownership conflict
//      (high collateral_conflict with matching exclusive claims) blocks every implicated application.
// 'v1' (legacy, commits before 0bc9396): stage + current passed checks + no own blocking findings + no prior release.
export const f4Policy = process.env.QA_F4_POLICY === 'v1' ? 'v1' : 'v2'
/** Seeded payment evidence (0bc9396+): demo-case-N -> demo-payment-evidence-N. */
export const paymentEvidence = (applicationId: string) =>
  applicationId.startsWith('demo-case-') ? `demo-payment-evidence-${applicationId.slice('demo-case-'.length)}` : undefined

export const nonce = Date.now().toString(36)
export const uid = (name: string) => `qa-${nonce}-${name}`
export const org = `qa-org-${nonce}`
export const otherOrg = `qa-other-${nonce}`

export const staffViews = ['staff_applications', 'staff_documents', 'staff_evidence', 'staff_jobs', 'staff_findings',
  'staff_clarifications', 'staff_reviews', 'staff_readiness', 'staff_releases', 'staff_audit_events', 'my_upload_grants']

// ---- B2 upload contract (09288eb+): client-generated secret, server-generated grant ID found by hash.
export function capability() {
  const secret = randomBytes(32).toString('hex')
  return { secret, secretHash: createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex') }
}
export type GrantArgs = { applicationId: string; requestId?: string; documentType: string; workerUserId: string; maxBytes: number; ttlSeconds?: number }
export async function authorizeGrant(uploader: Session, args: GrantArgs) {
  const cap = capability()
  await uploader.client.reducers.authorizeUpload({ secretHash: cap.secretHash, applicationId: args.applicationId, requestId: args.requestId,
    workerUserId: args.workerUserId, documentType: args.documentType, maxBytes: args.maxBytes, ttlSeconds: args.ttlSeconds })
  const row = await eventually(() => [...uploader.client.db.myUploadGrants.iter()].find(g => g.secretHash === cap.secretHash), 'own grant row')
  return { grantId: row.id, ...cap }
}
/** Reducer-level claim + attach (bypasses the HTTPS transport). */
export async function attachDirect(worker: Session, grantId: string, args: { applicationId: string; requestId?: string; documentType: string;
  bytes: Buffer; evidence?: Array<{ id: string; excerpt: string; fieldName?: string; fieldValue?: string; extractionMethod: string; locator?: string }> }) {
  await eventually(() => [...worker.client.db.workerUploadGrants.iter()].find(g => g.id === grantId), 'grant visible to worker')
  const claimId = randomUUID(), byteLength = args.bytes.length, documentId = randomUUID()
  await worker.client.reducers.claimUpload({ grantId, claimId, applicationId: args.applicationId, requestId: args.requestId,
    documentType: args.documentType, byteLength })
  await worker.client.reducers.attachDocument({ grantId, claimId, byteLength, documentId, replacesDocumentId: undefined,
    sha256: createHash('sha256').update(args.bytes).digest('hex'), displayFilename: 'qa-upload.txt', storageKey: `qa-${documentId}`,
    extractionStatus: args.evidence?.length ? 'extracted' : 'unsupported',
    evidence: (args.evidence ?? []).map(e => ({ fieldName: undefined, fieldValue: undefined, locator: undefined, pageNumber: undefined, ...e })) })
  return documentId
}
export const borrowerViews = ['borrower_applications', 'borrower_clarifications', 'borrower_documents', 'borrower_own_responses',
  'my_upload_grants']
export const workerViews = ['worker_available_jobs', 'worker_snapshots', 'worker_job_outcomes', 'worker_upload_grants']

export const obs = (label: string, value: unknown) =>
  console.log(`OBS ${label}: ${JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)}`)

export async function eventually<T>(read: () => T | undefined | false, description: string, ms = 5000): Promise<T> {
  const end = Date.now() + ms
  do {
    const value = read()
    if (value !== undefined && value !== false) return value
    await delay(15)
  } while (Date.now() < end)
  throw new Error(`Timed out waiting for ${description}`)
}

export async function settle<T>(p: Promise<T>) {
  try { return { ok: true as const, value: await p } } catch (error) { return { ok: false as const, error: String(error) } }
}

/** Asserts the call is rejected with exactly this error code (reducer SenderError text). */
export async function rejectsWith(p: Promise<unknown>, code: string, label: string) {
  const result = await settle(p)
  assert.ok(!result.ok, `${label}: expected ${code} but the call succeeded`)
  assert.match(result.error, new RegExp(`\\b${code}\\b`), `${label}: expected ${code}, got ${result.error}`)
}

export type Session = { client: DbConnection; identity: Identity }

export function makeConnector(connections: DbConnection[]) {
  assert.ok(database && adminToken, 'Set LOANWICK_DB_NAME and LOANWICK_ADMIN_TOKEN for a FRESH disposable database')
  return (views: string[], token?: string) => new Promise<Session>((resolve, reject) => {
    const builder = DbConnection.builder().withUri(endpoint).withDatabaseName(database!)
    if (token) builder.withToken(token)
    connections.push(builder.onConnect((client, identity) => {
      client.subscriptionBuilder().onApplied(() => resolve({ client, identity }))
        .onError(ctx => reject(ctx.event ?? new Error('subscription rejected')))
        .subscribe(['my_user', ...views].map(v => `SELECT * FROM ${v}`))
    }).onConnectError((_c, e) => reject(e)).build())
  })
}

export function helpers(officer: Session, reviewer: Session, worker: Session) {
  const ops = officer.client.reducers, rev = reviewer.client.reducers, wk = worker.client.reducers
  const app = (id: string) => [...officer.client.db.staffApplications.iter()].find(r => r.id === id)!
  const staffJob = (runKey: string) => [...officer.client.db.staffJobs.iter()].find(j => j.runKey === runKey)
  const readiness = (id: string) => [...reviewer.client.db.staffReadiness.iter()].find(r => r.applicationId === id)!
  const checkMap = (id: string) => Object.fromEntries(readiness(id).checks.map(c => [c.checkType, c.status]))
  const request = async (applicationId: string, runKey: string) => {
    await ops.requestInvestigation({ applicationId, runKey, executionMode: 'fixture', modelId: undefined })
    return eventually(() => staffJob(runKey), `job ${runKey}`)
  }
  const claim = async (jobId: string, by: Session = worker) => {
    await by.client.reducers.claimInvestigation({ jobId, leaseSeconds: 90 })
    return eventually(() => [...by.client.db.workerSnapshots.iter()].find(r => r.id === jobId), `snapshot ${jobId}`)
  }
  const investigateClean = async (applicationId: string, runKey: string) => {
    const job = await request(applicationId, runKey)
    const snap = await claim(job.id)
    await wk.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [] })
    await eventually(() => staffJob(runKey)?.status === 'succeeded', `${runKey} succeeded`)
    return job
  }
  /** Records all three required checks as passed at the currently observed revisions. Does not wait for readiness. */
  const passChecks = async (id: string, evidenceId: string, paymentEvidenceId = paymentEvidence(id) ?? evidenceId) => {
    await eventually(() => app(id), `case ${id} visible`)
    const a = app(id)
    for (const [checkType, expectedRevision, ev] of [['collateral_review', a.collateralRevision, evidenceId],
      ['document_consistency_review', a.applicationRevision, evidenceId],
      ['payment_verification', a.paymentRevision, paymentEvidenceId]] as const) {
      await rev.recordReview({ applicationId: id, checkType, expectedRevision, status: 'passed', rationale: 'QA review', evidenceIds: [ev] })
    }
  }
  const passAll = async (id: string, evidenceId: string, paymentEvidenceId?: string) => {
    await passChecks(id, evidenceId, paymentEvidenceId)
    return eventually(() => readiness(id)?.canRelease === true && readiness(id), `${id} ready`)
  }
  const payment = (applicationId: string, expectedPaymentRevision: number) => ({ applicationId, expectedPaymentRevision,
    syntheticAccountToken: 'demo_qa_changed', maskedDisplay: '**** 9999', beneficiaryName: 'QA beneficiary', evidenceIds: [] as string[] })
  const highConflict = {
    type: 'collateral_conflict', severity: 'high', evidenceState: 'supported', title: 'Conflicting ownership claims',
    explanation: 'Two schedules claim exclusive ownership of forklift FL-004821.', uncertainty: 'A schedule may be out of date.',
    suggestedNextStep: 'Ask for an updated equipment schedule.', evidenceIds: ['demo-evidence-1', 'demo-evidence-2'],
    relatedApplicationIds: ['demo-case-2'], ruleVersion: 'fixture-1', deduplicationKey: 'FL-004821',
  }
  return { ops, rev, wk, app, staffJob, readiness, checkMap, request, claim, investigateClean, passChecks, passAll, payment, highConflict }
}
