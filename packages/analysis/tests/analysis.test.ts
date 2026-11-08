import { describe, expect, it } from 'vitest';
import { CHECK_TYPES } from '@loanwick/contracts';
import type { InvestigationSnapshot } from '@loanwick/contracts';
import { analyzeSnapshot, captureSourceRevisions, checkCollateralConflicts, checkGroupThreshold, DEMO_GROUP_POLICY, getChangedSourceIds, getPaymentVerificationState, getPolicyReadiness, normalizeIdentifier } from '@loanwick/analysis';
import { application, fixture, review } from '../../../tests/helpers.js';

function identifier(s: InvestigationSnapshot, slug: string, value: string | null) {
  s.collateral.find(c => c.id === `asset-${slug}`)!.identifier = value;
  s.evidence.find(e => e.id === `ev-${slug}-identifier`)!.extractedValue = value;
}

describe('identifier policy', () => {
  it('normalizes case and outer whitespace', () => expect(normalizeIdentifier(' ex-0042 ')).toEqual({ state: 'valid', normalized: 'EX-0042' }));
  it('preserves meaningful separators and leading zeroes', () => {
    expect(normalizeIdentifier('EX-0042')).not.toEqual(normalizeIdentifier('EX0042'));
    expect(normalizeIdentifier('0042')).not.toEqual(normalizeIdentifier('42'));
  });
  it('changes formatting only under an explicit policy', () => {
    expect(normalizeIdentifier('ex-0042', { caseInsensitive: false, ignoreHyphens: false })).toEqual({ state: 'valid', normalized: 'ex-0042' });
    expect(normalizeIdentifier('ex-0042', { caseInsensitive: true, ignoreHyphens: true })).toEqual({ state: 'valid', normalized: 'EX0042' });
  });
  it.each([null, undefined, '', '  '])('returns unknown for missing %s', value => expect(normalizeIdentifier(value).state).toBe('unknown'));
  it.each(['EX 0042', 'ＥＸ0042', '../0042', 'EX_0042'])('rejects unsupported %s', value => expect(normalizeIdentifier(value).state).toBe('invalid'));
});

describe('collateral conflict', () => {
  it('finds the planted conflict with four real evidence references and both revisions', () => {
    const [result] = checkCollateralConflicts(fixture());
    expect(result).toMatchObject({ findingType: 'collateral_conflict', severity: 'high', evidenceState: 'contradicted', applicationIds: ['app-excavator-a', 'app-excavator-b'], facts: { normalizedIdentifier: 'EX-0042' } });
    expect(result?.evidenceIds).toHaveLength(4); expect(result?.observedRevisions).toHaveLength(2);
  });
  it.each(['EX0042', 'EX-042', null])('does not conflate %s', value => {
    const s = fixture(); identifier(s, 'excavator-b', value);
    expect(checkCollateralConflicts(s)).toEqual([]);
  });
  it('returns unknown when ownership evidence is absent', () => {
    const s = fixture(); s.collateral[1]!.ownershipEvidenceIds = [];
    expect(checkCollateralConflicts(s)[0]).toMatchObject({ findingType: 'collateral_ownership_unknown', severity: 'review', evidenceState: 'unknown' });
  });
  it('does not accept a false evidence value as an exclusive claim', () => {
    const s = fixture(); s.evidence.find(e => e.id === 'ev-excavator-b-ownership')!.extractedValue = 'false';
    expect(checkCollateralConflicts(s)[0]?.evidenceState).toBe('unknown');
  });
  it('does not match unsupported identifier evidence', () => {
    const s = fixture(); s.collateral[1]!.evidenceIds = [];
    expect(checkCollateralConflicts(s)).toEqual([]);
  });
  it('does not conflate separate asset identifier namespaces', () => {
    const s = fixture(); s.collateral[1]!.assetType = 'different_registry';
    expect(checkCollateralConflicts(s)).toEqual([]);
  });
  it('does not flag known nonexclusive ownership', () => {
    const s = fixture(); for (const c of s.collateral) c.exclusiveOwnershipClaim = false;
    expect(checkCollateralConflicts(s)).toEqual([]);
  });
  it('ignores inactive collateral and draft applications', () => {
    const s = fixture(); s.collateral[1]!.active = false;
    expect(checkCollateralConflicts(s)).toEqual([]);
    s.collateral[1]!.active = true; application(s, 'app-excavator-b').stage = 'draft';
    expect(checkCollateralConflicts(s)).toEqual([]);
  });
  it('same-application duplicate records are not a cross-case conflict', () => {
    const s = fixture(); s.collateral = [s.collateral[0]!, { ...s.collateral[0]!, id: 'asset-duplicate' }];
    expect(checkCollateralConflicts(s)).toEqual([]);
  });
  it('deduplicates repeated claims without increasing case/evidence counts', () => {
    const s = fixture(); s.collateral.push({ ...s.collateral[0]!, id: 'asset-duplicate' });
    expect(checkCollateralConflicts(s)).toEqual(checkCollateralConflicts(fixture()));
  });
  it('is stable under input order changes', () => {
    const s = fixture(); const expected = checkCollateralConflicts(s);
    s.applications.reverse(); s.collateral.reverse(); s.evidence.reverse();
    expect(checkCollateralConflicts(s)).toEqual(expected);
  });
  it('keeps two independent equipment conflicts distinct', () => {
    const s = fixture();
    for (const slug of ['excavator-a', 'excavator-b']) {
      const old = s.collateral.find(c => c.id === `asset-${slug}`)!;
      const eid = `ev-${slug}-second`;
      s.evidence.push({ ...s.evidence.find(e => e.id === old.evidenceIds[0])!, id: eid, extractedValue: 'EX-SECOND' });
      s.collateral.push({ ...old, id: old.id + '-second', identifier: 'EX-SECOND', evidenceIds: [eid] });
    }
    const results = checkCollateralConflicts(s);
    expect(results).toHaveLength(2); expect(new Set(results.map(r => r.deduplicationKey)).size).toBe(2);
  });
  it.each(['app-office-a', 'app-office-b', 'app-similar-a', 'app-similar-b'])('has no collateral verdict for negative control %s', id => expect(checkCollateralConflicts(fixture(id))).toEqual([]));
});

describe('confirmed-group threshold', () => {
  it('sums each confirmed active application once', () => {
    const s = fixture('app-group-a');
    expect(checkGroupThreshold(s)[0]?.facts).toEqual({ totalCents: 110_000_000, thresholdCents: 100_000_000, currency: 'USD', policyVersion: '1.0.0' });
  });
  it.each([99_999_999, 100_000_000, 100_000_001])('uses strictly-greater boundary at %s cents', total => {
    const s = fixture('app-group-a'); application(s, 'app-group-a').amountCents = total - 40_000_000;
    s.evidence.find(e => e.id === 'ev-group-a-amountCents')!.extractedValue = String(total - 40_000_000);
    expect(checkGroupThreshold(s)).toHaveLength(total > 100_000_000 ? 1 : 0);
  });
  it('duplicate edges and cycles do not count requests twice', () => {
    const s = fixture('app-group-a'); const edge = s.relationships.find(r => r.id === 'relationship-group')!;
    s.relationships.push({ ...edge, id: 'relationship-duplicate' }, { ...edge, id: 'relationship-reverse', leftApplicationId: edge.rightApplicationId, rightApplicationId: edge.leftApplicationId });
    expect(checkGroupThreshold(s)[0]?.facts.totalCents).toBe(110_000_000);
  });
  it('similarity, shared addresses, and missing relationship evidence do not establish groups', () => {
    expect(checkGroupThreshold(fixture('app-office-a'))).toEqual([]);
    expect(checkGroupThreshold(fixture('app-similar-a'))).toEqual([]);
    const s = fixture('app-group-a'); s.relationships.find(r => r.id === 'relationship-group')!.evidenceIds = [];
    expect(checkGroupThreshold(s)).toEqual([]);
  });
  it('excludes inactive requests from the total', () => {
    const s = fixture('app-group-a'); application(s, 'app-group-b').stage = 'released_demo';
    expect(checkGroupThreshold(s)).toEqual([]);
  });
  it('requires source evidence for quantitative findings', () => {
    const s = fixture('app-group-a'); s.evidence = s.evidence.filter(e => e.id !== 'ev-group-a-amountCents');
    expect(() => checkGroupThreshold(s)).toThrow('Missing amount/currency evidence');
  });
  it('preserves membership through inactive intermediaries and captures their revisions', () => {
    const s = fixture('app-group-a'); const middle = application(s, 'app-office-a'); middle.stage = 'draft';
    const edge = s.relationships.find(r => r.id === 'relationship-group')!;
    edge.rightApplicationId = middle.id; edge.evidenceIds = ['ev-group-a-group'];
    s.relationships.push({ ...edge, id: 'relationship-via-middle', leftApplicationId: middle.id, rightApplicationId: 'app-group-b', evidenceIds: ['ev-group-b-group'] });
    const result = checkGroupThreshold(s)[0]!;
    expect(result.facts.totalCents).toBe(110_000_000);
    expect(result.observedRevisions.map(r => r.applicationId)).toContain(middle.id);
  });
  it('rejects mixed currencies, unsafe totals, invalid cents, and duplicate application records', () => {
    const s = fixture('app-group-a'); application(s, 'app-group-b').currency = 'EUR';
    expect(() => checkGroupThreshold(s)).toThrow('currencies');
    application(s, 'app-group-b').currency = 'USD'; application(s, 'app-group-b').amountCents = Number.MAX_SAFE_INTEGER;
    expect(() => checkGroupThreshold(s)).toThrow('safe integer');
    application(s, 'app-group-b').amountCents = -1;
    expect(() => checkGroupThreshold(s)).toThrow('Invalid application');
    s.applications.push({ ...s.applications[0]! });
    expect(() => checkGroupThreshold(s)).toThrow('Duplicate');
  });
  it('includes policy identity in its stable key', () => {
    const s = fixture('app-group-a');
    expect(checkGroupThreshold(s, { ...DEMO_GROUP_POLICY, version: '2.0.0' })[0]?.deduplicationKey).not.toBe(checkGroupThreshold(s)[0]?.deduplicationKey);
  });
});

describe('review revisions and source freshness', () => {
  it('reports incomplete collateral coverage and captures negative-match sources', () => {
    const result = analyzeSnapshot(fixture());
    expect(result.sourceRevisions).toHaveLength(8);
    expect(result.skippedCollateralIds).toEqual(['asset-similar-b']);
    expect(result.results).toHaveLength(1);
  });
  it('handles missing, current, stale and needs-review payment checks', () => {
    expect(getPaymentVerificationState(1).status).toBe('pending');
    expect(getPaymentVerificationState(1, [review()]).status).toBe('current');
    expect(getPaymentVerificationState(2, [review()]).status).toBe('stale');
    expect(getPaymentVerificationState(1, [review({ status: 'needs_review' })]).status).toBe('needs_review');
  });
  it('never resurrects an earlier pass after a newer nonpass', () => {
    expect(getPaymentVerificationState(1, [review({ id: 'newer', sequence: 2, status: 'needs_review' }), review()]).status).toBe('needs_review');
  });
  it('rejects ambiguous histories', () => {
    expect(() => getPaymentVerificationState(1, [review(), review({ id: 'other' })])).toThrow('Ambiguous');
    expect(() => getPaymentVerificationState(1, [review(), review({ applicationId: 'other-app', sequence: 2 })])).toThrow('Ambiguous');
  });
  it('detects changed, removed, and newly added related sources', () => {
    const sources = captureSourceRevisions(fixture().applications);
    expect(getChangedSourceIds(sources, sources)).toEqual([]);
    const changed = structuredClone(sources); changed[1]!.applicationRevision++;
    expect(getChangedSourceIds(sources, changed)).toEqual([changed[1]!.applicationId]);
    expect(getChangedSourceIds(sources, sources.slice(1))).toEqual([sources[0]!.applicationId]);
    expect(getChangedSourceIds(sources.slice(1), sources)).toEqual([sources[0]!.applicationId]);
  });
  it('rejects duplicate captured revisions', () => {
    const sources = captureSourceRevisions(fixture().applications);
    expect(() => getChangedSourceIds([...sources, sources[0]!], sources)).toThrow('Duplicate');
  });
});

describe('policy readiness, without actor authorization', () => {
  function ready() {
    const app = application(fixture());
    return { application: app, reviews: CHECK_TYPES.map((checkType, sequence) => review({ id: `review-${sequence}`, checkType, sequence })), findings: [], releases: [] };
  }
  it('accepts current checks but does not claim caller authorization', () => {
    const result = getPolicyReadiness(ready());
    expect(result.eligibleByPolicy).toBe(true); expect('canRelease' in result).toBe(false);
  });
  it('invalidates payment and conservative document review, preserving collateral review', () => {
    const input = ready(); input.application.paymentRevision++; input.application.applicationRevision++;
    const result = getPolicyReadiness(input);
    expect(result.eligibleByPolicy).toBe(false);
    expect(result.checks.payment_verification.status).toBe('stale');
    expect(result.checks.document_consistency_review.status).toBe('stale');
    expect(result.checks.collateral_review.status).toBe('current');
  });
  it.each(['open', 'awaiting_response', 'escalated'] as const)('blocks high %s findings', status => {
    const input = ready();
    const result = getPolicyReadiness({ ...input, findings: [{ applicationId: input.application.id, severity: 'high', status }] });
    expect(result.reasons).toContainEqual({ code: 'BLOCKING_FINDINGS', checkType: null });
  });
  it('ignores resolved, nonblocking and unrelated findings', () => {
    const input = ready();
    expect(getPolicyReadiness({ ...input, findings: [{ applicationId: input.application.id, severity: 'high', status: 'resolved' }, { applicationId: input.application.id, severity: 'review', status: 'open' }, { applicationId: 'other-case', severity: 'high', status: 'open' }] }).eligibleByPolicy).toBe(true);
  });
  it('blocks missing reviews, draft stage, and existing release', () => {
    const input = ready();
    expect(getPolicyReadiness({ ...input, reviews: [] }).reasons).toHaveLength(3);
    input.application.stage = 'draft'; expect(getPolicyReadiness(input).eligibleByPolicy).toBe(false);
    input.application.stage = 'reviewing';
    const result = getPolicyReadiness({ ...input, releases: [{ id: 'release-1', applicationId: input.application.id, idempotencyKey: 'attempt-1', releasedBy: 'user-reviewer', releasedAt: '2026-11-07T12:00:00.000Z', syntheticAmountCents: input.application.amountCents }] });
    expect(result.reasons).toContainEqual({ code: 'ALREADY_RELEASED', checkType: null });
  });
});
