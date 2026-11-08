import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { demoFixtures } from '../spacetimedb/src/demo-fixtures.js';

describe('database seed source contract', () => {
  it('keeps generated seed hashes and extracted fields in sync with actual source files', () => {
    expect(execFileSync(process.execPath, ['scripts/generate-database-seed.mjs', '--check'], { encoding: 'utf8' })).toContain('17 synthetic source documents');
  });
  it('includes explicit ownership support only for the two exclusive claims', () => {
    expect(demoFixtures.filter(f => f.fields.some(e => e.fieldName === 'exclusiveOwnershipClaim')).map(f => f.businessName)).toEqual(['Northline Foods', 'Pineworks Supply']);
  });
  it('includes source-backed amounts and currency for both confirmed group members', () => {
    for (const number of [5, 6]) {
      const fixture = demoFixtures[number - 1]!;
      expect(fixture.fields.find(e => e.fieldName === 'amountCents')?.fieldValue).toBe(fixture.amountCents);
      expect(fixture.fields.find(e => e.fieldName === 'currency')?.fieldValue).toBe('USD');
    }
  });
});
