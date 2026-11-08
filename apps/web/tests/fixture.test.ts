import { describe, expect, test } from 'vitest';
import { FixtureAdapter } from '../src/adapters/fixture';
import { BorrowerCaseViewSchema, StaffCaseViewSchema, DocumentMetadataSchema, EvidenceSchema, IdSchema } from '@loanwick/contracts';
import type { BorrowerCaseView, CaseAdapter, OperationResult, StaffCaseView } from '@loanwick/contracts/domain';
import { documentView, nativeId, publicId, safeCents } from '../src/adapters/live';
import { Timestamp } from 'spacetimedb';
const appId = 'app-excavator-a';
const cid = () => crypto.randomUUID();
function staff(adapter: FixtureAdapter, applicationId = appId): StaffCaseView { let result!: StaffCaseView; adapter.subscribeCase(applicationId, v => { result = v; }, e => { throw Error(e.message); })(); return result; }
function borrower(adapter: FixtureAdapter): BorrowerCaseView { let result!: BorrowerCaseView; adapter.subscribeBorrowerCase(appId, v => { result = v; }, e => { throw Error(e.message); })(); return result; }
async function ok<T>(result: Promise<OperationResult<T>>) { const value = await result; if (!value.ok) throw Error(value.error.message); return value.value; }
async function investigate(adapter: FixtureAdapter) { await ok(adapter.requestInvestigation({ applicationId: appId, executionMode: 'fixture', correlationId: cid() })); }
async function send(adapter: FixtureAdapter) {
  const finding = staff(adapter).findings[0]!;
  const message = 'Please provide an updated ownership document and collateral schedule for EX-0042.';
  const { requestId } = await ok(adapter.createClarificationDraft({ applicationId: appId, findingId: finding.id, borrowerSafeMessage: message, requestedDocumentType: 'collateral_schedule', correlationId: cid() }));
  await ok(adapter.sendClarification({ requestId, borrowerSafeMessage: message, correlationId: cid() })); return requestId;
}
function memoryStorage(initial?: string) {
  let raw = initial ?? null;
  return { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; }, removeItem: () => { raw = null; } };
}
describe('complete synthetic workflow', () => {
  test('lists only the authenticated borrower applications and sent request counts', async () => {
    const adapter = new FixtureAdapter(); let error = '';
    adapter.subscribeBorrowerApplications(() => { throw Error('Staff must not use the borrower list'); }, value => { error = value.code; })();
    expect(error).toBe('UNAUTHORIZED');
    await send(adapter); adapter.selectIdentity('borrower', appId);
    let items: import('../src/adapters/types').BorrowerApplicationSummary[] = [];
    adapter.subscribeBorrowerApplications(value => { items = value; }, value => { throw Error(value.message); })();
    expect(items.find(a => a.id === appId)?.pendingRequestCount).toBe(1);
    expect(items.some(a => a.id === 'app-excavator-b')).toBe(false);
    expect(Object.keys(items[0]!).sort()).toEqual(['amountCents', 'businessName', 'currency', 'id', 'pendingRequestCount', 'stage']);
  });
  test('preserves exact sources and produces actual deterministic tool activity', async () => {
    const adapter = new FixtureAdapter(); const before = staff(adapter);
    expect(before.investigations).toHaveLength(0); expect(before.toolEvents).toHaveLength(0);
    const document = before.documents.find(d => d.id === 'doc-excavator-a')!;
    const raw = await adapter.source(document.id, document.version);
    expect(raw).toContain('"identifier": "EX-0042"');
    await investigate(adapter); const after = staff(adapter);
    expect(after.findings[0]!.id).toBe(before.findings[0]!.id);
    expect(after.investigations[0]!.status).toBe('succeeded');
    expect(after.toolEvents[0]!.toolName).toBe('analyzeSnapshot');
    expect(after.investigations[0]!.modelId).toBeNull();
    expect(StaffCaseViewSchema.safeParse(after).success).toBe(true);
  });
  test('shares a real fixture request/response across role switches without exposing staff fields', async () => {
    const adapter = new FixtureAdapter(); await investigate(adapter); const requestId = await send(adapter);
    adapter.selectIdentity('borrower', appId); const own = borrower(adapter);
    expect(own.requests[0]!.id).toBe(requestId);
    expect(BorrowerCaseViewSchema.safeParse(own).success).toBe(true);
    expect(Object.keys(own)).not.toEqual(expect.arrayContaining(['findings', 'evidence', 'readiness']));
    expect(JSON.stringify(own)).not.toContain('Granite');
    const docId = await adapter.attachSyntheticCorrection(requestId);
    expect(await adapter.attachSyntheticCorrection(requestId)).toBe(docId);
    expect(borrower(adapter).documents?.find(d => d.id === docId)?.version).toBe(2);
    await ok(adapter.submitBorrowerResponse({ requestId, message: 'EX-0042 is removed from this collateral schedule.', documentIds: [docId], correlationId: cid() }));
    expect(borrower(adapter).responses).toHaveLength(1);
    adapter.selectIdentity('officer', appId); const response = staff(adapter);
    expect(response.findings[0]!.status).toBe('awaiting_response');
    expect(response.application.collateralRevision).toBe(2);
    expect(response.readiness.reasons.some(r => r.code === 'INVESTIGATION_STALE')).toBe(true);
    const oldSource = await adapter.source('doc-excavator-a', 1); expect(oldSource).toContain('"exclusiveOwnershipClaim": true');
    await investigate(adapter); expect(staff(adapter).findings[0]!.status).toBe('awaiting_response');
  });
  test('completes correction, human decision, stale payment checks, re-investigation, and one release', async () => {
    const storage = memoryStorage(); const adapter = new FixtureAdapter(storage);
    await investigate(adapter); const requestId = await send(adapter);
    adapter.selectIdentity('borrower', appId); const documentId = await adapter.attachSyntheticCorrection(requestId);
    await ok(adapter.submitBorrowerResponse({ requestId, message: 'The asset is removed. Please review the corrected schedule.', documentIds: [documentId], correlationId: cid() }));
    adapter.selectIdentity('officer', appId); await investigate(adapter);
    await ok(adapter.decideFinding({ findingId: staff(adapter).findings[0]!.id, decision: 'resolved', rationale: 'Reviewed the corrected source and removal from current collateral.', correlationId: cid() }));
    adapter.selectIdentity('reviewer', appId);
    const review = async (type: Parameters<CaseAdapter['recordReview']>[0]['checkType']) => {
      const view = staff(adapter); const evidenceIds = type === 'payment_verification' ? view.paymentSummary!.evidenceIds : [view.evidence.find(e => e.documentId === documentId)!.id];
      await ok(adapter.recordReview({ applicationId: appId, checkType: type, observedRelevantRevision: view.readiness.checks[type].currentRevision, rationale: 'Reviewed the exact source and current revision.', evidenceIds, correlationId: cid() }));
    };
    for (const type of ['collateral_review', 'document_consistency_review', 'payment_verification'] as const) await review(type);
    expect(staff(adapter).readiness.canRelease).toBe(true);
    await ok(adapter.changePaymentInstructions({ applicationId: appId, observedPaymentRevision: staff(adapter).application.paymentRevision, syntheticAccountToken: 'SYNTH-CHANGED', beneficiaryName: 'Cedar Demo Excavation', evidenceIds: [], correlationId: cid() }));
    let view = staff(adapter);
    expect(view.readiness.checks.payment_verification.status).toBe('stale');
    expect(view.readiness.checks.document_consistency_review.status).toBe('stale');
    expect(view.readiness.checks.collateral_review.status).toBe('current');
    expect((await adapter.simulateRelease({ applicationId: appId, idempotencyKey: 'premature', correlationId: cid() })).ok).toBe(false);
    adapter.selectIdentity('officer', appId); await investigate(adapter); adapter.selectIdentity('reviewer', appId);
    await review('payment_verification'); await review('document_consistency_review');
    const key = cid(); const release = await ok(adapter.simulateRelease({ applicationId: appId, idempotencyKey: key, correlationId: cid() }));
    const retry = await ok(adapter.simulateRelease({ applicationId: appId, idempotencyKey: key, correlationId: cid() }));
    expect(retry.id).toBe(release.id);
    expect((await adapter.simulateRelease({ applicationId: appId, idempotencyKey: cid(), correlationId: cid() })).ok).toBe(false);
    const restored = new FixtureAdapter(storage); restored.selectIdentity('reviewer', appId);
    expect(staff(restored).release?.id).toBe(release.id);
    expect((await restored.changePaymentInstructions({ applicationId: appId, observedPaymentRevision: staff(restored).application.paymentRevision, syntheticAccountToken: 'SYNTH-LATE', beneficiaryName: 'Cedar', evidenceIds: [], correlationId: cid() })).ok).toBe(false);
  });
  test('requires exact preview and prevents a draft entering borrower data', async () => {
    const adapter = new FixtureAdapter(); const findingId = staff(adapter).findings[0]!.id;
    const { requestId } = await ok(adapter.createClarificationDraft({ applicationId: appId, findingId, borrowerSafeMessage: 'Please provide documentation.', requestedDocumentType: null, correlationId: cid() }));
    await ok(adapter.updateClarificationDraft({ requestId, borrowerSafeMessage: 'Please provide the current schedule.', requestedDocumentType: 'collateral_schedule', correlationId: cid() }));
    expect((await adapter.sendClarification({ requestId, borrowerSafeMessage: 'Please provide documentation.', correlationId: cid() })).ok).toBe(false);
    adapter.selectIdentity('borrower', appId); expect(borrower(adapter).requests).toHaveLength(0);
  });
  test('denies foreign borrower cases and staff actions from a borrower', async () => {
    const adapter = new FixtureAdapter(); adapter.selectIdentity('borrower', appId);
    let errorCode = ''; adapter.subscribeBorrowerCase('app-excavator-b', () => { throw Error('Foreign data leaked'); }, e => { errorCode = e.code; })();
    expect(errorCode).toBe('NOT_FOUND_OR_FORBIDDEN');
    expect((await adapter.requestInvestigation({ applicationId: appId, executionMode: 'fixture', correlationId: cid() })).ok).toBe(false);
  });
  test('requires rationale and current revision; later nonpass supersedes an older pass', async () => {
    const adapter = new FixtureAdapter(); adapter.selectIdentity('reviewer', appId); const view = staff(adapter);
    const input = { applicationId: appId, checkType: 'collateral_review' as const, observedRelevantRevision: 1, rationale: 'Reviewed the source.', evidenceIds: [view.evidence[0]!.id], correlationId: cid() };
    expect((await adapter.recordReview({ ...input, rationale: ' ' })).ok).toBe(false);
    expect((await adapter.recordReview({ ...input, observedRelevantRevision: 0 })).ok).toBe(false);
    await ok(adapter.recordReview(input)); expect(staff(adapter).readiness.checks.collateral_review.status).toBe('current');
    await ok(adapter.recordReview({ ...input, correlationId: cid(), status: 'needs_review' }));
    expect(staff(adapter).readiness.checks.collateral_review.status).toBe('needs_review');
  });
  test('keeps live execution and injected failures explicit; reset is reproducible', async () => {
    const adapter = new FixtureAdapter();
    expect((await adapter.requestInvestigation({ applicationId: appId, executionMode: 'live', correlationId: cid() })).ok).toBe(false);
    adapter.setFailure('investigation'); expect((await adapter.requestInvestigation({ applicationId: appId, executionMode: 'fixture', correlationId: cid() })).ok).toBe(false);
    expect(staff(adapter).investigations[0]!.status).toBe('failed');
    adapter.reset(); expect(staff(adapter).findings).toHaveLength(1); expect(staff(adapter).investigations).toHaveLength(0);
  });
  test('invalid persisted scenario resets visibly', () => {
    const adapter = new FixtureAdapter(memoryStorage('{"version":0}'));
    expect(adapter.startupNotice).toContain('fresh synthetic scenario'); expect(staff(adapter).findings).toHaveLength(1);
  });
  test('does not attach the EX-0042 correction to an unrelated group concern', async () => {
    const adapter = new FixtureAdapter(); const applicationId = 'app-group-a';
    const finding = staff(adapter, applicationId).findings[0]!;
    const { requestId } = await ok(adapter.createClarificationDraft({ applicationId, findingId: finding.id, borrowerSafeMessage: 'Please provide a current financial statement.', requestedDocumentType: 'financial_statement', correlationId: cid() }));
    await ok(adapter.sendClarification({ requestId, borrowerSafeMessage: 'Please provide a current financial statement.', correlationId: cid() }));
    adapter.selectIdentity('borrower', applicationId);
    expect(adapter.canAttachSyntheticCorrection(requestId)).toBe(false);
    await expect(adapter.attachSyntheticCorrection(requestId)).rejects.toThrow('no synthetic corrected-document');
  });
});
describe('SDK boundary conversions', () => {
  test('round-trips IDs without delimiter collisions', () => {
    for (const raw of ['app/demo/2', 'app:demo:2', 'db.existing', 'évidence']) expect(nativeId(publicId(raw))).toBe(raw);
    expect(publicId('a/b')).not.toBe(publicId('a:b'));
  });
  test('rejects unsafe bigint money', () => { expect(safeCents(25000000n)).toBe(25000000); expect(() => safeCents(9007199254740992n)).toThrow('safely'); });
  test('supports maximum database ID lengths and versioned payment IDs', () => {
    for (const raw of ['a'.repeat(100), `${'a'.repeat(100)}/4294967295`]) {
      const encoded = publicId(raw); expect(IdSchema.safeParse(encoded).success).toBe(true); expect(nativeId(encoded)).toBe(raw);
    }
  });
  test('maps the current database extraction status and preserves fixture provenance', () => {
    const timestamp = new Timestamp(1794052800000000n);
    const document = documentView({ id: 'doc-1', applicationId: 'demo-case-1', type: 'collateral_schedule', version: 1, sha256: 'a'.repeat(64), displayFilename: 'source.txt', extractionStatus: 'extracted', uploadedBy: 'borrower-1', current: true, requestId: undefined, createdAt: timestamp });
    expect(DocumentMetadataSchema.parse(document).extractionStatus).toBe('succeeded');
    expect(EvidenceSchema.parse({ id: 'evidence-1', applicationId: document.applicationId, documentId: document.id, documentVersion: 1, pageNumber: null, locator: 'line 2', excerpt: 'Ownership: exclusive', fieldName: 'exclusiveOwnershipClaim', extractedValue: 'true', extractionMethod: 'fixture', createdAt: timestamp.toISOString() }).extractionMethod).toBe('fixture');
  });
});
