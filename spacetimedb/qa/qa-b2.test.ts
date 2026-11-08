// QA B2 suite (Claude): attacks the REAL HTTPS upload transport (transport/upload.ts) and the upload reducers.
// Each check asserts the secure behavior. Requires commit 09288eb+ and OpenSSL (Git for Windows copy auto-detected).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { connect as tlsConnect } from 'node:tls'
import type { DbConnection } from '../bindings'
import { createUploadServer } from '../transport/upload'
import {
  adminToken, authorizeGrant, borrowerViews, capability, eventually, helpers, makeConnector, obs, org, rejectsWith, settle, staffViews,
  uid, workerViews,
} from './qa-harness'

const ORIGIN = 'https://loanwick.test'

function openssl() {
  if (process.env.LOANWICK_OPENSSL) return process.env.LOANWICK_OPENSSL
  if (process.platform === 'win32') {
    const bundled = resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../usr/bin/openssl.exe')
    if (existsSync(bundled)) return bundled
  }
  return 'openssl'
}

type Reply = { status: number | string; body: string; acao?: string }

test('QA B2: secure upload transport and single-use grants', { timeout: 120_000 }, async suite => {
  const connections: DbConnection[] = []
  suite.after(() => connections.forEach(c => c.disconnect()))
  const connect = makeConnector(connections)
  const [admin, officer, reviewer, borrowerA, borrowerB, workerA, workerB] = await Promise.all([
    connect([], adminToken), connect(staffViews), connect(staffViews), connect(borrowerViews), connect(borrowerViews),
    connect(workerViews), connect(workerViews),
  ])
  for (const [s, name, role] of [[officer, 'officer', 'officer'], [reviewer, 'reviewer', 'reviewer'], [borrowerA, 'borrower-a', 'borrower'],
    [borrowerB, 'borrower-b', 'borrower'], [workerA, 'worker-a', 'worker'], [workerB, 'worker-b', 'worker']] as const) {
    await admin.client.reducers.assignDemoUser({ identity: s.identity, id: uid(name), organizationId: org, role, displayName: name, active: true })
  }
  await admin.client.reducers.seedDemo({ organizationId: org, borrowerAId: uid('borrower-a'), borrowerBId: uid('borrower-b') })
  await eventually(() => [...officer.client.db.staffApplications.iter()].length === 8, 'seeded cases')
  const h = helpers(officer, reviewer, workerA)

  // ---- Real transport, running as worker A, with a recording storage callback (stands in for the real adapter).
  const dir = mkdtempSync(join(tmpdir(), 'qa-b2-tls-'))
  suite.after(() => rmSync(dir, { recursive: true, force: true }))
  execFileSync(openssl(), ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' })
  const cert = readFileSync(join(dir, 'c.pem'))
  const stored: Array<{ documentId: string; bytes: number; sha256: string }> = []
  const server = createUploadServer({ key: readFileSync(join(dir, 'k.pem')), cert, allowedOrigin: ORIGIN }, workerA.client,
    async input => {
      stored.push({ documentId: input.documentId, bytes: input.bytes.length, sha256: input.sha256 })
      return { replacesDocumentId: undefined, displayFilename: 'qa-upload.bin', storageKey: `qa-${input.documentId}`,
        extractionStatus: 'unsupported', evidence: [] }
    })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  suite.after(() => new Promise<void>(r => server.close(() => r())))
  const port = (server.address() as { port: number }).port

  const send = (headers: Record<string, string>, body: Buffer, opts: { chunked?: boolean; method?: string } = {}) =>
    new Promise<Reply>(res => {
      const req = httpsRequest({ host: '127.0.0.1', port, ca: cert, path: '/documents/upload', method: opts.method ?? 'POST',
        headers: { ...(opts.chunked ? {} : { 'content-length': String(body.length) }), ...headers } }, r => {
        let text = ''; r.setEncoding('utf8').on('data', c => { text += c })
        r.on('end', () => res({ status: r.statusCode ?? 'none', body: text, acao: r.headers['access-control-allow-origin'] as string | undefined }))
      })
      req.on('error', e => res({ status: `error:${(e as NodeJS.ErrnoException).code ?? e.message}`, body: '' }))
      req.setTimeout(8000, () => req.destroy(new Error('timeout')))
      if (opts.method === 'OPTIONS') req.end()
      else if (opts.chunked) { req.write(body.subarray(0, 5)); req.end(body.subarray(5)) } else req.end(body)
    })
  /** Raw TLS request whose body is SHORTER than its Content-Length, then half-closes. */
  const sendShort = (headers: Record<string, string>, declared: number, actual: Buffer) => new Promise<Reply>(res => {
    const socket = tlsConnect({ host: '127.0.0.1', port, ca: cert }, () => {
      const lines = [`POST /documents/upload HTTP/1.1`, `Host: 127.0.0.1:${port}`, `Content-Length: ${declared}`,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), 'Connection: close', '', '']
      socket.write(lines.join('\r\n')); socket.end(actual)
    })
    let raw = ''; socket.setEncoding('utf8').on('data', c => { raw += c })
    socket.on('close', () => res({ status: raw.match(/^HTTP\/1\.1 (\d+)/)?.[1] ?? 'closed-no-response', body: raw.split('\r\n\r\n')[1] ?? '' }))
    socket.on('error', () => undefined)
    setTimeout(() => socket.destroy(), 8000)
  })
  const hdr = (g: { grantId: string; secret: string }, applicationId: string, documentType: string, extra: Record<string, string> = {}) =>
    ({ 'x-upload-grant': g.grantId, 'x-upload-secret': g.secret, 'x-application-id': applicationId, 'x-document-type': documentType, ...extra })
  const grantRow = (s: { client: DbConnection }, id: string) => [...s.client.db.myUploadGrants.iter()].find(g => g.id === id)
  const officerGrant = async (applicationId = 'demo-case-3', maxBytes = 64, ttlSeconds?: number, worker = 'worker-a') => {
    const g = await authorizeGrant(officer, { applicationId, documentType: 'supporting_document', workerUserId: uid(worker), maxBytes, ttlSeconds })
    await eventually(() => [...(worker === 'worker-a' ? workerA : workerB).client.db.workerUploadGrants.iter()].find(r => r.id === g.grantId),
      'grant reaches worker')
    return g
  }
  const body = Buffer.from('synthetic QA document bytes')
  const results: Record<string, unknown> = {}

  await suite.test('B2-1 happy path: HTTPS upload attaches exactly once; secret never stored', async () => {
    const g = await officerGrant()
    const r = await send(hdr(g, 'demo-case-3', 'supporting_document'), body)
    await eventually(() => grantRow(officer, g.grantId)?.status === 'attached', 'grant attached')
    const row = grantRow(officer, g.grantId)!
    const doc = [...officer.client.db.staffDocuments.iter()].find(d => d.id === row.attachedDocumentId)
    const workerRow = [...workerA.client.db.workerUploadGrants.iter()].find(x => x.id === g.grantId)!
    const audits = JSON.stringify([...officer.client.db.staffAuditEvents.iter()], (_k, v) => typeof v === 'bigint' ? v.toString() : v)
    results.happy = { status: r.status, grantStatus: row.status, docSha: doc?.sha256 === stored.at(-1)?.sha256, storedBytes: stored.at(-1)?.bytes }
    assert.equal(r.status, 201)
    assert.ok(doc && doc.sha256 === stored.at(-1)!.sha256 && stored.at(-1)!.bytes === body.length, 'document recorded with worker-computed hash')
    assert.ok(!('secret' in workerRow) && workerRow.secretHash === g.secretHash, 'worker sees only the hash')
    assert.ok(!audits.includes(g.secret), 'secret never appears in audit events')

    const replay = await send(hdr(g, 'demo-case-3', 'supporting_document'), body)
    results.replay = replay.status
    assert.equal(replay.status, 403, 'replay of a used grant is denied')
  })

  await suite.test('B2-2 credential and scope checks deny without consuming the grant', async () => {
    const g = await officerGrant()
    const checks: Record<string, Reply> = {
      wrongSecret: await send(hdr({ ...g, secret: capability().secret }, 'demo-case-3', 'supporting_document'), body),
      wrongApplication: await send(hdr(g, 'demo-case-4', 'supporting_document'), body),
      wrongDocumentType: await send(hdr(g, 'demo-case-3', 'collateral_schedule'), body),
      spuriousRequestId: await send(hdr(g, 'demo-case-3', 'supporting_document', { 'x-request-id': 'r1' }), body),
      bearerTokenHeader: await send(hdr(g, 'demo-case-3', 'supporting_document', { authorization: 'Bearer x' }), body),
      foreignOrigin: await send(hdr(g, 'demo-case-3', 'supporting_document', { origin: 'https://evil.example' }), body),
      oversize: await send(hdr(g, 'demo-case-3', 'supporting_document'), Buffer.alloc(65, 1)),
      chunkedNoLength: await send(hdr(g, 'demo-case-3', 'supporting_document'), body, { chunked: true }),
      missingSecret: await send({ 'x-upload-grant': g.grantId, 'x-application-id': 'demo-case-3', 'x-document-type': 'supporting_document' }, body),
    }
    await delay(150)
    const statusAfter = grantRow(officer, g.grantId)?.status
    const ok = await send(hdr(g, 'demo-case-3', 'supporting_document'), body)
    results.denials = { ...Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.status])), statusAfterDenials: statusAfter, thenValid: ok.status }
    for (const k of ['wrongSecret', 'wrongApplication', 'wrongDocumentType', 'spuriousRequestId', 'bearerTokenHeader', 'foreignOrigin', 'missingSecret']) {
      assert.equal(checks[k].status, 403, `${k} must be 403`)
    }
    assert.equal(checks.oversize.status, 413)
    assert.equal(checks.chunkedNoLength.status, 411)
    assert.equal(statusAfter, 'ready', 'rejected attempts do not consume the grant')
    assert.equal(ok.status, 201, 'the real uploader still succeeds afterwards')
  })

  await suite.test('B2-3 concurrency: five simultaneous valid uploads produce one document', async () => {
    const g = await officerGrant()
    const before = stored.length
    const replies = await Promise.all(Array.from({ length: 5 }, () => send(hdr(g, 'demo-case-3', 'supporting_document'), body)))
    await delay(200)
    const codes = replies.map(r => r.status)
    results.concurrent = { codes, storedCalls: stored.length - before }
    assert.equal(codes.filter(c => c === 201).length, 1, 'exactly one upload wins')
    assert.equal(stored.length - before, 1, 'storage callback invoked once')
  })

  await suite.test('B2-4 truncated body burns the grant; no document; retry denied', async () => {
    const g = await officerGrant()
    const before = stored.length
    const r = await sendShort(hdr(g, 'demo-case-3', 'supporting_document'), 40, Buffer.from('only ten b'))
    await eventually(() => grantRow(officer, g.grantId)?.status !== 'ready', 'grant claimed', 3000).catch(() => undefined)
    const status = grantRow(officer, g.grantId)?.status
    const retry = await send(hdr(g, 'demo-case-3', 'supporting_document'), Buffer.alloc(40, 2))
    results.truncated = { status: r.status, grantStatus: status, retry: retry.status, storedCalls: stored.length - before }
    assert.notEqual(r.status, '201')
    assert.equal(status, 'claimed', 'claim is single-use even when the transfer fails')
    assert.equal(retry.status, 403)
    assert.equal(stored.length - before, 0, 'nothing stored')
  })

  await suite.test('B2-5 revocation, expiry, and worker binding', async () => {
    const revoked = await officerGrant()
    await rejectsWith(borrowerB.client.reducers.revokeUpload({ grantId: revoked.grantId }), 'NOT_FOUND_OR_FORBIDDEN', 'another user revokes')
    await officer.client.reducers.revokeUpload({ grantId: revoked.grantId })
    await eventually(() => [...workerA.client.db.workerUploadGrants.iter()].find(r => r.id === revoked.grantId)?.status === 'revoked', 'revoked')
    const afterRevoke = await send(hdr(revoked, 'demo-case-3', 'supporting_document'), body)

    const short = await officerGrant('demo-case-3', 64, 1)
    await delay(2200)
    const afterExpiry = await send(hdr(short, 'demo-case-3', 'supporting_document'), body)
    await rejectsWith(workerA.client.reducers.claimUpload({ grantId: short.grantId, claimId: 'late', applicationId: 'demo-case-3', requestId: undefined,
      documentType: 'supporting_document', byteLength: body.length }), 'INVALID_STATE', 'expired grant claim')

    const forB = await officerGrant('demo-case-3', 64, undefined, 'worker-b')
    const wrongWorker = await send(hdr(forB, 'demo-case-3', 'supporting_document'), body) // server runs as worker A
    await rejectsWith(workerA.client.reducers.claimUpload({ grantId: forB.grantId, claimId: 'steal', applicationId: 'demo-case-3', requestId: undefined,
      documentType: 'supporting_document', byteLength: body.length }), 'NOT_FOUND_OR_FORBIDDEN', 'worker A claims worker B grant')

    const attached = await officerGrant()
    await send(hdr(attached, 'demo-case-3', 'supporting_document'), body)
    await eventually(() => grantRow(officer, attached.grantId)?.status === 'attached', 'attached')
    await rejectsWith(officer.client.reducers.revokeUpload({ grantId: attached.grantId }), 'INVALID_STATE', 'revoke after attach')
    results.lifecycle = { afterRevoke: afterRevoke.status, afterExpiry: afterExpiry.status, wrongWorker: wrongWorker.status }
    assert.deepEqual(results.lifecycle, { afterRevoke: 403, afterExpiry: 403, wrongWorker: 403 })
  })

  await suite.test('B2-6 reducer-level guards: claim/attach binding and grant parameters', async () => {
    const g = await officerGrant()
    await rejectsWith(workerA.client.reducers.attachDocument({ grantId: g.grantId, claimId: 'none', byteLength: 5, documentId: uid('noclaim'),
      replacesDocumentId: undefined, sha256: 'a'.repeat(64), displayFilename: 'x.txt', storageKey: uid('k1'), extractionStatus: 'unsupported',
      evidence: [] }), 'INVALID_STATE', 'attach without claim')
    await workerA.client.reducers.claimUpload({ grantId: g.grantId, claimId: 'c1', applicationId: 'demo-case-3', requestId: undefined,
      documentType: 'supporting_document', byteLength: 10 })
    await rejectsWith(workerA.client.reducers.claimUpload({ grantId: g.grantId, claimId: 'c2', applicationId: 'demo-case-3', requestId: undefined,
      documentType: 'supporting_document', byteLength: 10 }), 'INVALID_STATE', 'second claim')
    await rejectsWith(workerA.client.reducers.attachDocument({ grantId: g.grantId, claimId: 'c1', byteLength: 11, documentId: uid('badlen'),
      replacesDocumentId: undefined, sha256: 'a'.repeat(64), displayFilename: 'x.txt', storageKey: uid('k2'), extractionStatus: 'unsupported',
      evidence: [] }), 'INVALID_STATE', 'attach with different length')
    const base = { applicationId: 'demo-case-3', requestId: undefined, workerUserId: uid('worker-a'), documentType: 'supporting_document' }
    await rejectsWith(officer.client.reducers.authorizeUpload({ ...base, secretHash: 'not-hex', maxBytes: 10, ttlSeconds: undefined }), 'INVALID_INPUT', 'bad hash')
    await rejectsWith(officer.client.reducers.authorizeUpload({ ...base, secretHash: capability().secretHash, maxBytes: 10 * 1024 * 1024 + 1,
      ttlSeconds: undefined }), 'INVALID_INPUT', 'over 10 MiB')
    await rejectsWith(officer.client.reducers.authorizeUpload({ ...base, secretHash: capability().secretHash, maxBytes: 10, ttlSeconds: 301 }),
      'INVALID_INPUT', 'ttl over 300 s')
    const dup = capability().secretHash
    await officer.client.reducers.authorizeUpload({ ...base, secretHash: dup, maxBytes: 10, ttlSeconds: undefined })
    await rejectsWith(officer.client.reducers.authorizeUpload({ ...base, secretHash: dup, maxBytes: 10, ttlSeconds: undefined }), 'INVALID_INPUT', 'reused hash')
    await rejectsWith(officer.client.reducers.authorizeUpload({ ...base, secretHash: capability().secretHash, maxBytes: 10, ttlSeconds: undefined,
      workerUserId: uid('reviewer') }), 'NOT_FOUND_OR_FORBIDDEN', 'grant to a non-worker')
    assert.ok(![...borrowerA.client.db.myUploadGrants.iter()].some(x => x.id === g.grantId), 'grants are private to their uploader')
  })

  await suite.test('B2-7 borrower uploads only against their own sent request', async () => {
    const job = await h.request('demo-case-1', 'b2-conflict')
    const snap = await h.claim(job.id)
    await workerA.client.reducers.completeInvestigation({ jobId: job.id, claimEpoch: snap.claimEpoch, modelId: undefined, findings: [h.highConflict] })
    const finding = await eventually(() => [...officer.client.db.staffFindings.iter()].find(f => f.jobId === job.id), 'finding')
    const requestId = uid('b2-request')
    await officer.client.reducers.createClarificationDraft({ requestId, findingId: finding.id, template: 'collateral' })
    await officer.client.reducers.sendClarification({ requestId })
    await eventually(() => [...borrowerA.client.db.borrowerClarifications.iter()].find(r => r.id === requestId), 'borrower sees request')
    const base = { applicationId: 'demo-case-1', workerUserId: uid('worker-a'), maxBytes: 64, ttlSeconds: undefined }
    await rejectsWith(borrowerA.client.reducers.authorizeUpload({ ...base, secretHash: capability().secretHash, requestId: undefined,
      documentType: 'collateral_schedule' }), 'NOT_FOUND_OR_FORBIDDEN', 'borrower without request')
    await rejectsWith(borrowerA.client.reducers.authorizeUpload({ ...base, secretHash: capability().secretHash, requestId,
      documentType: 'supporting_document' }), 'NOT_FOUND_OR_FORBIDDEN', 'borrower with wrong document type')
    await rejectsWith(borrowerB.client.reducers.authorizeUpload({ ...base, secretHash: capability().secretHash, requestId,
      documentType: 'collateral_schedule' }), 'NOT_FOUND_OR_FORBIDDEN', 'other borrower on A request')
    const g = await authorizeGrant(borrowerA, { applicationId: 'demo-case-1', requestId, documentType: 'collateral_schedule',
      workerUserId: uid('worker-a'), maxBytes: 64 })
    await eventually(() => [...workerA.client.db.workerUploadGrants.iter()].find(r => r.id === g.grantId), 'grant reaches worker')
    const noRequestHeader = await send(hdr(g, 'demo-case-1', 'collateral_schedule'), body)
    const ok = await send(hdr(g, 'demo-case-1', 'collateral_schedule', { 'x-request-id': requestId }), body)
    await eventually(() => grantRow(borrowerA, g.grantId)?.status === 'attached', 'borrower grant attached')
    const docId = grantRow(borrowerA, g.grantId)!.attachedDocumentId!
    await borrowerA.client.reducers.submitBorrowerResponse({ requestId, message: 'Updated schedule attached.', documentIds: [docId] })
    const finalFinding = await eventually(() => [...officer.client.db.staffFindings.iter()].find(f => f.id === finding.id && f.status === 'awaiting_response'),
      'finding still awaiting human review')
    const preflight = await send({}, Buffer.alloc(0), { method: 'OPTIONS', chunked: true }).catch(() => ({ status: 'err', body: '' } as Reply))
    results.borrower = { noRequestHeader: noRequestHeader.status, upload: ok.status, findingStatus: finalFinding.status, preflightNoOrigin: preflight.status }
    assert.equal(noRequestHeader.status, 403)
    assert.equal(ok.status, 201)
  })

  await suite.test('B2-8 plaintext HTTP to the upload port is not served', async () => {
    const r = await new Promise<string>(res => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/documents/upload', method: 'POST', headers: { 'content-length': '3' } }, x => {
        res(String(x.statusCode)); x.resume()
      })
      req.on('error', e => res(`error:${(e as NodeJS.ErrnoException).code ?? 'unknown'}`))
      req.setTimeout(4000, () => req.destroy(new Error('timeout')))
      req.end('abc')
    })
    results.plaintext = r
    obs('B2', results)
    assert.ok(!/^2\d\d$/.test(r), `plaintext request must not succeed (got ${r})`)
  })
})
