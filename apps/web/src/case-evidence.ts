import type { Evidence, PresentedFinding } from '@loanwick/contracts/domain';

function money(cents: number | undefined, currency: string | undefined): string | null {
  if (cents === undefined || !Number.isSafeInteger(cents) || cents < 0 || !currency) return null;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); }
  catch { return null; }
}

export function presentCaseFinding(finding: PresentedFinding) {
  const equipment = finding.facts?.normalizedIdentifier ? `equipment ${finding.facts.normalizedIdentifier}` : 'the same equipment';
  if (finding.findingType === 'collateral_conflict') return {
    title: 'More than one business says it fully owns the same equipment',
    summary: `The applications below each list ${equipment} as fully owned by that business. Check who owns it before making a decision.`,
    why: 'The documents have not been independently checked. A typing error, an old equipment list, or a change of owner could explain this. It does not prove fraud.',
    nextStep: 'Ask the applicant for a current ownership document, such as a bill of sale or title, and an updated equipment list. Review their response before deciding.',
  };
  if (finding.findingType === 'collateral_ownership_unknown') return {
    title: 'The same equipment is listed on more than one application',
    summary: `The applications below list ${equipment}, but the documents do not clearly show who owns it.`,
    why: 'The equipment could be shared, leased, or missing ownership paperwork. The available documents do not confirm which explanation applies.',
    nextStep: 'Ask the applicant to confirm who owns the equipment and provide a current ownership document and updated equipment list.',
  };
  const total = money(finding.facts?.totalCents, finding.facts?.currency);
  const limit = money(finding.facts?.thresholdCents, finding.facts?.currency);
  return {
    title: 'Review these connected businesses together',
    summary: total && limit ? `These connected applications request ${total} in total, above the ${limit} combined review limit.` : 'These connected applications need to be reviewed together against the combined loan review limit.',
    why: 'Connected businesses are considered together under the review policy. This is a policy check, not evidence of wrongdoing.',
    nextStep: 'Have an authorized loan reviewer check the connected applications and their combined requested amount.',
  };
}

export function presentCaseEvidence(evidence: Evidence, documentEvidence: Evidence[], equipmentNumber?: string) {
  const raw = evidence.extractedValue?.trim();
  const missing = 'Not stated in this document';
  switch (evidence.fieldName) {
    case 'identifier': {
      const matches = raw && equipmentNumber && raw.toUpperCase() === equipmentNumber;
      return { label: 'Equipment number', value: matches ? equipmentNumber : raw || missing, note: matches && raw !== equipmentNumber ? `Written as “${raw}” in the document.` : null };
    }
    case 'exclusiveOwnershipClaim': return { label: 'Who owns the equipment?', value: raw === 'true' ? 'Borrower says they fully own it' : raw === 'false' ? 'Borrower does not claim full ownership' : missing };
    case 'activeCollateralClaim': return { label: 'Use for this loan', value: raw === 'true' ? 'Offered as security for this loan' : raw === 'false' ? 'No longer offered as security for this loan' : missing };
    case 'amountCents': {
      // Only the same document/version can supply the currency for this amount.
      const currency = documentEvidence.find(item => item.documentId === evidence.documentId && item.documentVersion === evidence.documentVersion && item.applicationId === evidence.applicationId && item.fieldName === 'currency')?.extractedValue;
      return { label: 'Requested loan amount', value: raw ? (/^\d+$/.test(raw) ? money(Number(raw), currency ?? undefined) : null) ?? 'Amount needs checking in the document' : missing };
    }
    case 'currency': return { label: 'Loan currency', value: raw === 'USD' ? 'US dollars (USD)' : raw || missing };
    case 'confirmedGroup': return { label: 'Business group', value: raw || missing };
    case 'address': return { label: 'Business address', value: raw || missing };
    case 'syntheticRegistrationId': return { label: 'Business registration number', value: raw || missing };
    case 'syntheticAccountToken': return { label: 'Payment account reference', value: raw || missing };
    default: return { label: 'Document detail', value: raw || 'See the exact document excerpt below' };
  }
}

export function evidenceStateLabel(state: PresentedFinding['evidenceState']) {
  return { supported: 'Shown in the documents', contradicted: 'Records need checking', unknown: 'Not yet confirmed' }[state];
}

export function citedDocumentVersions(finding: PresentedFinding, evidence: Evidence[], ownApplicationId: string) {
  const cited = new Set(finding.evidenceIds);
  const versions = new Map(evidence.filter(item => cited.has(item.id)).map(item => [
    JSON.stringify([item.documentId, item.documentVersion]),
    { documentId: item.documentId, documentVersion: item.documentVersion, applicationId: item.applicationId },
  ]));
  return [...versions.values()].sort((a, b) => Number(b.applicationId === ownApplicationId) - Number(a.applicationId === ownApplicationId));
}
