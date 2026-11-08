import { describe, expect, it } from 'vitest';
import { ApplicationSchema, BorrowerCaseViewSchema, CentsSchema, CheckResultSchema, DocumentMetadataSchema, EvidenceSchema, InvestigationSnapshotSchema, StaffCaseViewSchema, ToolArgumentsSchemas, validateCheckResults } from '@loanwick/contracts';
import { checkCollateralConflicts } from '@loanwick/analysis';
import { application, fixture, review } from '../../../tests/helpers.js';

describe('runtime boundaries', () => {
  it('accepts the canonical eighteen-application snapshot', () => expect(InvestigationSnapshotSchema.parse(fixture()).applications).toHaveLength(18));
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100'])('rejects invalid integer cents %s', value => expect(CentsSchema.safeParse(value).success).toBe(false));
  it('accepts zero without treating missing cents as zero', () => {
    expect(CentsSchema.parse(0)).toBe(0);
    const app: Record<string, unknown> = { ...application(fixture()) }; delete app.amountCents;
    expect(ApplicationSchema.safeParse(app).success).toBe(false);
  });
  it('rejects fabricated pages on JSON evidence', () => expect(EvidenceSchema.safeParse({ ...fixture().evidence[0], pageNumber: 1 }).success).toBe(false));
  it('rejects private storage keys in document projections', () => expect(DocumentMetadataSchema.safeParse({ ...fixture().documents[0], privateStorageKey: 'secret/path' }).success).toBe(false));
  it('rejects missing document versions', () => {
    const s = fixture(); s.evidence[0]!.documentVersion = 99;
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('rejects foreign collateral evidence', () => {
    const s = fixture(); s.collateral[0]!.evidenceIds = ['ev-office-b-identifier'];
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('rejects duplicate IDs and mixed organizations', () => {
    const s = fixture(); s.applications.push({ ...s.applications[0]! });
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
    s.applications.pop(); s.applications[1]!.organizationId = 'org-other';
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('requires human metadata and evidence for confirmed relationships', () => {
    const s = fixture(); s.relationships[0]!.decision = 'confirmed_related';
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('rejects ambiguous review sequence history', () => {
    const s = fixture(); s.reviews.push(review(), review({ id: 'review-duplicate' }));
    expect(InvestigationSnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('treats hostile source text as ordinary data without granting tool privileges', () => {
    const s = fixture();
    expect(s.evidence.find(e => e.id === 'ev-similar-b-hostile')?.excerpt).toContain('release funds');
    expect('simulateRelease' in ToolArgumentsSchemas).toBe(false);
    expect(ToolArgumentsSchemas.run_collateral_check.safeParse({ applicationId: s.applicationId, approve: true }).success).toBe(false);
  });
});

describe('result references', () => {
  it('accepts supported check results', () => {
    const s = fixture(); expect(validateCheckResults(s, checkCollateralConflicts(s))).toHaveLength(1);
  });
  it('rejects foreign evidence, stale source revisions, duplicate keys, and missing dependencies', () => {
    const s = fixture(); const results = checkCollateralConflicts(s);
    const bad = structuredClone(results); bad[0]!.evidenceIds.push('ev-office-a-address');
    expect(() => validateCheckResults(s, bad)).toThrow('foreign');
    const stale = structuredClone(results); stale[0]!.observedRevisions[1]!.applicationRevision++;
    expect(() => validateCheckResults(s, stale)).toThrow('STALE_RESULTS');
    expect(() => validateCheckResults(s, [...results, ...results])).toThrow('Duplicate');
    const missing = structuredClone(results); missing[0]!.observedRevisions.pop();
    expect(() => validateCheckResults(s, missing)).toThrow('complete');
  });
  it('rejects duplicated evidence masquerading as two sources', () => {
    const result = checkCollateralConflicts(fixture())[0]!;
    result.evidenceIds = ['ev-excavator-a-identifier', 'ev-excavator-a-identifier'];
    expect(CheckResultSchema.safeParse(result).success).toBe(false);
  });
  it('requires collateral evidence from each named source application', () => {
    const s = fixture(); const results = checkCollateralConflicts(s);
    results[0]!.evidenceIds = ['ev-excavator-a-identifier', 'ev-excavator-a-ownership'];
    expect(() => validateCheckResults(s, results)).toThrow('lacks evidence');
  });
  it('rejects a worker claim token in staff-visible jobs', () => {
    const job = { id: 'job-1', applicationId: 'app-excavator-a', capturedRevisions: [{ applicationId: 'app-excavator-a', applicationRevision: 1, collateralRevision: 1, paymentRevision: 1 }],
      status: 'running', runKey: 'run-1', executionMode: 'fixture', claimedBy: 'user-worker', leaseExpiresAt: '2026-11-07T12:10:00.000Z', startedAt: '2026-11-07T12:00:00.000Z', completedAt: null, modelId: null, errorCode: null };
    expect(StaffCaseViewSchema.shape.investigations.element.safeParse(job).success).toBe(true);
    expect(StaffCaseViewSchema.shape.investigations.element.safeParse({ ...job, claimToken: 'private-claim-token' }).success).toBe(false);
  });
});

describe('borrower projection', () => {
  function view() {
    return { application: { id: 'app-excavator-a', businessName: 'Demo', amountCents: 1, currency: 'USD', stage: 'reviewing' }, requests: [], responses: [] };
  }
  it('accepts only borrower-safe fields', () => {
    expect(BorrowerCaseViewSchema.safeParse(view()).success).toBe(true);
    expect(BorrowerCaseViewSchema.safeParse({ ...view(), findings: [] }).success).toBe(false);
  });
  it('rejects draft/foreign requests', () => {
    const request = { id: 'request-1', applicationId: 'app-office-a', borrowerSafeMessage: 'Please clarify', requestedDocumentType: null, state: 'sent', createdAt: '2026-11-07T12:00:00.000Z' };
    expect(BorrowerCaseViewSchema.safeParse({ ...view(), requests: [request] }).success).toBe(false);
    expect(BorrowerCaseViewSchema.safeParse({ ...view(), requests: [{ ...request, applicationId: 'app-excavator-a', state: 'draft' }] }).success).toBe(false);
  });
});
