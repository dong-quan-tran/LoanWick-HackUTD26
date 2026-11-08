import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { InvestigationSnapshotSchema, validateCheckResults } from '@loanwick/contracts';
import { captureSourceRevisions, checkCollateralConflicts, getChangedSourceIds } from '@loanwick/analysis';
import { application, fixture } from './helpers.js';

const temporaryRoots: string[] = [];
function isolatedFixtures(): string {
  const root = mkdtempSync(join(tmpdir(), 'loanwick-fixtures-'));
  temporaryRoots.push(root);
  cpSync(fileURLToPath(new URL('../fixtures/', import.meta.url)), join(root, 'fixtures'), { recursive: true });
  return root;
}
function evaluate(root: string): string {
  return execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { evaluateFixtures } from './scripts/evaluate.mjs'; console.log(JSON.stringify(evaluateFixtures(process.argv[1])))", root],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    const path = resolve(root);
    if (!path.startsWith(resolve(tmpdir()) + '/') && !path.startsWith(resolve(tmpdir()) + String.fromCharCode(92))) throw new Error('Cleanup escaped temp directory');
    if (!path.includes('loanwick-fixtures-')) throw new Error('Unexpected cleanup target');
    rmSync(path, { recursive: true, force: true });
  }
});

describe('changes while an investigation runs', () => {
  it('rejects prior results when the other borrower changes evidence', () => {
    const before = fixture();
    const findings = checkCollateralConflicts(before);
    const current = structuredClone(before);
    application(current, 'app-excavator-b').applicationRevision++;
    expect(() => validateCheckResults(current, findings)).toThrow('STALE_RESULTS');
    expect(getChangedSourceIds(captureSourceRevisions(before.applications), captureSourceRevisions(current.applications))).toEqual(['app-excavator-b']);
  });
  it('detects a new matching application after an initially negative check', () => {
    const before = fixture('app-similar-a');
    expect(checkCollateralConflicts(before)).toEqual([]);
    const current = structuredClone(before);
    const original = application(current);
    const id = 'app-new-matching';
    const oldDocument = current.documents.find(d => d.applicationId === original.id)!;
    current.applications.push({ ...original, id });
    current.documents.push({ ...oldDocument, id: 'doc-new-matching', applicationId: id });
    const originalClaim = current.collateral.find(c => c.applicationId === original.id)!;
    const references = new Set([...originalClaim.evidenceIds, ...originalClaim.ownershipEvidenceIds]);
    const mapping = new Map<string, string>();
    for (const evidence of before.evidence.filter(e => references.has(e.id))) {
      const evidenceId = 'new-' + evidence.id;
      mapping.set(evidence.id, evidenceId);
      current.evidence.push({ ...evidence, id: evidenceId, documentId: 'doc-new-matching', applicationId: id });
    }
    current.collateral.push({ ...originalClaim, id: 'asset-new-matching', applicationId: id,
      evidenceIds: originalClaim.evidenceIds.map(e => mapping.get(e)!), ownershipEvidenceIds: originalClaim.ownershipEvidenceIds.map(e => mapping.get(e)!) });
    InvestigationSnapshotSchema.parse(current);
    expect(checkCollateralConflicts(current)[0]?.applicationIds).toEqual(['app-new-matching', 'app-similar-a']);
    expect(getChangedSourceIds(captureSourceRevisions(before.applications), captureSourceRevisions(current.applications))).toEqual([id]);
  });
  it('rejects evidence whose source document has disappeared', () => {
    const s = fixture(); s.documents = s.documents.filter(d => d.id !== 'doc-excavator-b');
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
  });
});

describe('evaluation fails on damaged inputs', () => {
  it('fails if a source file no longer matches its recorded hash', () => {
    const root = isolatedFixtures();
    const path = join(root, 'fixtures/documents/excavator-b.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('ex-0042', 'EX-CHANGED'));
    expect(() => evaluate(root)).toThrow();
  });
  it('reports a wrong expected group total instead of passing it', () => {
    const root = isolatedFixtures();
    const path = join(root, 'fixtures/expected-results/demo.json');
    const expected = JSON.parse(readFileSync(path, 'utf8'));
    const group = expected.cases.find((c: { applicationId: string }) => c.applicationId === 'app-group-a');
    group.findings[0].facts.totalCents++;
    writeFileSync(path, JSON.stringify(expected));
    expect(JSON.parse(evaluate(root))).toMatchObject({ passed: false, evidenceOrFactMismatches: 1 });
  });
});
