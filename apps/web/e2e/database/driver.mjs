// Node-only test driver. Imports the owner's published analysis bridge from an
// isolated checkout; no worker code or credentials enter the frontend bundle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const source = process.env.LOANWICK_WEB_DATABASE_SOURCE;
const sessions = process.env.LOANWICK_WEB_DATABASE_SESSIONS;
assert.ok(source && sessions, 'Use the disposable database launcher');
const config = JSON.parse(readFileSync(sessions, 'utf8'));
const url = new URL(config.endpoint);
assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Loopback database required');
const load = path => import(pathToFileURL(join(source, path)).href);
const { DbConnection } = await load('spacetimedb/bindings/index.ts');
const clients = [];
const result = value => console.log('LOANWICK_TEST_RESULT:' + JSON.stringify(value));
async function eventually(read, label) {
  const deadline = Date.now() + 10_000;
  do { const value = read(); if (value !== undefined && value !== false) return value; await delay(20); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
function connect(id, tables) {
  const session = config.sessions.find(s => s.id === id); assert.ok(session);
  return new Promise((resolve, reject) => {
    let connection;
    const timer = setTimeout(() => { connection?.disconnect(); reject(new Error('Role subscription timed out')); }, 10_000);
    connection = DbConnection.builder().withUri(config.endpoint).withDatabaseName(config.database).withToken(session.token)
      .onConnect(client => client.subscriptionBuilder().onApplied(() => { clearTimeout(timer); resolve(client); })
        .onError(() => { clearTimeout(timer); reject(new Error('Role subscription rejected')); }).subscribe(tables.map(t => `SELECT * FROM ${t}`)))
      .onConnectError(() => { clearTimeout(timer); reject(new Error('Role connection failed')); }).build();
    clients.push(connection);
  });
}
const [action, applicationId] = process.argv.slice(2);
try {
  const officer = await connect('officer', ['staff_jobs', 'staff_findings', 'staff_documents', 'staff_evidence']);
  if (action === 'sources') {
    const finding = [...officer.db.staffFindings.iter()].find(f => f.applicationId === applicationId && f.isCurrent);
    assert.ok(finding, 'Current source-backed finding required');
    const evidence = [...officer.db.staffEvidence.iter()].filter(e => finding.evidenceIds.includes(e.id));
    const documents = [...officer.db.staffDocuments.iter()].filter(d => evidence.some(e => e.documentId === d.id));
    result(documents.map(d => ({ id: d.id, version: d.version, sha256: d.sha256, filename: d.displayFilename,
      excerpts: evidence.filter(e => e.documentId === d.id).map(e => ({ text: e.excerpt, locator: e.locator })) })));
  } else if (action === 'analyze' || action === 'fail-live') {
    const worker = await connect('worker', ['worker_snapshots', 'worker_job_outcomes']);
    let job;
    if (action === 'analyze') {
      const runKey = 'web-database-' + crypto.randomUUID();
      await officer.reducers.requestInvestigation({ applicationId, runKey, executionMode: 'fixture' });
      job = await eventually(() => [...officer.db.staffJobs.iter()].find(j => j.runKey === runKey), 'fixture job');
    } else {
      job = await eventually(() => [...officer.db.staffJobs.iter()].find(j => j.applicationId === applicationId && j.status === 'queued' && j.executionMode === 'live'), 'UI-created live job');
    }
    await worker.reducers.claimInvestigation({ jobId: job.id, leaseSeconds: 90 });
    const raw = await eventually(() => [...worker.db.workerSnapshots.iter()].find(s => s.id === job.id), 'claimed snapshot');
    if (action === 'fail-live') {
      await worker.reducers.failInvestigation({ jobId: job.id, claimEpoch: raw.claimEpoch, errorCode: 'MODEL_UNAVAILABLE' });
    } else {
      assert.equal(job.executionMode, 'fixture', 'Deterministic checks must never complete a live/model job');
      const { toAnalysisSnapshot, toDatabaseFindings } = await load('packages/database-adapter/dist/index.js');
      const { checkCollateralConflicts, checkGroupThreshold } = await load('packages/analysis/dist/index.js');
      const start = performance.now();
      const snapshot = toAnalysisSnapshot(raw, { assetTypeNamespace: 'legacy_equipment' });
      const findings = await toDatabaseFindings(snapshot, [...checkCollateralConflicts(snapshot), ...checkGroupThreshold(snapshot)]);
      await worker.reducers.recordToolEvent({ jobId: job.id, claimEpoch: raw.claimEpoch, sequence: 1,
        toolName: 'deterministic_browser_test_check', status: 'succeeded', inputSummary: 'Authorized database snapshot',
        outputSummary: `${findings.length} deterministic findings; no model invoked`, durationMs: Math.ceil(performance.now() - start) });
      await worker.reducers.completeInvestigation({ jobId: job.id, claimEpoch: raw.claimEpoch, findings });
    }
    const terminal = await eventually(() => [...worker.db.workerJobOutcomes.iter()].find(o => o.id === job.id), 'terminal outcome');
    assert.equal(terminal.status, action === 'analyze' ? 'succeeded' : 'failed');
    await eventually(() => [...officer.db.staffJobs.iter()].find(j => j.id === job.id && j.status === terminal.status), 'staff terminal projection');
    for (const id of terminal.acceptedFindingIds) await eventually(() => [...officer.db.staffFindings.iter()].find(f => f.id === id && f.jobId === job.id && f.isCurrent), 'staff current finding');
    result({ status: terminal.status, findings: terminal.acceptedFindingIds.length });
  } else {
    const reviewer = await connect('reviewer', ['staff_releases']);
    if (action === 'reject-release') {
      await assert.rejects(reviewer.reducers.simulateRelease({ applicationId, idempotencyKey: crypto.randomUUID() }), /STALE_REVIEW|INVESTIGATION_STALE|BLOCKING_FINDINGS|INVALID_STATE/);
      assert.equal([...reviewer.db.staffReleases.iter()].filter(r => r.applicationId === applicationId).length, 0);
      result({ rejected: true });
    } else if (action === 'retry-release') {
      const release = await eventually(() => [...reviewer.db.staffReleases.iter()].find(r => r.applicationId === applicationId), 'existing release');
      await reviewer.reducers.simulateRelease({ applicationId, idempotencyKey: release.idempotencyKey });
      await assert.rejects(reviewer.reducers.simulateRelease({ applicationId, idempotencyKey: crypto.randomUUID() }), /ALREADY_RELEASED/);
      assert.equal([...reviewer.db.staffReleases.iter()].filter(r => r.applicationId === applicationId).length, 1);
      result({ releases: 1 });
    } else throw new Error('Unknown database test action');
  }
} finally { clients.forEach(c => c.disconnect()); }
