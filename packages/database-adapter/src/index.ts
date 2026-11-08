import { AnalysisSnapshotSchema, validateCheckResults } from '@loanwick/contracts';
import type { AnalysisSnapshot, CheckResult, RevisionVector } from '@loanwick/contracts';

interface TimestampLike { toISOString(): string }
interface RawEvidence {
  id: string; applicationId: string; documentId: string; documentVersion: number;
  pageNumber?: number | undefined; locator?: string | undefined; excerpt: string;
  fieldName?: string | undefined; fieldValue?: string | undefined; extractionMethod: string; createdAt: TimestampLike;
}
export interface DatabaseWorkerSnapshot {
  id: string; applicationId: string; inputsCurrent: boolean; revisions: RevisionVector;
  sources: readonly { applicationId: string; revisions: RevisionVector }[];
  applications: readonly { id: string; businessName: string; amountCents: bigint; currency: string; stage: string; revisions: RevisionVector }[];
  documents: readonly { id: string; applicationId: string; type: string; version: number; sha256: string; displayFilename: string; extractionStatus: string; createdAt: TimestampLike; uploadedBy: string }[];
  evidence: readonly RawEvidence[];
  collateral: readonly { id: string; applicationId: string; identifier: string; description: string; exclusiveOwnershipClaim: boolean; active: boolean; evidenceIds: readonly string[] }[];
  relationships: readonly { id: string; leftApplicationId: string; rightApplicationId: string; decision: string; evidenceIds: readonly string[] }[];
}
export interface DatabaseFindingInput {
  type: string; severity: string; evidenceState: string; title: string; explanation: string;
  uncertainty: string; suggestedNextStep: string; evidenceIds: string[]; relatedApplicationIds: string[];
  ruleVersion: string; deduplicationKey: string;
}
export class DatabaseAdapterError extends Error {
  constructor(public readonly code: 'INVALID_INPUT' | 'STALE_RESULTS', message: string) {
    super(message); this.name = 'DatabaseAdapterError';
  }
}
export function toSafeCents(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new DatabaseAdapterError('INVALID_INPUT', 'Database money exceeds safe integer cents');
  return Number(value);
}
const sameRevisions = (a: RevisionVector, b: RevisionVector) => a.applicationRevision === b.applicationRevision && a.collateralRevision === b.collateralRevision && a.paymentRevision === b.paymentRevision;

// Only call with a row received through an authenticated worker_snapshots subscription.
// The namespace is explicit because the legacy DB does not yet store assetType.
export function toAnalysisSnapshot(raw: DatabaseWorkerSnapshot, options: { assetTypeNamespace: string }): AnalysisSnapshot {
  if (!raw.inputsCurrent) throw new DatabaseAdapterError('STALE_RESULTS', 'Database reports stale investigation inputs');
  if (!options.assetTypeNamespace.trim()) throw new DatabaseAdapterError('INVALID_INPUT', 'An explicit legacy asset namespace is required');
  const captured = [{ applicationId: raw.applicationId, revisions: raw.revisions }, ...raw.sources];
  if (new Set(captured.map(r => r.applicationId)).size !== captured.length || captured.length !== raw.applications.length) throw new DatabaseAdapterError('STALE_RESULTS', 'Source membership does not match the claim');
  for (const source of captured) {
    const app = raw.applications.find(a => a.id === source.applicationId);
    if (!app || !sameRevisions(source.revisions, app.revisions)) throw new DatabaseAdapterError('STALE_RESULTS', 'Source revisions do not match the claim');
  }
  const statuses: Record<string, string> = { extracted: 'succeeded', succeeded: 'succeeded', pending: 'pending', failed: 'failed', unsupported: 'unsupported' };
  const evidence = raw.evidence.map(e => ({
    id: e.id, applicationId: e.applicationId, documentId: e.documentId, documentVersion: e.documentVersion,
    pageNumber: e.pageNumber ?? null, locator: e.locator ?? null, excerpt: e.excerpt,
    fieldName: e.fieldName === 'equipment_identifier' ? 'identifier' : e.fieldName ?? null,
    extractedValue: e.fieldValue ?? null, extractionMethod: e.extractionMethod, createdAt: e.createdAt.toISOString(),
  }));
  const byId = new Map(evidence.map(e => [e.id, e]));
  return AnalysisSnapshotSchema.parse({
    applicationId: raw.applicationId,
    applications: raw.applications.map(a => ({ id: a.id, businessName: a.businessName, amountCents: toSafeCents(a.amountCents), currency: a.currency, stage: a.stage, ...a.revisions })),
    documents: raw.documents.map(d => ({ id: d.id, applicationId: d.applicationId, type: d.type, version: d.version, sha256: d.sha256, displayFilename: d.displayFilename,
      extractionStatus: statuses[d.extractionStatus] ?? d.extractionStatus, createdAt: d.createdAt.toISOString(), uploadedBy: d.uploadedBy })),
    evidence,
    collateral: raw.collateral.map(c => ({ id: c.id, applicationId: c.applicationId, assetType: options.assetTypeNamespace, identifier: c.identifier, description: c.description,
      exclusiveOwnershipClaim: c.exclusiveOwnershipClaim, active: c.active, evidenceIds: [...c.evidenceIds],
      ownershipEvidenceIds: c.evidenceIds.filter(id => { const e = byId.get(id); return e?.applicationId === c.applicationId && e.fieldName === 'exclusiveOwnershipClaim' && e.extractedValue === 'true'; }),
    })),
    // Confirmation comes from the server view, never from a model assertion.
    relationships: raw.relationships.map(r => ({ id: r.id, leftApplicationId: r.leftApplicationId, rightApplicationId: r.rightApplicationId,
      decision: r.decision, reason: 'Confirmed relationship supplied by the authorized database view', evidenceIds: [...r.evidenceIds], confirmationSource: 'authorized_projection' })),
    reviews: [], // The current worker projection does not expose review history.
  });
}
export async function toDatabaseFindings(snapshot: AnalysisSnapshot, input: readonly CheckResult[]): Promise<DatabaseFindingInput[]> {
  const results = validateCheckResults(snapshot, input);
  if (results.length > 20) throw new DatabaseAdapterError('INVALID_INPUT', 'Database accepts at most 20 findings per completion');
  return Promise.all(results.map(async result => {
    for (const [text, max] of [[result.title, 140], [result.explanation, 1600], [result.uncertainty, 500], [result.suggestedNextStep, 500], [result.ruleVersion, 80]] as const) {
      if (text.length > max) throw new DatabaseAdapterError('INVALID_INPUT', 'Finding text exceeds the database write limit');
    }
    const relatedApplicationIds = result.applicationIds.filter(id => id !== snapshot.applicationId);
    if (result.evidenceIds.length > 32 || relatedApplicationIds.length > 32) throw new DatabaseAdapterError('INVALID_INPUT', 'Finding sources exceed the database write limit');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.deduplicationKey));
    const deduplicationKey = 'analysis-' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { type: result.findingType, severity: result.severity, evidenceState: result.evidenceState, title: result.title,
      explanation: result.explanation, uncertainty: result.uncertainty, suggestedNextStep: result.suggestedNextStep,
      evidenceIds: [...result.evidenceIds], relatedApplicationIds, ruleVersion: result.ruleVersion, deduplicationKey };
  }));
}
