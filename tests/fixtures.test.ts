import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCollateralConflicts, getPolicyReadiness } from '@loanwick/analysis';
import { BorrowerCaseViewSchema, StaffCaseViewSchema } from '@loanwick/contracts';
import { application, fixture } from './helpers.js';

describe('canonical source fixtures', () => {
  it('provides schema-valid staff and borrower sample projections without third-party borrower details', () => {
    const staff = StaffCaseViewSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/views/staff-case.json', import.meta.url), 'utf8')));
    const raw = readFileSync(new URL('../fixtures/views/borrower-case.json', import.meta.url), 'utf8');
    const borrower = BorrowerCaseViewSchema.parse(JSON.parse(raw));
    expect(staff.findings[0]?.findingType).toBe('collateral_conflict');
    expect(staff.toolEvents).toEqual([]);
    expect(borrower.application.id).toBe(staff.application.id);
    expect(raw).not.toContain('Granite'); expect(raw).not.toContain('app-excavator-b'); expect(raw).not.toContain('findingId');
  });
  it('matches independent expected results and verifies every source excerpt and hash', () => {
    const output = execFileSync(process.execPath, ['scripts/evaluate.mjs'], { encoding: 'utf8' });
    expect(JSON.parse(output)).toMatchObject({ passed: true, applications: 8, sourceDocuments: 8, expectedCaseFindingsFound: 4, missing: 0, unexpected: 0, evidenceOrFactMismatches: 0, distinctConcerns: 2, paymentVerification: 'stale' });
  });
  it('a corrected schedule removes the active conflict but cannot resolve the stored finding automatically', () => {
    const s = fixture(); const finding = checkCollateralConflicts(s)[0]!;
    s.collateral.find(c => c.id === 'asset-excavator-a')!.active = false;
    const app = application(s); app.applicationRevision++; app.collateralRevision++;
    expect(checkCollateralConflicts(s)).toEqual([]);
    const readiness = getPolicyReadiness({ application: app, reviews: [], findings: [{ applicationId: app.id, severity: finding.severity, status: 'awaiting_response' }], releases: [] });
    expect(readiness.reasons).toContainEqual({ code: 'BLOCKING_FINDINGS', checkType: null });
  });
});
