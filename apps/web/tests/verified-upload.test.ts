import { describe, expect, test } from 'vitest';
import { StaffCaseViewSchema } from '@loanwick/contracts';
import type { BorrowerCaseView, PortfolioItem, StaffCaseView } from '@loanwick/contracts/domain';
import { FixtureAdapter } from '../src/adapters/fixture';
import { summarizePortfolio } from '../src/portfolio';

const fileSha256 = `ab12cd34ef56${'0'.repeat(52)}`;
const applicationId = 'upload-ab12cd34ef56';
const createdAt = '2026-11-08T00:00:00.000Z';
const loanEvidence = (n: number, name: string) => {
  const base = { applicationId: `demo-case-${n}`, documentId: `doc-demo-case-${n}`, documentVersion: 1, pageNumber: null, locator: 'line 1', excerpt: `${name} claims exclusive ownership of forklift FL-004821.`, extractionMethod: 'fixture', createdAt };
  return [{ ...base, id: `ev-demo-case-${n}-identifier`, fieldName: 'identifier', extractedValue: 'FL-004821' }, { ...base, id: `ev-demo-case-${n}-ownership`, fieldName: 'exclusiveOwnershipClaim', extractedValue: 'true' }];
};
const ownEvidence = [
  { id: `ev-${applicationId}-2`, applicationId, documentId: `doc-${applicationId}`, documentVersion: 1, pageNumber: 1, locator: 'page 1 line 6', excerpt: 'Equipment: forklift FL-004821', fieldName: 'identifier', extractedValue: 'FL-004821', extractionMethod: 'pdf_text', createdAt },
  { id: `ev-${applicationId}-3`, applicationId, documentId: `doc-${applicationId}`, documentVersion: 1, pageNumber: 1, locator: 'page 1 line 7', excerpt: 'Borrower is the sole owner of the equipment.', fieldName: 'exclusiveOwnershipClaim', extractedValue: 'true', extractionMethod: 'pdf_text', createdAt },
];
const evidence = [...ownEvidence, ...loanEvidence(1, 'Northline Foods'), ...loanEvidence(2, 'Pineworks Supply')];
const response = {
  source: 'uploaded-contract', filename: 'northwind-contract.pdf',
  extracted: { businessName: 'Northwind Demo Logistics', amountCents: 9_500_000, currency: 'USD', identifier: 'FL-004821', exclusiveOwnershipClaim: true },
  comparedWith: Array.from({ length: 8 }, (_, index) => ({ id: `demo-case-${index + 1}`, businessName: `Demo loan ${index + 1}` })),
  applicationId, executionMode: 'live', model: 'synthetic-model',
  tools: [{ name: 'get_application_evidence', status: 'succeeded' }, { name: 'run_collateral_check', status: 'succeeded' }],
  assistantSummary: 'The forklift is also claimed by two loans on file.',
  findings: [{
    id: `analysis-${'f'.repeat(64)}`, type: 'collateral_conflict', findingType: 'collateral_conflict', severity: 'high',
    title: 'Equipment is claimed by more than one application', explanation: 'Three applications claim sole ownership of FL-004821.',
    uncertainty: 'This may be a typo or an outdated schedule.', suggestedNextStep: 'Ask for proof of ownership.',
    applicationIds: [applicationId, 'demo-case-1', 'demo-case-2'], relatedApplicationIds: ['demo-case-1', 'demo-case-2'], relatedBusinessNames: ['Northline Foods', 'Pineworks Supply'],
    evidenceIds: evidence.map(item => item.id), facts: { normalizedIdentifier: 'FL-004821', assetType: 'equipment' },
  }],
  case: {
    application: { id: applicationId, businessName: 'Northwind Demo Logistics' },
    relatedApplications: [{ id: 'demo-case-1', businessName: 'Northline Foods', amountCents: 15_100_000, currency: 'USD' }, { id: 'demo-case-2', businessName: 'Pineworks Supply', amountCents: 15_200_000, currency: 'USD' }],
    evidence,
    documents: [
      { id: `doc-${applicationId}`, applicationId, displayFilename: 'northwind-contract.pdf', version: 1 },
      { id: 'doc-demo-case-1', applicationId: 'demo-case-1', displayFilename: 'application-1.txt', version: 1 },
      { id: 'doc-demo-case-2', applicationId: 'demo-case-2', displayFilename: 'application-2.txt', version: 1 },
    ],
  },
};
function memoryStorage() {
  let raw: string | null = null;
  return { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; }, removeItem: () => { raw = null; } };
}
function portfolio(adapter: FixtureAdapter): PortfolioItem[] { let result!: PortfolioItem[]; adapter.subscribePortfolio(v => { result = v; }, e => { throw Error(e.message); })(); return result; }
function staff(adapter: FixtureAdapter, id = applicationId): StaffCaseView { let result!: StaffCaseView; adapter.subscribeCase(id, v => { result = v; }, e => { throw Error(e.message); })(); return result; }
async function add(adapter: FixtureAdapter, body: unknown = response, sha = fileSha256) { const result = await adapter.addVerifiedUpload(body, sha); if (!result.ok) throw Error(result.error.message); return result.value; }

describe('verified contract uploads', () => {
  test('appear on Applications as a reviewing case with open concerns and a succeeded investigation', async () => {
    const adapter = new FixtureAdapter(); const before = summarizePortfolio(portfolio(adapter));
    expect(before.count).toBe(18);
    expect(await add(adapter)).toEqual({ applicationId });
    const items = portfolio(adapter); const item = items.find(i => i.application.id === applicationId)!;
    expect(items).toHaveLength(19);
    expect(item.application).toMatchObject({ businessName: 'Northwind Demo Logistics', amountCents: 9_500_000, currency: 'USD', stage: 'reviewing' });
    expect(item.openFindingCount).toBe(1); expect(item.lastInvestigationStatus).toBe('succeeded');
    const after = summarizePortfolio(items);
    expect(after.openConcerns).toBe(before.openConcerns + 1); expect(after.flaggedApplications).toBe(before.flaggedApplications + 1); expect(after.investigated).toBe(before.investigated + 1);
  });
  test('opens in the case workspace with its finding, evidence, documents, related loans, and activity', async () => {
    const adapter = new FixtureAdapter(); await add(adapter); const view = staff(adapter);
    expect(StaffCaseViewSchema.safeParse(view).success).toBe(true);
    expect(view.findings).toHaveLength(1);
    expect(view.findings[0]).toMatchObject({ status: 'open', severity: 'high', evidenceState: 'contradicted', investigationJobId: view.investigations[0]!.id, facts: { normalizedIdentifier: 'FL-004821' } });
    expect(view.findingCurrentness?.[view.findings[0]!.id]).toBe(true);
    expect(view.investigations).toHaveLength(1);
    expect(view.investigations[0]).toMatchObject({ status: 'succeeded', executionMode: 'live', modelId: 'synthetic-model' });
    expect(view.toolEvents.map(e => e.toolName)).toEqual(['get_application_evidence', 'run_collateral_check', 'compareUploadedContract']);
    expect(view.readiness.reasons.map(r => r.code)).not.toEqual(expect.arrayContaining(['INVESTIGATION_MISSING', 'INVESTIGATION_STALE']));
    expect(view.relatedApplications?.map(a => a.businessName)).toEqual(['Northline Foods', 'Pineworks Supply']);
    expect(view.findings[0]!.evidenceIds.every(id => view.evidence.some(e => e.id === id))).toBe(true);
    expect(view.documents.map(d => d.displayFilename).sort()).toEqual(['application-1.txt', 'application-2.txt', 'northwind-contract.pdf']);
    expect(view.documents.find(d => d.applicationId === applicationId)?.sha256).toBe(fileSha256);
    expect(view.collateral).toEqual([expect.objectContaining({ identifier: 'FL-004821', exclusiveOwnershipClaim: true, active: true })]);
    expect(view.auditEvents.map(e => e.action)).toEqual(['contract_verified']);
    expect(await adapter.source('doc-demo-case-1', 1)).toContain('Northline Foods claims exclusive ownership of forklift FL-004821.');
    await expect(adapter.source(`doc-${applicationId}`, 1)).rejects.toThrow('does not keep the uploaded file');
  });
  test('replaces the same upload instead of duplicating it', async () => {
    const adapter = new FixtureAdapter(); await add(adapter);
    await add(adapter, { ...response, extracted: { ...response.extracted, amountCents: 9_900_000 } });
    const items = portfolio(adapter);
    expect(items).toHaveLength(19); expect(items.find(i => i.application.id === applicationId)?.application.amountCents).toBe(9_900_000);
    const view = staff(adapter);
    expect(view.findings).toHaveLength(1); expect(view.investigations).toHaveLength(1); expect(view.toolEvents).toHaveLength(3); expect(view.documents).toHaveLength(3);
  });
  test('survives a reload of saved demo state and is removed by reset', async () => {
    const storage = memoryStorage(); const adapter = new FixtureAdapter(storage); await add(adapter);
    const restored = new FixtureAdapter(storage);
    expect(restored.startupNotice).toBeUndefined(); expect(portfolio(restored)).toHaveLength(19); expect(staff(restored).findings).toHaveLength(1);
    restored.reset();
    expect(portfolio(restored)).toHaveLength(18);
    let code = ''; restored.subscribeCase(applicationId, () => { throw Error('Reset kept the upload'); }, e => { code = e.code; })();
    expect(code).toBe('NOT_FOUND_OR_FORBIDDEN');
    expect(portfolio(new FixtureAdapter(storage))).toHaveLength(18);
  });
  test('reports no concerns as a reviewing case with zero open findings', async () => {
    const adapter = new FixtureAdapter();
    await add(adapter, { ...response, findings: [], case: { ...response.case, relatedApplications: [], evidence: [], documents: [] } });
    const item = portfolio(adapter).find(i => i.application.id === applicationId)!;
    expect(item.openFindingCount).toBe(0); expect(item.lastInvestigationStatus).toBe('succeeded');
    expect(staff(adapter).documents.map(d => d.displayFilename)).toEqual(['northwind-contract.pdf']);
  });
  test('rejects a mismatched file, a malformed result, and non-officers without changing Applications', async () => {
    const adapter = new FixtureAdapter();
    expect((await adapter.addVerifiedUpload(response, `ffffffffffff${'0'.repeat(52)}`)).ok).toBe(false);
    expect((await adapter.addVerifiedUpload({ ...response, findings: 'none' }, fileSha256)).ok).toBe(false);
    adapter.selectIdentity('reviewer', 'app-excavator-a');
    expect((await adapter.addVerifiedUpload(response, fileSha256)).ok).toBe(false);
    adapter.selectIdentity('officer', 'app-excavator-a');
    expect(portfolio(adapter)).toHaveLength(18);
  });
  test('switches to a synthetic borrower for the uploaded case', async () => {
    const adapter = new FixtureAdapter(); await add(adapter);
    adapter.selectIdentity('borrower', applicationId);
    let view!: BorrowerCaseView; adapter.subscribeBorrowerCase(applicationId, v => { view = v; }, e => { throw Error(e.message); })();
    expect(view.application).toMatchObject({ id: applicationId, stage: 'reviewing' }); expect(view.requests).toHaveLength(0);
  });
});
