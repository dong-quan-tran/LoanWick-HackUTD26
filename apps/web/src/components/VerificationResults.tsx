import { hasLiveExplanation } from '../adapters/verification-service';
import type { VerificationResult } from '../adapters/verification-service';
import { Icon } from './Icon';
import styles from '../ContractVerification.module.css';

function amount(cents: number | null, currency: string | null) {
  if (cents === null || !currency || !/^[A-Z]{3}$/.test(currency)) return 'Not fully extracted';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function VerificationResults({ result }: { result: VerificationResult }) {
  const fields = result.extracted;
  const missingId = result.source === 'uploaded-contract' && !fields?.identifier;
  const ai = hasLiveExplanation(result);
  const title = missingId ? 'Equipment ID needs clarification' : result.findings.length
    ? `${result.findings.length} concern${result.findings.length === 1 ? '' : 's'} returned`
    : 'No concern returned by these checks';
  return <section className={styles.result} aria-label="Worker results">
    <div><Icon name={result.findings.length || missingId ? 'alert' : 'check'} size={22} /><h2>{title}</h2></div>
    <p>{result.source === 'uploaded-contract' ? 'Results for your uploaded PDF.' : 'Results for the server sample case.'} Comparison uses synthetic demo loans, not live cloud database records. Verification does not approve a loan.</p>
    {fields && <><h3>Extracted from your PDF</h3><dl className={styles.extracted}>
      <div><dt>Business</dt><dd>{fields.businessName ?? 'Not extracted'}</dd></div>
      <div><dt>Requested amount</dt><dd>{amount(fields.amountCents, fields.currency)}</dd></div>
      <div><dt>Equipment ID</dt><dd>{fields.identifier ?? 'Not extracted — clarification needed'}</dd></div>
      <div><dt>Ownership</dt><dd>{fields.exclusiveOwnershipClaim ? 'Exclusive ownership claimed' : 'Exclusive ownership not confirmed'}</dd></div>
    </dl></>}
    {result.findings.map((finding, index) => <details key={index} open><summary>{finding.title}</summary><p>{finding.relatedBusinessNames.length ? `Related borrowers: ${finding.relatedBusinessNames.join(', ')}.` : 'Review the supporting application records.'}</p></details>)}
    {result.comparedWith && <details><summary>Compared with {result.comparedWith.length} demo loans</summary><ul>{result.comparedWith.map(loan => <li key={loan.id}>{loan.businessName}</li>)}</ul></details>}
    <h3>{ai ? 'AI explanation' : 'AI explanation unavailable'}</h3>
    <p>{ai ? result.assistantSummary : 'A successful live AI explanation was not returned. The findings above come from deterministic checks.'}</p>
    {ai && <small>Model: {result.model}</small>}
  </section>;
}
