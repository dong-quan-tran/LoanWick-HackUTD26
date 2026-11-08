import { expect, test } from 'vitest';
import type { Evidence, StaffCaseView } from '@loanwick/contracts/domain';
import { FixtureAdapter } from '../src/adapters/fixture';
import { citedDocumentVersions, presentCaseEvidence, presentCaseFinding } from '../src/case-evidence';

function caseView(id = 'app-excavator-a') {
  let view!: StaffCaseView;
  new FixtureAdapter().subscribeCase(id, value => { view = value; }, error => { throw new Error(error.message); })();
  return view;
}

test('plain-language equipment numbers preserve the original written value', () => {
  const view = caseView();
  const evidence = view.evidence.find(item => item.extractedValue === 'ex-0042')!;
  expect(presentCaseEvidence(evidence, view.evidence, 'EX-0042')).toMatchObject({ value: 'EX-0042', note: 'Written as “ex-0042” in the document.' });
  expect(evidence.extractedValue).toBe('ex-0042');
  expect(evidence.excerpt).toContain('ex-0042');
});

test('a false or missing ownership statement never implies that equipment is shared or leased', () => {
  const base = caseView().evidence.find(item => item.fieldName === 'exclusiveOwnershipClaim')!;
  expect(presentCaseEvidence({ ...base, extractedValue: 'false' }, []).value).toBe('Borrower does not claim full ownership');
  for (const extractedValue of [null, '', 'unknown']) {
    expect(presentCaseEvidence({ ...base, extractedValue }, []).value).toBe('Not stated in this document');
  }
});

test('an absent equipment pledge is not presented as an active pledge', () => {
  const base = { ...caseView().evidence[0]!, fieldName: 'activeCollateralClaim' };
  expect(presentCaseEvidence({ ...base, extractedValue: null }, []).value).toBe('Not stated in this document');
  expect(presentCaseEvidence({ ...base, extractedValue: 'false' }, []).value).toBe('No longer offered as security for this loan');
});

test('amounts use the currency in the cited document version and never assume USD or a zero amount', () => {
  const view = caseView();
  const amount = view.evidence.find(item => item.fieldName === 'amountCents')!;
  const currency: Evidence = { ...amount, id: 'currency', fieldName: 'currency', extractedValue: 'EUR' };
  expect(presentCaseEvidence(amount, [currency]).value).toBe('€250,000');
  expect(presentCaseEvidence(amount, [{ ...currency, documentVersion: currency.documentVersion + 1 }]).value).toBe('Amount needs checking in the document');
  expect(presentCaseEvidence(amount, [{ ...currency, applicationId: 'another-application' }]).value).toBe('Amount needs checking in the document');
  expect(presentCaseEvidence({ ...amount, extractedValue: null }, [currency]).value).toBe('Not stated in this document');
  expect(presentCaseEvidence({ ...amount, extractedValue: 'invalid' }, [currency]).value).toBe('Amount needs checking in the document');
});

test('a combined review without amount facts does not invent a total or threshold', () => {
  const finding = caseView('app-group-a').findings[0]!;
  expect(presentCaseFinding({ ...finding, facts: undefined }).summary).toBe('These connected applications need to be reviewed together against the combined loan review limit.');
  expect(presentCaseFinding(finding).why).toContain('not evidence of wrongdoing');
});

test('comparison sources retain each cited version, omit unrelated evidence, and put this application first', () => {
  const view = caseView();
  const own = view.evidence.find(item => item.fieldName === 'identifier' && item.applicationId === view.application.id)!;
  const other = view.evidence.find(item => item.fieldName === 'identifier' && item.applicationId !== view.application.id)!;
  const previous = { ...own, id: 'another-version', documentVersion: 2 };
  const uncited = { ...other, id: 'uncited', documentId: 'not-cited' };
  const finding = { ...view.findings[0]!, evidenceIds: [own.id, other.id, previous.id] };
  expect(citedDocumentVersions(finding, [other, uncited, own, previous], view.application.id)).toEqual([
    { documentId: own.documentId, documentVersion: own.documentVersion, applicationId: own.applicationId },
    { documentId: own.documentId, documentVersion: 2, applicationId: own.applicationId },
    { documentId: other.documentId, documentVersion: other.documentVersion, applicationId: other.applicationId },
  ]);
});
