import { ApplicationSchema, BorrowerCaseViewSchema, DemoReleaseSchema, DomainErrorSchema, StaffCaseViewSchema, UserSchema } from '@loanwick/contracts';
import { CHECK_TYPES } from '@loanwick/contracts/domain';
import type { CaseAdapter, DomainError, OperationResult, PolicyReadiness, User } from '@loanwick/contracts/domain';
import { DbConnection } from '../generated';
import type * as Native from '../generated/types';
import type { FrontendAdapter, SessionState } from './types';
import { prioritizeBorrowerApplications } from './types';
import { reconcileUploadGrant, UnconfirmedUploadError, uploadWithCapability } from './upload';
import type { UploadGrant, UploadPort } from './upload';

// All SDK-specific conversions live here. Encoding is reversible and collision-free.
export const publicId = (raw: string) => {
  if (/^[A-Za-z0-9_-]{1,100}$/.test(raw)) return `db.r.${raw}`;
  const payment = raw.match(/^([A-Za-z0-9_-]{1,100})\/(\d{1,10})$/);
  if (payment) return `db.p.${payment[1]}.${payment[2]}`;
  return `db.b.${btoa(String.fromCharCode(...new TextEncoder().encode(raw))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
};
export const nativeId = (value: string) => {
  if (value.startsWith('db.r.')) return value.slice(5);
  if (value.startsWith('db.p.')) { const match = value.match(/^db\.p\.([A-Za-z0-9_-]+)\.(\d+)$/); if (match) return `${match[1]}/${match[2]}`; }
  if (!value.startsWith('db.b.')) throw new Error('Choose an application from the live portfolio.');
  return new TextDecoder().decode(Uint8Array.from(atob(value.slice(5).replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)));
};
export function safeCents(value: bigint) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 0) throw new Error('The amount cannot be represented safely. Contact the database owner.'); return result; }
const rows = <T,>(table: { iter(): Iterable<T> }): T[] => Array.from(table.iter());
const appView = (a: Native.Applications) => ApplicationSchema.parse({ ...a, id: publicId(a.id), borrowerUserId: publicId(a.borrowerUserId), organizationId: publicId(a.organizationId), amountCents: safeCents(a.amountCents), createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() });
export const documentView = (d: Native.DocumentSummary) => ({ id: publicId(d.id), applicationId: publicId(d.applicationId), type: d.type, version: d.version, sha256: d.sha256, displayFilename: d.displayFilename, extractionStatus: d.extractionStatus === 'extracted' ? 'succeeded' : d.extractionStatus, uploadedBy: publicId(d.uploadedBy), createdAt: d.createdAt.toISOString() });
const responseView = (r: Native.BorrowerResponses) => ({ ...r, id: publicId(r.id), requestId: publicId(r.requestId), applicationId: publicId(r.applicationId), documentIds: r.documentIds.map(publicId), submittedBy: publicId(r.submittedBy), createdAt: r.createdAt.toISOString() });
const requestView = (r: Native.ClarificationRequests) => ({ id: publicId(r.id), applicationId: publicId(r.applicationId), findingId: publicId(r.findingId), borrowerSafeMessage: r.borrowerSafeMessage, requestedDocumentType: r.requestedDocumentType ?? null, state: r.state, draftedBy: publicId(r.draftedBy), sentBy: r.sentBy ? publicId(r.sentBy) : null, createdAt: r.createdAt.toISOString() });
const releaseView = (r: Native.DemoReleases) => DemoReleaseSchema.parse({ id: publicId(r.id), applicationId: publicId(r.applicationId), idempotencyKey: r.idempotencyKey, releasedBy: publicId(r.releasedBy), releasedAt: r.releasedAt.toISOString(), syntheticAmountCents: safeCents(r.syntheticAmountCents) });

export interface DocumentTransport {
  source(input: { documentId: string; version: number }): Promise<string>;
}
const STAFF_TABLES = ['staff_applications', 'staff_documents', 'staff_evidence', 'staff_collateral', 'staff_entities', 'staff_match_candidates', 'staff_payments', 'staff_jobs', 'staff_tool_events', 'staff_findings', 'staff_clarifications', 'staff_responses', 'staff_reviews', 'staff_audit_events', 'staff_readiness', 'staff_releases'];
const BORROWER_TABLES = ['borrower_applications', 'borrower_documents', 'borrower_clarifications', 'borrower_own_responses', 'my_upload_grants'];

export class LiveAdapter implements FrontendAdapter {
  readonly mode = 'live' as const;
  private connection: DbConnection | null = null;
  private listeners = new Set<() => void>();
  private state: SessionState = { status: 'disconnected', user: null, message: 'Connect an individual authorized database session.' };
  private generation = 0;
  private credentials: { uri: string; database: string; token: string } | null = null;
  private ready = false;
  private queued = false;
  uploadDocument?: ((requestId: string, file: File) => Promise<string>) | undefined;
  private uploads = new Set<AbortController>();
  private pendingUploads = new Map<string, Pick<UploadGrant, 'id' | 'secretHash'>>();
  constructor(private transport?: DocumentTransport) {
    const origin = import.meta.env.VITE_UPLOAD_ORIGIN;
    const workerUserId = import.meta.env.VITE_UPLOAD_WORKER_ID;
    if (origin && workerUserId) this.uploadDocument = (requestId, file) => this.upload(requestId, file, origin, workerUserId);
  }
  private emit() {
    if (this.queued) return; this.queued = true;
    queueMicrotask(() => { this.queued = false; this.listeners.forEach(cb => cb()); });
  }
  subscribeSession(cb: (s: SessionState) => void) { const fn = () => cb({ ...this.state }); this.listeners.add(fn); fn(); return () => { this.listeners.delete(fn); }; }
  connect(uri: string, database: string, token: string) {
    this.disconnect(); this.credentials = { uri, database, token }; const generation = ++this.generation;
    this.state = { status: 'connecting', user: null, message: null }; this.emit();
    try {
      this.connection = DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token)
        .onConnect((connection, identity) => {
          if (generation !== this.generation) { connection.disconnect(); return; }
          connection.subscriptionBuilder().onApplied(() => {
            if (generation !== this.generation) return;
            const nativeUser = rows(connection.db.myUser)[0];
            if (!nativeUser || !['officer', 'reviewer', 'borrower'].includes(nativeUser.role)) { this.state = { status: 'forbidden', user: null, message: 'This identity has no permitted application role. Ask the database owner to provision it.' }; this.emit(); return; }
            const user = UserSchema.parse({ ...nativeUser, id: publicId(nativeUser.id), organizationId: publicId(nativeUser.organizationId), identity: identity.toHexString(), active: true });
            const identityChanged = () => {
              if (generation !== this.generation) return;
              const current = rows(connection.db.myUser)[0];
              if (!current || current.id !== nativeUser.id || current.role !== nativeUser.role || current.organizationId !== nativeUser.organizationId) {
                this.invalidate('forbidden', 'Your authorized session changed. Reconnect before continuing.', true);
              }
            };
            connection.db.myUser.onDelete(identityChanged); connection.db.myUser.onUpdate(identityChanged);
            const tables = user.role === 'borrower' ? BORROWER_TABLES : STAFF_TABLES;
            // Subscribe to permitted server projections only; never to private tables.
            for (const table of Object.values(connection.db)) {
              table.onInsert(() => this.emit()); table.onDelete(() => this.emit()); table.onUpdate(() => this.emit());
            }
            connection.subscriptionBuilder().onApplied(() => {
              if (generation !== this.generation) return;
              const application = user.role === 'borrower' ? this.borrowerApplications(connection)[0] : rows(connection.db.staffApplications).map(a => ({ id: publicId(a.id) }))[0];
              this.ready = true; this.state = { status: 'connected', user, message: null, ...(application ? { defaultApplicationId: application.id } : {}) }; this.emit();
            }).onError(() => this.connectionError(generation, 'The authorized case subscription failed. Reconnect to retry.')).subscribe(tables.map(name => `SELECT * FROM ${name}`));
          }).onError(() => this.connectionError(generation, 'The session subscription failed. Check the database and identity setup.')).subscribe('SELECT * FROM my_user');
        })
        .onConnectError(() => this.connectionError(generation, 'Could not connect. Check the endpoint, database name, and individual token. No fixture fallback was activated.'))
        .onDisconnect(() => this.connectionError(generation, 'The live connection was lost. Reconnect and reconcile pending actions before retrying.'))
        .build();
      setTimeout(() => { if (generation === this.generation && !this.ready && this.state.status === 'connecting') this.connectionError(generation, 'The connection timed out. Check the database endpoint and reconnect.'); }, 15_000);
    } catch { this.connectionError(generation, 'The connection configuration is invalid. Check the endpoint and session setup.'); }
  }
  private invalidate(status: 'disconnected' | 'forbidden', message: string, clearUser = false) {
    this.uploads.forEach(upload => upload.abort()); this.uploads.clear(); this.ready = false;
    this.state = { ...this.state, status, message, ...(clearUser ? { user: null } : {}) }; this.emit();
  }
  private connectionError(generation: number, message: string) { if (generation !== this.generation) return; this.invalidate('disconnected', message); }
  retry() { if (this.credentials) this.connect(this.credentials.uri, this.credentials.database, this.credentials.token); }
  disconnect() { this.generation++; this.uploads.forEach(upload => upload.abort()); this.uploads.clear(); this.ready = false; this.connection?.disconnect(); this.connection = null; this.credentials = null; this.state = { status: 'disconnected', user: null, message: 'Session disconnected. Connect an individual authorized identity.' }; this.emit(); }
  private db() { if (!this.connection || !this.ready) throw new Error('The live connection is not ready. Reconnect before continuing.'); return this.connection; }
  private user(roles: string[]) { const user = this.state.user; if (!user || !roles.includes(user.role)) throw new Error('This action is not available for your authenticated role.'); return user; }
  private watch<T>(get: () => T, cb: (v: T) => void, error: (e: DomainError) => void) {
    const fn = () => { if (!this.ready) { if (this.state.status !== 'connecting') error({ code: 'INVALID_STATE', message: this.state.message ?? 'Disconnected.', correlationId: crypto.randomUUID() }); return; } try { cb(get()); } catch (e) { error(this.error(e, crypto.randomUUID())); } };
    this.listeners.add(fn); fn(); return () => { this.listeners.delete(fn); };
  }
  subscribePortfolio: CaseAdapter['subscribePortfolio'] = (cb, error) => this.watch(() => {
    this.user(['officer', 'reviewer']); const db = this.db().db;
    return rows(db.staffApplications).map(app => ({ application: appView(app), openFindingCount: rows(db.staffFindings).filter(f => f.applicationId === app.id && f.status !== 'resolved').length, lastInvestigationStatus: (rows(db.staffJobs).filter(j => j.applicationId === app.id).sort((a, b) => a.createdAt.toISOString().localeCompare(b.createdAt.toISOString())).at(-1)?.status ?? null) as 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | null }));
  }, cb, error);
  private borrowerApplications(connection: DbConnection) {
    const requests = rows(connection.db.borrowerClarifications);
    return prioritizeBorrowerApplications(rows(connection.db.borrowerApplications).map(a => ({
      ...BorrowerCaseViewSchema.shape.application.parse({ id: publicId(a.id), businessName: a.businessName, amountCents: safeCents(a.amountCents), currency: a.currency, stage: a.stage }),
      pendingRequestCount: requests.filter(r => r.applicationId === a.id && r.state === 'sent').length,
    })));
  }
  subscribeBorrowerApplications: NonNullable<FrontendAdapter['subscribeBorrowerApplications']> = (cb, error) => this.watch(() => {
    this.user(['borrower']); return this.borrowerApplications(this.db());
  }, cb, error);
  subscribeBorrowerCase: CaseAdapter['subscribeBorrowerCase'] = (applicationId, cb, error) => this.watch(() => {
    this.user(['borrower']); const db = this.db().db; const rawId = nativeId(applicationId);
    const a = rows(db.borrowerApplications).find(a => a.id === rawId); if (!a) throw new Error('This case is unavailable for your identity.');
    return BorrowerCaseViewSchema.parse({ application: { id: publicId(a.id), businessName: a.businessName, amountCents: safeCents(a.amountCents), currency: a.currency, stage: a.stage },
      requests: rows(db.borrowerClarifications).filter(r => r.applicationId === rawId).map(r => ({ id: publicId(r.id), applicationId, borrowerSafeMessage: r.borrowerSafeMessage, requestedDocumentType: r.requestedDocumentType ?? null, state: r.state, createdAt: r.sentAt.toISOString() })),
      responses: rows(db.borrowerOwnResponses).filter(r => r.applicationId === rawId).map(responseView), documents: rows(db.borrowerDocuments).filter(d => d.applicationId === rawId).map(d => ({ ...documentView(d), requestId: d.requestId ? publicId(d.requestId) : null })) });
  }, cb, error);
  subscribeCase: CaseAdapter['subscribeCase'] = (applicationId, cb, error) => this.watch(() => this.caseView(applicationId), cb, error);
  private caseView(applicationId: string) {
    const user = this.user(['officer', 'reviewer']); const db = this.db().db; const rawId = nativeId(applicationId);
    const a = rows(db.staffApplications).find(a => a.id === rawId); if (!a) throw new Error('This case is unavailable for your identity.');
    const findings = rows(db.staffFindings).filter(f => f.applicationId === rawId);
    const matches = rows(db.staffMatchCandidates).filter(m => m.leftApplicationId === rawId || m.rightApplicationId === rawId);
    const relatedIds = new Set([...findings.flatMap(f => f.relatedApplicationIds), ...matches.flatMap(m => [m.leftApplicationId, m.rightApplicationId])].filter(id => id !== rawId));
    const visibleIds = new Set([rawId, ...relatedIds]);
    const reviews = rows(db.staffReviews).filter(r => r.applicationId === rawId);
    const ordered = CHECK_TYPES.flatMap(check => reviews.filter(r => r.checkType === check).sort((a, b) => Number(b.superseded) - Number(a.superseded) || a.createdAt.toISOString().localeCompare(b.createdAt.toISOString()) || a.id.localeCompare(b.id)).map((r, i) => ({ id: publicId(r.id), applicationId, checkType: r.checkType, observedRelevantRevision: r.observedRelevantRevision, status: r.status, rationale: r.rationale, evidenceIds: r.evidenceIds.map(publicId), reviewerId: publicId(r.reviewerId), sequence: i + 1, createdAt: r.createdAt.toISOString() })));
    const readiness = rows(db.staffReadiness).find(r => r.applicationId === rawId); if (!readiness) throw new Error('Server release readiness is not available yet.');
    const checks = Object.fromEntries(CHECK_TYPES.map(checkType => {
      const check = readiness.checks.find(c => c.checkType === checkType); if (!check) throw new Error('A required server check is missing.');
      const currentReview = reviews.find(r => r.checkType === checkType && !r.superseded);
      return [checkType, { status: check.status === 'passed' ? 'current' : check.status, currentRevision: check.revision, observedRevision: currentReview?.observedRelevantRevision ?? null, reviewId: currentReview ? publicId(currentReview.id) : null }];
    }));
    const payments = rows(db.staffPayments).filter(p => p.applicationId === rawId).sort((a,b) => a.version-b.version); const payment = payments.at(-1);
    return StaffCaseViewSchema.parse({ application: appView(a),
      documents: rows(db.staffDocuments).filter(d => visibleIds.has(d.applicationId)).map(documentView),
      evidence: rows(db.staffEvidence).filter(e => visibleIds.has(e.applicationId)).map(e => ({ id: publicId(e.id), applicationId: publicId(e.applicationId), documentId: publicId(e.documentId), documentVersion: e.documentVersion, pageNumber: e.pageNumber ?? null, locator: e.locator ?? null, excerpt: e.excerpt, fieldName: e.fieldName ?? null, extractedValue: e.fieldValue ?? null, extractionMethod: e.extractionMethod, createdAt: e.createdAt.toISOString() })),
      collateral: rows(db.staffCollateral).filter(c => c.applicationId === rawId).map(c => ({ id: publicId(c.id), applicationId, identifier: c.identifier, description: c.description, exclusiveOwnershipClaim: c.exclusiveOwnershipClaim, active: c.active, evidenceIds: c.evidenceIds.map(publicId) })),
      findings: findings.map(f => ({ id: publicId(f.id), applicationId, investigationJobId: publicId(f.jobId), findingType: f.type, severity: f.severity, evidenceState: f.evidenceState, title: f.title, explanation: f.explanation, uncertainty: f.uncertainty, suggestedNextStep: f.suggestedNextStep, applicationIds: [...new Set([rawId, ...f.relatedApplicationIds])].map(publicId), evidenceIds: f.evidenceIds.map(publicId), observedRevisions: [{ applicationId, ...f.revisions }, ...f.sources.filter(source => source.applicationId !== rawId).map(source => ({ applicationId: publicId(source.applicationId), ...source.revisions }))], ruleVersion: f.ruleVersion, deduplicationKey: f.deduplicationKey, status: f.status, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() })),
      findingCurrentness: Object.fromEntries(findings.map(f => [publicId(f.id), f.isCurrent])),
      currentDocumentIds: rows(db.staffDocuments).filter(d => visibleIds.has(d.applicationId) && d.current).map(d => publicId(d.id)),
      relationships: matches.map(m => ({ id: publicId(m.id), leftApplicationId: publicId(m.leftApplicationId), rightApplicationId: publicId(m.rightApplicationId), decision: m.decision,
        reason: m.rationale ?? `Matched attributes: ${m.matchedAttributes.join(', ')}. Similarity alone does not confirm identity.`,
        evidenceIds: [...new Set(rows(db.staffEntities).filter(e => e.id === m.leftEntityId || e.id === m.rightEntityId).flatMap(e => e.evidenceIds))].map(publicId),
        reviewedBy: m.reviewerId ? publicId(m.reviewerId) : null, reviewedAt: m.reviewedAt?.toISOString() ?? null })),
      investigations: rows(db.staffJobs).filter(j => j.applicationId === rawId).sort((a,b) => a.createdAt.toISOString().localeCompare(b.createdAt.toISOString())).map(j => ({ id: publicId(j.id), applicationId, runKey: j.runKey, status: j.status, executionMode: j.executionMode, modelId: j.modelId ?? null, errorCode: j.errorCode ?? null, startedAt: j.startedAt?.toISOString() ?? null, completedAt: j.completedAt?.toISOString() ?? null })),
      toolEvents: rows(db.staffToolEvents).filter(e => e.applicationId === rawId).map(e => ({ id: publicId(e.id), investigationJobId: publicId(e.jobId), sequence: e.sequence, toolName: e.toolName, status: e.status === 'started' ? 'running' : e.status, safeInputSummary: e.inputSummary, safeOutputSummary: e.outputSummary, durationMs: e.durationMs, createdAt: e.createdAt.toISOString() })),
      clarificationRequests: rows(db.staffClarifications).filter(r => r.applicationId === rawId).map(requestView), responses: rows(db.staffResponses).filter(r => r.applicationId === rawId).map(responseView), reviews: ordered,
      auditEvents: rows(db.staffAuditEvents).filter(e => e.applicationId === rawId).map(e => ({ ...e, id: publicId(e.id), applicationId, actorId: publicId(e.actorId), createdAt: e.createdAt.toISOString() })),
      readiness: { eligibleByPolicy: readiness.canRelease, canRelease: readiness.canRelease && user.role === 'reviewer', reasons: readiness.reasons.map(code => ({ code, checkType: null })) as PolicyReadiness['reasons'], checks },
      release: rows(db.staffReleases).filter(r => r.applicationId === rawId).map(releaseView)[0] ?? null,
      paymentSummary: payment ? { id: publicId(payment.id), applicationId, version: payment.version, maskedDisplay: payment.maskedDisplay, beneficiaryName: payment.beneficiaryName, evidenceIds: payment.evidenceIds.map(publicId) } : null,
      relatedApplications: rows(db.staffApplications).filter(app => relatedIds.has(app.id)).map(app => ({ id: publicId(app.id), businessName: app.businessName, amountCents: safeCents(app.amountCents), currency: app.currency })),
    });
  }
  private error(e: unknown, correlationId: string): DomainError {
    const message = e instanceof Error ? e.message : 'The operation could not be confirmed.';
    const code = message.match(/\b[A-Z][A-Z_]{3,}\b/)?.[0]; const parsed = DomainErrorSchema.safeParse({ code, message, correlationId });
    return parsed.success ? parsed.data : { code: 'INVALID_STATE', message, correlationId };
  }
  private async operation<T>(correlationId: string, call: () => Promise<void>, observed: () => T | undefined): Promise<OperationResult<T>> {
    const generation = this.generation;
    try {
      await call();
      const value = await new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const check = () => {
          if (generation !== this.generation || !this.ready) { clean(); reject(new Error('The session changed. Reconcile the stored operation before retrying.')); return; }
          try { const result = observed(); if (result !== undefined) { clean(); resolve(result); } } catch (e) { clean(); reject(e); }
        };
        const clean = () => { clearTimeout(timer); this.listeners.delete(check); };
        timer = setTimeout(() => { clean(); reject(new Error('The operation was acknowledged, but its result is not confirmed. Refresh and reconcile it before retrying.')); }, 12_000);
        this.listeners.add(check); check();
      });
      return { ok: true, value, correlationId };
    } catch (e) { return { ok: false, error: this.error(e, correlationId) }; }
  }
  requestInvestigation: CaseAdapter['requestInvestigation'] = input => {
    const rawId = nativeId(input.applicationId);
    return this.operation(input.correlationId, () => { this.user(['officer']); return this.db().reducers.requestInvestigation({ applicationId: rawId, runKey: input.correlationId, executionMode: input.executionMode, modelId: undefined }); }, () => {
      const job = rows(this.db().db.staffJobs).find(j => j.applicationId === rawId && j.runKey === input.correlationId); return job ? { jobId: publicId(job.id) } : undefined;
    });
  };
  createClarificationDraft: CaseAdapter['createClarificationDraft'] = async input => {
    // The current backend accepts templates only. Reject edits it cannot persist.
    const templates: Record<string, { key: string; message: string }> = {
      collateral_schedule: { key: 'collateral', message: 'Please confirm the equipment you intend to pledge and provide an updated schedule or proof of ownership.' },
      financial_statement: { key: 'financials', message: 'Please provide a current financial statement and confirm the reporting period it covers.' },
      supporting_document: { key: 'supporting', message: 'Please clarify the information in your application and provide supporting documentation if available.' },
    };
    const template = templates[input.requestedDocumentType ?? 'supporting_document'];
    if (!template || input.borrowerSafeMessage !== template.message) return { ok: false, error: { code: 'INVALID_STATE', message: 'This connection accepts standard request templates only. No substituted message was sent.', correlationId: input.correlationId } };
    const requestId = crypto.randomUUID();
    return this.operation(input.correlationId, () => { this.user(['officer']); return this.db().reducers.createClarificationDraft({ requestId, findingId: nativeId(input.findingId), template: template.key }); }, () => rows(this.db().db.staffClarifications).some(r => r.id === requestId) ? { requestId: publicId(requestId) } : undefined);
  };
  sendClarification: CaseAdapter['sendClarification'] = async input => {
    const requestId = nativeId(input.requestId); const request = rows(this.db().db.staffClarifications).find(r => r.id === requestId);
    if (!request || request.borrowerSafeMessage !== input.borrowerSafeMessage) return { ok: false, error: { code: 'INVALID_STATE', message: 'The stored draft differs from the preview. Review the current draft before sending.', correlationId: input.correlationId } };
    return this.operation(input.correlationId, () => { this.user(['officer']); return this.db().reducers.sendClarification({ requestId }); }, () => rows(this.db().db.staffClarifications).some(r => r.id === requestId && r.state === 'sent') ? { correlationId: input.correlationId } : undefined);
  };
  submitBorrowerResponse: CaseAdapter['submitBorrowerResponse'] = input => {
    const before = new Set(rows(this.db().db.borrowerOwnResponses).map(r => r.id));
    return this.operation(input.correlationId, () => { this.user(['borrower']); return this.db().reducers.submitBorrowerResponse({ requestId: nativeId(input.requestId), message: input.message, documentIds: input.documentIds.map(nativeId) }); }, () => rows(this.db().db.borrowerOwnResponses).some(r => !before.has(r.id) && r.requestId === nativeId(input.requestId)) ? { correlationId: input.correlationId } : undefined);
  };
  decideFinding: CaseAdapter['decideFinding'] = input => this.operation(input.correlationId, () => {
    this.user(['officer', 'reviewer']); const finding = rows(this.db().db.staffFindings).find(f => f.id === nativeId(input.findingId));
    return this.db().reducers.decideFinding({ findingId: nativeId(input.findingId), decision: input.decision === 'resolved' ? 'resolve' : input.decision, rationale: input.rationale, evidenceIds: finding?.evidenceIds ?? [] });
  }, () => rows(this.db().db.staffFindings).some(f => f.id === nativeId(input.findingId) && f.status === (input.decision === 'resolved' ? 'resolved' : input.decision === 'reopen' ? 'open' : 'escalated')) ? { correlationId: input.correlationId } : undefined);
  recordReview: CaseAdapter['recordReview'] = input => {
    const before = new Set(rows(this.db().db.staffReviews).map(r => r.id));
    return this.operation(input.correlationId, () => { this.user(['reviewer']); return this.db().reducers.recordReview({ applicationId: nativeId(input.applicationId), checkType: input.checkType, expectedRevision: input.observedRelevantRevision, status: input.status ?? 'passed', rationale: input.rationale, evidenceIds: input.evidenceIds.map(nativeId) }); }, () => rows(this.db().db.staffReviews).some(r => !before.has(r.id) && r.applicationId === nativeId(input.applicationId) && r.checkType === input.checkType && r.observedRelevantRevision === input.observedRelevantRevision && !r.superseded) ? { correlationId: input.correlationId } : undefined);
  };
  changePaymentInstructions: CaseAdapter['changePaymentInstructions'] = input => this.operation(input.correlationId, () => {
    this.user(['reviewer']); if (!/^demo_[a-zA-Z0-9_-]{1,64}$/.test(input.syntheticAccountToken)) throw new Error('Use a demo_ prefixed synthetic account token for this database.');
    const supporting = rows(this.db().db.staffEvidence).some(e => input.evidenceIds.includes(publicId(e.id)) && e.applicationId === nativeId(input.applicationId) && e.fieldName === 'syntheticAccountToken' && e.fieldValue === input.syntheticAccountToken && rows(this.db().db.staffDocuments).some(d => d.id === e.documentId && d.current && d.type === 'payment_instructions'));
    if (!supporting) throw new Error('Select a current payment source whose account token matches these instructions.');
    return this.db().reducers.changePaymentInstructions({ applicationId: nativeId(input.applicationId), expectedPaymentRevision: input.observedPaymentRevision, syntheticAccountToken: input.syntheticAccountToken, maskedDisplay: '**** 0001', beneficiaryName: input.beneficiaryName, evidenceIds: input.evidenceIds.map(nativeId) });
  }, () => rows(this.db().db.staffPayments).some(p => p.applicationId === nativeId(input.applicationId) && p.version === input.observedPaymentRevision + 1) ? { correlationId: input.correlationId } : undefined);
  simulateRelease: CaseAdapter['simulateRelease'] = input => this.operation(input.correlationId, () => { this.user(['reviewer']); return this.db().reducers.simulateRelease({ applicationId: nativeId(input.applicationId), idempotencyKey: input.idempotencyKey }); }, () => {
    const result = rows(this.db().db.staffReleases).find(r => r.applicationId === nativeId(input.applicationId) && r.idempotencyKey === input.idempotencyKey); return result ? releaseView(result) : undefined;
  });
  private uploadKey(requestId: string) { return `${this.state.user?.id ?? ''}|${nativeId(requestId)}`; }
  uploadNeedsReconciliation(requestId: string) {
    if (!this.ready || this.state.user?.role !== 'borrower') return false;
    const rawRequest = nativeId(requestId);
    return this.pendingUploads.has(this.uploadKey(requestId)) || rows(this.db().db.myUploadGrants).some(g => g.requestId === rawRequest && (g.status === 'ready' || g.status === 'claimed' || (g.status === 'attached' && g.attachedDocumentId && !rows(this.db().db.borrowerDocuments).some(d => d.id === g.attachedDocumentId))));
  }
  async reconcileUpload(requestId: string): Promise<string | null> {
    const actor = this.user(['borrower']); const generation = this.generation; const key = this.uploadKey(requestId);
    const rawRequest = nativeId(requestId);
    const request = rows(this.db().db.borrowerClarifications).find(r => r.id === rawRequest);
    if (!request) throw new Error('The request is not available for this session.');
    const guard = () => { if (generation !== this.generation || this.state.user?.id !== actor.id) throw new Error('Reconnect before reconciling the prior upload.'); this.db(); };
    const unwrap = <T,>(result: OperationResult<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
    const port: UploadPort = {
      create: async () => { throw new Error('Reconciliation never creates a new capability.'); },
      revoke: async grantId => { guard(); await this.db().reducers.revokeUpload({ grantId }); },
      observe: async (hash, predicate) => unwrap(await this.operation(crypto.randomUUID(), async () => { guard(); }, () => { guard(); const g = rows(this.db().db.myUploadGrants).find(g => g.secretHash === hash); return g && predicate(g) ? g : undefined; })),
    };
    const candidates = rows(this.db().db.myUploadGrants).filter(g => g.requestId === rawRequest && g.applicationId === request.applicationId && g.status !== 'revoked');
    const pending = this.pendingUploads.get(key);
    const attempts = [...candidates, ...(pending && !candidates.some(g => g.id === pending.id) ? [pending] : [])];
    for (const attempt of attempts) {
      const documentId = await reconcileUploadGrant(port, attempt);
      if (documentId) {
        const confirmed = unwrap(await this.operation(crypto.randomUUID(), async () => { guard(); }, () => { guard(); return rows(this.db().db.borrowerDocuments).some(d => d.id === documentId && d.requestId === rawRequest && d.applicationId === request.applicationId && d.uploadedBy === nativeId(actor.id)) ? publicId(documentId) : undefined; }));
        this.pendingUploads.delete(key); this.emit(); return confirmed;
      }
    }
    this.pendingUploads.delete(key); this.emit(); return null;
  }
  private async upload(requestId: string, file: File, origin: string, workerUserId: string) {
    const actor = this.user(['borrower']); const generation = this.generation; const key = this.uploadKey(requestId);
    if (this.uploadNeedsReconciliation(requestId)) throw new Error('Reconcile the previous upload before selecting another document.');
    if (rows(this.db().db.borrowerDocuments).some(d => d.requestId === nativeId(requestId) && d.uploadedBy === nativeId(actor.id))) throw new Error('A document is already attached to this request. Refresh and review it before selecting another file.');
    const request = rows(this.db().db.borrowerClarifications).find(r => r.id === nativeId(requestId) && r.state === 'sent');
    if (!request) throw new Error('This request is not available for document intake.');
    const guard = () => { if (generation !== this.generation || actor.id !== this.state.user?.id) throw new Error('The session changed. Reconnect before continuing.'); this.db(); };
    const unwrap = <T,>(result: OperationResult<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
    const observe = async (secretHash: string, predicate: (grant: UploadGrant) => boolean) => unwrap(await this.operation(crypto.randomUUID(), async () => { guard(); }, () => {
      guard(); const grant = rows(this.db().db.myUploadGrants).find(g => g.secretHash === secretHash); return grant && predicate(grant) ? grant : undefined;
    }));
    const port: UploadPort = {
      create: async input => unwrap(await this.operation(crypto.randomUUID(), () => { guard(); return this.db().reducers.authorizeUpload(input); }, () => {
        guard(); return rows(this.db().db.myUploadGrants).find(g => g.secretHash === input.secretHash && g.applicationId === request.applicationId && g.requestId === request.id && g.status === 'ready');
      })),
      observe,
      revoke: async grantId => { guard(); await this.db().reducers.revokeUpload({ grantId }); },
    };
    const controller = new AbortController(); this.uploads.add(controller);
    try {
      const documentId = await uploadWithCapability({ file, origin, applicationId: request.applicationId, requestId: request.id, documentType: request.requestedDocumentType ?? 'supporting_document', workerUserId, port, signal: controller.signal });
      return unwrap(await this.operation(crypto.randomUUID(), async () => { guard(); }, () => {
        guard(); const document = rows(this.db().db.borrowerDocuments).find(d => d.id === documentId && d.applicationId === request.applicationId && d.requestId === request.id && d.uploadedBy === nativeId(actor.id));
        return document ? publicId(document.id) : undefined;
      }));
    } catch (error) { if (error instanceof UnconfirmedUploadError) { this.pendingUploads.set(key, error.attempt); this.emit(); } throw error; } finally { this.uploads.delete(controller); }
  }
  async source(documentId: string, version: number) {
    this.db(); if (!this.transport) throw new Error('Source downloads are unavailable for this connection. Stored evidence excerpts remain available.');
    return this.transport.source({ documentId: nativeId(documentId), version });
  }
}
