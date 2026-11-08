import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { InvestigationSnapshotSchema, UserSchema, validateCheckResults } from '@loanwick/contracts';
import { checkCollateralConflicts, checkGroupThreshold, getPaymentVerificationState } from '@loanwick/analysis';

const findingKey = r => JSON.stringify([r.findingType, [...r.applicationIds].sort()]);
const comparable = r => ({ findingType: r.findingType, applicationIds: [...r.applicationIds].sort(), evidenceIds: [...r.evidenceIds].sort(), facts: r.facts });

export function evaluateFixtures(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const started = performance.now();
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const snapshot = InvestigationSnapshotSchema.parse(read('fixtures/applications/demo.json'));
  const manifest = read('fixtures/manifest.json');
  const expected = read('fixtures/expected-results/demo.json');
  assert.equal(manifest.synthetic, true);
  for (const user of manifest.identities) UserSchema.parse(user);
  assert.equal(new Set(manifest.identities.map(u => u.id)).size, manifest.identities.length);
  const sources = new Map();
  for (const doc of manifest.documents) {
    const path = resolve(root, doc.path), within = relative(root, path);
    assert.ok(!within.startsWith('..') && !isAbsolute(within), 'Source document escapes fixture root');
    const bytes = readFileSync(path), source = JSON.parse(bytes.toString('utf8'));
    assert.equal(source.label, 'SYNTHETIC DEMO DOCUMENT');
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, doc.sha256, `Manifest hash mismatch: ${doc.id}`);
    const metadata = snapshot.documents.find(d => d.id === doc.id);
    assert.ok(metadata, `Missing document metadata: ${doc.id}`);
    assert.equal(digest, metadata.sha256, `Document hash mismatch: ${doc.id}`);
    assert.ok(!sources.has(doc.id), 'Duplicate manifest document');
    sources.set(doc.id, { text: bytes.toString('utf8'), source });
  }
  assert.equal(sources.size, snapshot.documents.length, 'Every stored document needs a source');
  for (const evidence of snapshot.evidence) {
    const doc = sources.get(evidence.documentId);
    assert.ok(doc?.text.includes(evidence.excerpt), `Excerpt does not exist in source: ${evidence.id}`);
    assert.ok(evidence.locator?.startsWith('$.'), `Unsupported fixture locator: ${evidence.id}`);
    const value = evidence.locator.slice(2).split('.').reduce((object, part) => object?.[part], doc.source);
    assert.notEqual(value, undefined, `Locator does not exist: ${evidence.id}`);
    assert.equal(value === null ? null : String(value), evidence.extractedValue, `Value differs from source: ${evidence.id}`);
  }
  const expectedIds = expected.cases.map(c => c.applicationId);
  assert.equal(new Set(expectedIds).size, snapshot.applications.length, 'Expectations must cover every case once');
  assert.deepEqual([...expectedIds].sort(), snapshot.applications.map(a => a.id).sort());
  let found = 0, missing = 0, unexpected = 0, mismatches = 0;
  const details = [];
  const uniqueFindings = new Set();
  for (const scenario of expected.cases) {
    const current = { ...snapshot, applicationId: scenario.applicationId };
    const actual = validateCheckResults(current, [...checkCollateralConflicts(current), ...checkGroupThreshold(current)]);
    const expectedMap = new Map(scenario.findings.map(r => [findingKey(r), r]));
    assert.equal(expectedMap.size, scenario.findings.length, 'Duplicate expected finding');
    const actualMap = new Map(actual.map(r => [findingKey(r), r]));
    const errors = [];
    for (const [key, expectedFinding] of expectedMap) {
      const actualFinding = actualMap.get(key);
      if (!actualFinding) { missing++; errors.push(`Missing ${key}`); continue; }
      found++;
      try { assert.deepEqual(comparable(actualFinding), comparable(expectedFinding)); }
      catch { mismatches++; errors.push(`Evidence or quantitative facts mismatch: ${key}`); }
    }
    for (const [key, actualFinding] of actualMap) {
      uniqueFindings.add(actualFinding.deduplicationKey);
      if (!expectedMap.has(key)) { unexpected++; errors.push(`Unexpected ${key}`); }
    }
    details.push({ applicationId: scenario.applicationId, expected: scenario.findings.length, actual: actual.length, errors });
  }
  const payment = expected.paymentState;
  const app = snapshot.applications.find(a => a.id === payment.applicationId);
  assert.ok(app, 'Payment scenario case does not exist');
  const state = getPaymentVerificationState(app.paymentRevision, snapshot.reviews.filter(r => r.applicationId === app.id));
  assert.equal(state.status, payment.expected); assert.equal(state.currentRevision, payment.currentRevision); assert.equal(state.observedRevision, payment.observedRevision);
  return { synthetic: true, scope: 'Deterministic fixture evaluation only; not production fraud accuracy or live AI validation', passed: missing === 0 && unexpected === 0 && mismatches === 0,
    applications: snapshot.applications.length, sourceDocuments: sources.size, evidenceReferencesVerified: snapshot.evidence.length,
    expectedCaseFindingsFound: found, missing, unexpected, evidenceOrFactMismatches: mismatches, distinctConcerns: uniqueFindings.size,
    paymentVerification: state.status, elapsedMs: Math.round((performance.now() - started) * 100) / 100, cases: details };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = evaluateFixtures(); console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1;
  }
}
