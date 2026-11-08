import { describe, expect, test } from 'vitest';
import { normalizeIdentifier } from '@loanwick/analysis';
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
const shaFor = (n: number) => `${n.toString(16).padStart(12, '0')}${'ab'.repeat(26)}`;
const ACTIVE_CLAIM_STAGES = new Set(['submitted', 'reviewing', 'clarification_needed', 'ready_for_release']);
const listBusinesses = (names: Iterable<string>) => {
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  if (unique.length < 2) return unique[0] ?? '';
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
};
function uploadBody(sha: string, businessName: string, identifier: string, exclusiveOwnershipClaim = true) {
  const id = `upload-${sha.slice(0, 12)}`;
  const own = [
    { id: `ev-${id}-identifier`, applicationId: id, documentId: `doc-${id}`, documentVersion: 1, pageNumber: 1, locator: 'page 1 line 6', excerpt: `Equipment: ${identifier}`, fieldName: 'identifier', extractedValue: identifier, extractionMethod: 'pdf_text' as const, createdAt },
    { id: `ev-${id}-ownership`, applicationId: id, documentId: `doc-${id}`, documentVersion: 1, pageNumber: 1, locator: 'page 1 line 7', excerpt: 'Borrower is the sole owner of the equipment.', fieldName: 'exclusiveOwnershipClaim', extractedValue: String(exclusiveOwnershipClaim), extractionMethod: 'pdf_text' as const, createdAt },
  ];
  return {
    ...response, filename: 'uploaded-contract.pdf', applicationId: id, findings: [],
    extracted: { businessName, amountCents: 9_500_000, currency: 'USD', identifier, exclusiveOwnershipClaim },
    case: { application: { id, businessName }, relatedApplications: [], evidence: own, documents: [{ id: `doc-${id}`, applicationId: id, displayFilename: 'uploaded-contract.pdf', version: 1 }] },
  };
}
function exclusiveClaims(adapter: FixtureAdapter) {
  const claims = new Map<string, Set<string>>();
  for (const item of portfolio(adapter)) {
    if (!ACTIVE_CLAIM_STAGES.has(item.application.stage)) continue;
    for (const claim of staff(adapter, item.application.id).collateral) {
      if (!claim.active || claim.exclusiveOwnershipClaim !== true) continue;
      const normalized = normalizeIdentifier(claim.identifier);
      if (normalized.state !== 'valid') continue;
      const names = claims.get(normalized.normalized) ?? new Set<string>();
      names.add(item.application.businessName);
      claims.set(normalized.normalized, names);
    }
  }
  return claims;
}

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
  test('rejects a second submission of the same file and leaves the original application unchanged', async () => {
    const adapter = new FixtureAdapter(); await add(adapter);
    const before = structuredClone(portfolio(adapter).map(item => item.application));
    const again = await adapter.addVerifiedUpload({
      ...response,
      extracted: { ...response.extracted, amountCents: 9_900_000, businessName: 'Someone Else' },
      case: { ...response.case, application: { ...response.case.application, businessName: 'Someone Else' } },
    }, fileSha256);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toBe('Submission failed due to this contract already being submitted as Northwind Demo Logistics.');
    const items = portfolio(adapter);
    expect(items).toHaveLength(before.length);
    expect(items.map(item => item.application)).toEqual(before);
    expect(items.find(item => item.application.id === applicationId)?.application).toMatchObject({ businessName: 'Northwind Demo Logistics', amountCents: 9_500_000, stage: 'reviewing' });
    expect(staff(adapter).findings).toHaveLength(1);
  });
  test('rejects a new file whose serial is already exclusive collateral on an active application', async () => {
    const adapter = new FixtureAdapter();
    const before = structuredClone(portfolio(adapter).map(item => item.application));
    const claims = exclusiveClaims(adapter);
    for (const serial of ['OV-482917', 'IM-173640', 'PR-905218', 'RF-661034', 'XR-308751', 'CN-774196', 'GF-229480', 'GD-851327', 'FR-046582', 'EM-513069', 'EX-0042']) expect(claims.has(serial), serial).toBe(true);
    expect(listBusinesses(claims.get('EX-0042')!)).toBe('Cedar Demo Excavation and Granite Demo Equipment');
    expect(listBusinesses(claims.get('OV-482917')!)).toBe('Summit Hearth Bakery');
    let n = 1;
    for (const [serial, names] of claims) {
      const sha = shaFor(n++);
      const result = await adapter.addVerifiedUpload(uploadBody(sha, 'Replica Demo Company', serial.toLowerCase()), sha);
      expect(result.ok, serial).toBe(false);
      if (!result.ok) expect(result.error.message).toBe(`Submission failed due to equipment ${serial} already being claimed by ${listBusinesses(names)}.`);
      expect(portfolio(adapter).some(item => item.application.id === `upload-${sha.slice(0, 12)}`)).toBe(false);
    }
    const shared = shaFor(90);
    const sharedResult = await adapter.addVerifiedUpload(uploadBody(shared, 'Shared Demo Use', 'ov-482917', false), shared);
    expect(sharedResult.ok).toBe(false);
    if (!sharedResult.ok) expect(sharedResult.error.message).toBe('Submission failed due to equipment OV-482917 already being claimed by Summit Hearth Bakery.');
    expect(portfolio(adapter).map(item => item.application)).toEqual(before);
  });
  test('adds a contract whose serial is not claimed as exclusive collateral', async () => {
    const adapter = new FixtureAdapter();
    const before = portfolio(adapter).length;
    const freshSha = shaFor(70);
    const officeSha = shaFor(71);
    await add(adapter, uploadBody(freshSha, 'Northwind Demo Logistics', 'ZX-900001'), freshSha);
    await add(adapter, uploadBody(officeSha, 'Northwind Demo Logistics', 'OFF-100'), officeSha);
    const items = portfolio(adapter);
    expect(items).toHaveLength(before + 2);
    expect(items.find(item => item.application.id === `upload-${freshSha.slice(0, 12)}`)?.application).toMatchObject({ businessName: 'Northwind Demo Logistics', stage: 'reviewing' });
    expect(staff(adapter, `upload-${officeSha.slice(0, 12)}`).collateral).toEqual([expect.objectContaining({ identifier: 'OFF-100', exclusiveOwnershipClaim: true, active: true })]);
  });
  test('a failed replica is not stored and does not block a later business once the original claim is inactive', async () => {
    const adapter = new FixtureAdapter();
    const seeded = portfolio(adapter).length;
    const firstSha = shaFor(40);
    const replicaSha = shaFor(41);
    const laterSha = shaFor(42);
    const firstId = `upload-${firstSha.slice(0, 12)}`;
    await add(adapter, uploadBody(firstSha, 'Harbor Fresh Cartage', 'ZX-900001'), firstSha);
    const replica = await adapter.addVerifiedUpload(uploadBody(replicaSha, 'Other Demo Hauling', 'zx-900001'), replicaSha);
    expect(replica.ok).toBe(false);
    if (!replica.ok) expect(replica.error.message).toBe('Submission failed due to equipment ZX-900001 already being claimed by Harbor Fresh Cartage.');
    expect(portfolio(adapter).some(item => item.application.id === `upload-${replicaSha.slice(0, 12)}`)).toBe(false);
    const original = portfolio(adapter).find(item => item.application.id === firstId)!;
    expect(original.application).toMatchObject({ businessName: 'Harbor Fresh Cartage', amountCents: 9_500_000, stage: 'reviewing' });
    const stored = (adapter as unknown as { state: { snapshot: { applications: Array<{ id: string; stage: string }> } } }).state.snapshot.applications.find(item => item.id === firstId)!;
    stored.stage = 'clarification_needed';
    const stillBlocked = await adapter.addVerifiedUpload(uploadBody(replicaSha, 'Other Demo Hauling', 'ZX-900001'), replicaSha);
    expect(stillBlocked.ok).toBe(false);
    if (!stillBlocked.ok) expect(stillBlocked.error.message).toBe('Submission failed due to equipment ZX-900001 already being claimed by Harbor Fresh Cartage.');
    stored.stage = 'released_demo';
    const later = await adapter.addVerifiedUpload(uploadBody(laterSha, 'Later Demo Freight', 'ZX-900001'), laterSha);
    expect(later.ok).toBe(true);
    const items = portfolio(adapter);
    expect(items).toHaveLength(seeded + 2);
    expect(items.some(item => item.application.id === `upload-${replicaSha.slice(0, 12)}`)).toBe(false);
    expect(items.find(item => item.application.id === firstId)?.application).toMatchObject({ businessName: 'Harbor Fresh Cartage', stage: 'released_demo' });
    expect(items.find(item => item.application.id === `upload-${laterSha.slice(0, 12)}`)?.application).toMatchObject({ businessName: 'Later Demo Freight', stage: 'reviewing' });
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
