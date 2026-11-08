import { describe, expect, it } from 'vitest';
import { checkCollateralConflicts } from '@loanwick/analysis';
import { toAnalysisSnapshot, toDatabaseFindings, toSafeCents } from '@loanwick/database-adapter';
import type { DatabaseWorkerSnapshot } from '@loanwick/database-adapter';
import { fixture } from '../../../tests/helpers.js';

function databaseSnapshot(): DatabaseWorkerSnapshot {
  const s = fixture(), ids = new Set(['app-excavator-a', 'app-excavator-b']);
  const apps = s.applications.filter(a => ids.has(a.id));
  const revisions = (a: typeof apps[number]) => ({ applicationRevision: a.applicationRevision, collateralRevision: a.collateralRevision, paymentRevision: a.paymentRevision });
  const timestamp = (value: string) => ({ toISOString: () => value });
  return { id: 'job-test', applicationId: s.applicationId, inputsCurrent: true, revisions: revisions(apps[0]!), sources: [{ applicationId: apps[1]!.id, revisions: revisions(apps[1]!) }],
    applications: apps.map(a => ({ id: a.id, businessName: a.businessName, amountCents: BigInt(a.amountCents), currency: a.currency, stage: a.stage, revisions: revisions(a) })),
    documents: s.documents.filter(d => ids.has(d.applicationId)).map(d => ({ ...d, extractionStatus: 'extracted', createdAt: timestamp(d.createdAt) })),
    evidence: s.evidence.filter(e => ids.has(e.applicationId)).map(e => ({ id: e.id, applicationId: e.applicationId, documentId: e.documentId, documentVersion: e.documentVersion,
      pageNumber: e.pageNumber ?? undefined, locator: e.locator ?? undefined, excerpt: e.excerpt, fieldName: e.fieldName === 'identifier' ? 'equipment_identifier' : e.fieldName ?? undefined,
      fieldValue: e.extractedValue ?? undefined, extractionMethod: e.extractionMethod, createdAt: timestamp(e.createdAt) })),
    collateral: s.collateral.filter(c => ids.has(c.applicationId)).map(c => ({ id: c.id, applicationId: c.applicationId, identifier: c.identifier!, description: c.description,
      exclusiveOwnershipClaim: c.exclusiveOwnershipClaim!, active: c.active, evidenceIds: [...c.evidenceIds, ...c.ownershipEvidenceIds] })), relationships: [] };
}
const options = { assetTypeNamespace: 'legacy_equipment' };
describe('database boundary', () => {
  it('converts money without rounding or accepting negative values', () => {
    expect(toSafeCents(0n)).toBe(0); expect(toSafeCents(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => toSafeCents(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow('safe integer');
    expect(() => toSafeCents(-1n)).toThrow('safe integer');
  });
  it('maps actual field aliases without inventing borrower metadata', () => {
    const s = toAnalysisSnapshot(databaseSnapshot(), options);
    expect('borrowerUserId' in s.applications[0]!).toBe(false);
    expect(s.evidence.find(e => e.id === 'ev-excavator-a-identifier')?.fieldName).toBe('identifier');
    expect(checkCollateralConflicts(s)[0]?.severity).toBe('high');
  });
  it('does not turn unrelated ownership evidence into support for a claim', () => {
    const raw = databaseSnapshot();
    raw.collateral = raw.collateral.map(c => ({ ...c, evidenceIds: c.evidenceIds.filter(id => !id.endsWith('-ownership')) }));
    expect(checkCollateralConflicts(toAnalysisSnapshot(raw, options))[0]?.evidenceState).toBe('unknown');
  });
  it('rejects stale inputs, changed source membership, and mismatched revisions', () => {
    const raw = databaseSnapshot(); raw.inputsCurrent = false;
    expect(() => toAnalysisSnapshot(raw, options)).toThrow('stale');
    raw.inputsCurrent = true; raw.sources = [];
    expect(() => toAnalysisSnapshot(raw, options)).toThrow('membership');
    const changed = databaseSnapshot(); changed.sources[0]!.revisions.applicationRevision++;
    expect(() => toAnalysisSnapshot(changed, options)).toThrow('revisions');
  });
  it('rejects an unspecified asset namespace and unknown extraction status', () => {
    expect(() => toAnalysisSnapshot(databaseSnapshot(), { assetTypeNamespace: '' })).toThrow('namespace');
    const raw = databaseSnapshot(); raw.documents = raw.documents.map(d => ({ ...d, extractionStatus: 'pretend-success' }));
    expect(() => toAnalysisSnapshot(raw, options)).toThrow();
  });
  it('does not accept a candidate as a server-confirmed relationship', () => {
    const raw = databaseSnapshot(); raw.relationships = [{ id: 'link', leftApplicationId: raw.applicationId, rightApplicationId: 'app-excavator-b', decision: 'candidate', evidenceIds: ['ev-excavator-a-identifier'] }];
    expect(() => toAnalysisSnapshot(raw, options)).toThrow();
  });
  it('bounds long deduplication keys without dropping source IDs', async () => {
    const s = toAnalysisSnapshot(databaseSnapshot(), options), findings = checkCollateralConflicts(s);
    findings[0]!.deduplicationKey = 'a'.repeat(500);
    const first = await toDatabaseFindings(s, findings), second = await toDatabaseFindings(s, findings);
    expect(first).toEqual(second); expect(first[0]!.deduplicationKey).toHaveLength(73);
    expect(first[0]!.relatedApplicationIds).toEqual(['app-excavator-b']);
    expect(first[0]!.evidenceIds).toEqual(findings[0]!.evidenceIds);
  });
  it('rejects text that the database cannot store rather than silently truncating it', async () => {
    const s = toAnalysisSnapshot(databaseSnapshot(), options), findings = checkCollateralConflicts(s);
    findings[0]!.title = 'x'.repeat(141);
    await expect(toDatabaseFindings(s, findings)).rejects.toThrow('write limit');
  });
});
