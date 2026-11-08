import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { DbConnection } from '../../spacetimedb/bindings/index.ts';
import { createUploadCapability } from '../../spacetimedb/transport/capability.ts';
import { startUploadTestServer } from '../../spacetimedb/tests/upload-https.ts';
import { AnalysisSnapshotSchema } from '@loanwick/contracts';
import { checkCollateralConflicts, checkGroupThreshold } from '@loanwick/analysis';
import { toAnalysisSnapshot, toDatabaseFindings } from '@loanwick/database-adapter';

interface Session { id: string; token: string }
interface Configuration { endpoint: string; database: string; sessions: Session[] }
async function eventually<T>(read: () => T | undefined | false, label: string): Promise<T> {
  const deadline = Date.now() + 5000;
  do { const value = read(); if (value !== undefined && value !== false) return value; await delay(15); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}

test('shared analysis against a real database', { timeout: 60_000 }, async suite => {
  assert.ok(process.env.LOANWICK_BRIDGE_SESSIONS, 'Run npm run test:database with the local server ready');
  const config = JSON.parse(readFileSync(process.env.LOANWICK_BRIDGE_SESSIONS, 'utf8')) as Configuration;
  const endpoint = new URL(config.endpoint);
  assert.ok(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname), 'Integration tests require a loopback server');
  const clients: DbConnection[] = [];
  suite.after(() => clients.forEach(c => c.disconnect()));
  function connect(id: string, views: string[]) {
    const session = config.sessions.find(s => s.id === id); assert.ok(session);
    return new Promise<DbConnection>((resolve, reject) => {
      const connection = DbConnection.builder().withUri(config.endpoint).withDatabaseName(config.database).withToken(session.token)
        .onConnect(client => client.subscriptionBuilder().onApplied(() => resolve(client)).onError(ctx => reject(ctx.event)).subscribe(views.map(view => `SELECT * FROM ${view}`)))
        .onConnectError((_ctx, error) => reject(error)).build();
      clients.push(connection);
    });
  }
  const [officer, reviewer, worker] = await Promise.all([
    connect('officer', ['staff_applications', 'staff_jobs', 'staff_findings', 'staff_documents', 'staff_evidence', 'staff_readiness', 'staff_match_candidates', 'my_upload_grants']),
    connect('reviewer', ['staff_applications', 'staff_readiness']),
    connect('worker', ['worker_snapshots', 'worker_job_outcomes', 'worker_upload_grants']),
  ]);
  const app = (id: string) => [...officer.db.staffApplications.iter()].find(a => a.id === id);
  const outcome = (id: string) => [...worker.db.workerJobOutcomes.iter()].find(j => j.id === id);
  async function claim(applicationId: string, runKey: string) {
    await officer.reducers.requestInvestigation({ applicationId, runKey, executionMode: 'fixture' });
    const job = await eventually(() => [...officer.db.staffJobs.iter()].find(j => j.runKey === runKey), 'queued job');
    await worker.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 });
    const raw = await eventually(() => [...worker.db.workerSnapshots.iter()].find(s => s.id === job.id), 'claimed snapshot');
    const snapshot = toAnalysisSnapshot(raw, { assetTypeNamespace: 'legacy_equipment' });
    return { raw, snapshot };
  }
  async function finish(claimed: Awaited<ReturnType<typeof claim>>, results: ReturnType<typeof checkCollateralConflicts>) {
    const findings = await toDatabaseFindings(claimed.snapshot, results);
    await worker.reducers.completeInvestigation({ jobId: claimed.raw.id, claimEpoch: claimed.raw.claimEpoch, findings });
    const terminal = await eventually(() => outcome(claimed.raw.id), 'terminal outcome');
    if (terminal.status === 'succeeded') {
      for (const id of terminal.acceptedFindingIds) {
        await eventually(() => [...officer.db.staffFindings.iter()].find(f => f.id === id && f.jobId === claimed.raw.id && f.isCurrent), 'officer sees the accepted finding revision');
      }
    }
    return terminal;
  }
  const storage = mkdtempSync(join(tmpdir(), 'loanwick-bridge-bytes-'));
  const staged: string[] = [];
  suite.after(() => { for (const path of staged) unlinkSync(path); rmdirSync(storage); });
  async function attach(applicationId: string, suffix: string, type: string, values: Record<string, string | number | boolean>, replacesDocumentId?: string) {
    const bytes = Buffer.from(JSON.stringify({ label: 'SYNTHETIC DEMO DOCUMENT', ...values }, null, 2));
    let extractedIds: string[] = [], storedPath: string | undefined;
    const send = await startUploadTestServer(suite, worker, async input => {
      assert.equal(input.applicationId, applicationId); assert.equal(input.documentType, type);
      assert.deepEqual(input.bytes, bytes); assert.equal(input.sha256, createHash('sha256').update(bytes).digest('hex'));
      const parsed = JSON.parse(input.bytes.toString('utf8')) as Record<string, unknown>;
      assert.equal(parsed.label, 'SYNTHETIC DEMO DOCUMENT'); delete parsed.label;
      assert.deepEqual(parsed, values);
      const evidence = Object.entries(parsed).map(([fieldName, value]) => ({ id: 'analysis-' + suffix + '-' + fieldName,
        excerpt: JSON.stringify(fieldName) + ': ' + JSON.stringify(value), fieldName, fieldValue: String(value), extractionMethod: 'structured', pageNumber: undefined, locator: '$.' + fieldName }));
      extractedIds = evidence.map(e => e.id);
      storedPath = join(storage, input.documentId + '.json');
      writeFileSync(storedPath, input.bytes, { flag: 'wx', mode: 0o600 }); staged.push(storedPath);
      return { replacesDocumentId, displayFilename: suffix + '.json', storageKey: 'analysis-storage-' + suffix, extractionStatus: 'extracted', evidence };
    });
    const capability = await createUploadCapability();
    await officer.reducers.authorizeUpload({ secretHash: capability.secretHash, applicationId, documentType: type, workerUserId: 'worker', maxBytes: bytes.length });
    const grant = await eventually(() => [...officer.db.myUploadGrants.iter()].find(g => g.secretHash === capability.secretHash), 'uploader grant');
    await eventually(() => [...worker.db.workerUploadGrants.iter()].find(g => g.id === grant.id && g.status === 'ready'), 'worker grant');
    const headers = { 'X-Upload-Grant': grant.id, 'X-Upload-Secret': capability.secret, 'X-Application-Id': applicationId, 'X-Document-Type': type, Origin: 'https://loanwick.test' };
    const uploaded = await send(headers, bytes);
    assert.equal(uploaded.status, 201); assert.equal(uploaded.continued, true);
    const documentId = (JSON.parse(uploaded.body) as { documentId: string }).documentId;
    const document = await eventually(() => [...officer.db.staffDocuments.iter()].find(d => d.id === documentId), 'HTTPS document');
    assert.ok(storedPath); assert.deepEqual(readFileSync(storedPath), bytes);
    assert.equal(document.sha256, createHash('sha256').update(readFileSync(storedPath)).digest('hex'));
    assert.equal((await send(headers, bytes)).status, 403, 'Upload capability must not be replayed');
    return extractedIds;
  }
  let acceptedHigh: string;
  let acceptedGroup: string;
  await suite.test('every seeded document hash and evidence excerpt matches a canonical source', async () => {
    const manifest = JSON.parse(readFileSync(new URL('../../fixtures/database/manifest.json', import.meta.url), 'utf8')) as { cases: { number: number; sourcePath: string; paymentSourcePath: string }[]; untrustedPath: string };
    const documents = await eventually(() => { const rows = [...officer.db.staffDocuments.iter()]; return rows.length === 17 ? rows : undefined; }, 'all seed documents');
    const sources = new Map<string, string>();
    for (const entry of manifest.cases) {
      sources.set(`demo-doc-${entry.number}`, readFileSync(new URL('../../' + entry.sourcePath, import.meta.url), 'utf8'));
      sources.set(`demo-payment-doc-${entry.number}`, readFileSync(new URL('../../' + entry.paymentSourcePath, import.meta.url), 'utf8'));
    }
    sources.set('demo-doc-untrusted-text', readFileSync(new URL('../../' + manifest.untrustedPath, import.meta.url), 'utf8'));
    for (const document of documents) {
      const source = sources.get(document.id); assert.ok(source, 'Canonical source exists');
      assert.equal(document.sha256, createHash('sha256').update(source).digest('hex'));
      assert.match(source, /SYNTHETIC DEMO DOCUMENT/);
    }
    const evidence = [...officer.db.staffEvidence.iter()];
    assert.equal(evidence.length, 23);
    for (const item of evidence) {
      const source = sources.get(item.documentId); assert.ok(source, `Source document ${item.id}`); assert.ok(source.includes(item.excerpt), `Source excerpt ${item.id}`);
      assert.equal(item.pageNumber, undefined);
      assert.match(item.locator ?? '', /^line [1-9][0-9]*$/);
      const line = source.split('\n')[Number(item.locator!.slice(5)) - 1];
      assert.ok(line?.includes(item.excerpt), `Source locator ${item.id}`);
      if (item.fieldName === 'exclusiveOwnershipClaim') { assert.equal(item.fieldValue, 'true'); assert.match(item.excerpt, /claims exclusive ownership/); }
      if (item.fieldName === 'amountCents' || item.fieldName === 'currency') assert.ok(item.excerpt.includes(item.fieldValue!));
    }
  });
  await suite.test('fresh seed produces a supported ownership conflict without extra uploads', async () => {
    const claimed = await claim('demo-case-1', 'analysis-seed');
    AnalysisSnapshotSchema.parse(claimed.snapshot);
    assert.equal('borrowerUserId' in claimed.snapshot.applications[0], false);
    const findings = checkCollateralConflicts(claimed.snapshot);
    assert.equal(findings.length, 1); assert.equal(findings[0].evidenceState, 'contradicted'); assert.equal(findings[0].severity, 'high');
    const terminal = await finish(claimed, findings);
    assert.equal(terminal.status, 'succeeded'); assert.equal(terminal.acceptedFindingIds.length, 1);
    acceptedHigh = terminal.acceptedFindingIds[0];
  });
  await suite.test('real ownership evidence produces a stored high conflict through the shared check', async () => {
    for (const n of [1, 2]) {
      const id = `demo-case-${n}`, before = app(id)!.collateralRevision;
      const evidenceIds = await attach(id, `ownership-${n}`, 'collateral_schedule', { identifier: 'FL-004821', exclusiveOwnershipClaim: true }, `demo-doc-${n}`);
      const updated = await eventually(() => { const a = app(id); return a && a.collateralRevision > before ? a : undefined; }, 'new collateral revision');
      await officer.reducers.recordCollateralClaim({ id: `demo-collateral-${n}`, applicationId: id, expectedCollateralRevision: updated.collateralRevision,
        identifier: 'FL-004821', normalizedIdentifier: 'FL-004821', description: 'Synthetic forklift', active: true, exclusiveOwnershipClaim: true, evidenceIds });
    }
    const claimed = await claim('demo-case-1', 'analysis-supported');
    const findings = checkCollateralConflicts(claimed.snapshot);
    assert.equal(findings.length, 1); assert.equal(findings[0].severity, 'high'); assert.equal(findings[0].evidenceIds.length, 4);
    const terminal = await finish(claimed, findings); assert.equal(terminal.status, 'succeeded');
    assert.deepEqual(terminal.acceptedFindingIds, [acceptedHigh]);
    const stored = await eventually(() => [...officer.db.staffFindings.iter()].find(f => f.id === acceptedHigh), 'persisted high finding');
    assert.equal(stored.type, 'collateral_conflict'); assert.equal(stored.isCurrent, true);
    assert.deepEqual([...stored.evidenceIds].sort(), [...findings[0].evidenceIds].sort());
  });
  await suite.test('a repeated real check refreshes the same finding instead of duplicating it', async () => {
    const claimed = await claim('demo-case-1', 'analysis-repeat');
    const terminal = await finish(claimed, checkCollateralConflicts(claimed.snapshot));
    assert.equal(terminal.status, 'succeeded'); assert.deepEqual(terminal.acceptedFindingIds, [acceptedHigh]);
    assert.equal([...officer.db.staffFindings.iter()].filter(f => f.type === 'collateral_conflict').length, 1);
  });
  await suite.test('related-case changes reject completion even when the reducer resolves', async () => {
    const claimed = await claim('demo-case-1', 'analysis-stale');
    const findings = checkCollateralConflicts(claimed.snapshot);
    const related = await eventually(() => { const a = app('demo-case-2'); return a; }, 'related case');
    await reviewer.reducers.changePaymentInstructions({ applicationId: related.id, expectedPaymentRevision: related.paymentRevision,
      syntheticAccountToken: 'demo_account_2', maskedDisplay: '**** 2026', beneficiaryName: 'Synthetic updated beneficiary', evidenceIds: ['demo-payment-evidence-2'] });
    const terminal = await finish(claimed, findings);
    assert.equal(terminal.status, 'failed'); assert.equal(terminal.errorCode, 'STALE_RESULTS'); assert.deepEqual(terminal.acceptedFindingIds, []);
    const current = [...worker.db.workerSnapshots.iter()].find(s => s.id === claimed.raw.id);
    if (current) assert.throws(() => toAnalysisSnapshot(current, { assetTypeNamespace: 'legacy_equipment' }), /stale/);
    assert.equal([...officer.db.staffFindings.iter()].filter(f => f.type === 'collateral_conflict').length, 1);
  });
  await suite.test('fresh seed produces the confirmed-group finding without extra uploads', async () => {
    const claimed = await claim('demo-case-5', 'analysis-group-seeded');
    const findings = checkGroupThreshold(claimed.snapshot);
    assert.equal(findings.length, 1); assert.equal(findings[0].facts.totalCents, 115_000_000);
    const terminal = await finish(claimed, findings);
    assert.equal(terminal.status, 'succeeded'); assert.equal(terminal.acceptedFindingIds.length, 1);
    acceptedGroup = terminal.acceptedFindingIds[0];
  });
  await suite.test('authorized amount evidence enables a real stored confirmed-group finding', async () => {
    for (const n of [5, 6]) {
      const id = `demo-case-${n}`;
      const evidenceIds = await attach(id, `group-${n}`, 'supporting_document', { amountCents: Number(app(id)!.amountCents), currency: 'USD', confirmedGroup: 'SYNTH-CEDAR' });
      await officer.reducers.recordEntity({ id: `analysis-entity-${n}`, applicationId: id, name: `Synthetic group ${n}`, normalizedName: `synthetic group ${n}`, evidenceIds });
    }
    await officer.reducers.createMatchCandidate({ id: 'analysis-group-link', leftEntityId: 'analysis-entity-5', rightEntityId: 'analysis-entity-6', matchedAttributes: ['shared_parent'], similarityScore: 10000 });
    await reviewer.reducers.reviewMatchCandidate({ candidateId: 'analysis-group-link', decision: 'confirmed_related', rationale: 'Reviewed synthetic common ownership and request amounts' });
    const claimed = await claim('demo-case-5', 'analysis-group-supported');
    const findings = checkGroupThreshold(claimed.snapshot);
    assert.equal(findings.length, 1); assert.equal(findings[0].facts.totalCents, 115_000_000);
    const terminal = await finish(claimed, findings); assert.equal(terminal.status, 'succeeded'); assert.equal(terminal.acceptedFindingIds.length, 1);
    assert.deepEqual(terminal.acceptedFindingIds, [acceptedGroup]);
    const stored = await eventually(() => [...officer.db.staffFindings.iter()].find(f => f.id === terminal.acceptedFindingIds[0]), 'group finding');
    assert.equal(stored.type, 'group_review_required'); assert.match(stored.explanation, /115000000/);
  });
  await suite.test('shared office addresses produce no concern through the real worker scope', async () => {
    const claimed = await claim('demo-case-3', 'analysis-negative');
    const findings = [...checkCollateralConflicts(claimed.snapshot), ...checkGroupThreshold(claimed.snapshot)];
    assert.deepEqual(findings, []); assert.equal((await finish(claimed, findings)).status, 'succeeded');
  });
});
