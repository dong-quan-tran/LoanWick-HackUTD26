// Development-only simulator. Never imported by the live entry point.
import { z } from 'zod';
import {
  AuditEventSchema, BorrowerCaseViewSchema, BorrowerResponseSchema, ClarificationRequestSchema,
  DemoReleaseSchema, FindingSchema, InvestigationJobSchema, InvestigationSnapshotSchema,
  PaymentInstructionSchema, StaffCaseViewSchema, ToolEventSchema,
} from '@loanwick/contracts';
import { analyzeSnapshot, captureSourceRevisions, getChangedSourceIds, getPolicyReadiness, REVIEW_REVISION_MAP } from '@loanwick/analysis';
import type { Application, CaseAdapter, CheckType, DomainError, Finding, OperationResult, SourceRevision, User } from '@loanwick/contracts/domain';
import baseline from '../../../../fixtures/applications/demo.json';
import manifest from '../../../../fixtures/manifest.json';
import paymentSeed from './payment-seed.json';
import type { FrontendAdapter, SessionState } from './types';
import { prioritizeBorrowerApplications } from './types';

const sourceFiles = import.meta.glob('../../../../fixtures/documents/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const StateSchema = z.strictObject({
  version: z.literal(1), snapshot: InvestigationSnapshotSchema,
  findings: z.array(FindingSchema), jobs: z.array(InvestigationJobSchema), events: z.array(ToolEventSchema),
  requests: z.array(ClarificationRequestSchema), responses: z.array(BorrowerResponseSchema),
  audit: z.array(AuditEventSchema), releases: z.array(DemoReleaseSchema), payments: z.array(PaymentInstructionSchema),
  sources: z.record(z.string(), z.string()),
  corrections: z.record(z.string(), z.string()).default({}),
});
type State = z.infer<typeof StateSchema>;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const STORAGE_KEY = 'loanwick.fixture.v1';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const fail = (code: DomainError['code'], message: string): never => { throw Object.assign(new Error(message), { code }); };
const requireText = (value: string, label: string, max = 1600) => {
  if (!value.trim() || value.length > max) fail('INVALID_INPUT', `${label} is required and must be at most ${max} characters.`);
  return value.trim();
};
function seed(): State {
  const snapshot = InvestigationSnapshotSchema.parse(structuredClone(baseline));
  for (const item of paymentSeed) {
    snapshot.documents.push(StateSchema.shape.snapshot.shape.documents.element.parse(item.document));
    snapshot.evidence.push(StateSchema.shape.snapshot.shape.evidence.element.parse(item.evidence));
  }
  const findings: Finding[] = snapshot.applications.flatMap(app => analyzeSnapshot({ ...snapshot, applicationId: app.id }).results.map(result => ({
    ...result, id: id(), applicationId: app.id, investigationJobId: null, status: 'open' as const, createdAt: now(), updatedAt: now(),
  })));
  const sources = Object.fromEntries(snapshot.documents.map(doc => [doc.id, Object.entries(sourceFiles).find(([path]) => path.endsWith(`/${doc.displayFilename}`))?.[1] ?? '']));
  for (const item of paymentSeed) sources[item.document.id] = item.source;
  return { version: 1, snapshot, findings, sources, corrections: {}, jobs: [], events: [], requests: [], responses: [], audit: [], releases: [], payments: paymentSeed.map(item => PaymentInstructionSchema.parse(item.payment)) };
}

export class FixtureAdapter implements FrontendAdapter {
  readonly mode = 'fixture' as const;
  startupNotice?: string;
  private state: State;
  private user: User = manifest.identities.find(u => u.role === 'officer') as User;
  private listeners = new Set<() => void>();
  private failure: 'none' | 'offline' | 'investigation' = 'none';
  private operationQueue: Promise<unknown> = Promise.resolve();
  constructor(private storage?: StoragePort) {
    this.state = seed();
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      if (saved) this.state = StateSchema.parse(JSON.parse(saved));
      const identity = storage?.getItem('loanwick.fixture.identity.v1');
      const restoredUser = manifest.identities.find(u => u.id === identity && ['officer', 'reviewer', 'borrower'].includes(u.role));
      if (restoredUser) this.user = structuredClone(restoredUser) as User;
    } catch {
      try { storage?.removeItem(STORAGE_KEY); } catch { /* Storage can be unavailable in restricted browsers. */ }
      this.startupNotice = 'The saved demo was incompatible or damaged. A fresh synthetic scenario has been restored.';
    }
  }
  private emit() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch { this.startupNotice = 'Demo storage is unavailable. Changes will last until this page reloads.'; }
    this.listeners.forEach(fn => fn());
  }
  private watch(fn: () => void) { this.listeners.add(fn); fn(); return () => { this.listeners.delete(fn); }; }
  private session(): SessionState { return { status: this.failure === 'offline' ? 'disconnected' : 'connected', user: this.user, message: this.failure === 'offline' ? 'The fixture connection is disconnected. Retry to resume.' : null }; }
  subscribeSession = (cb: (s: SessionState) => void) => this.watch(() => cb(this.session()));
  selectIdentity(role: 'officer' | 'borrower' | 'reviewer', applicationId: string) {
    const app = this.app(applicationId);
    this.user = structuredClone(manifest.identities.find(u => role === 'borrower' ? u.id === app.borrowerUserId : u.role === role) as User);
    try { this.storage?.setItem('loanwick.fixture.identity.v1', this.user.id); } catch { /* In-memory identity still works. */ }
    this.emit();
  }
  reset() { this.state = seed(); this.failure = 'none'; this.user = manifest.identities.find(u => u.role === 'officer') as User; try { this.storage?.removeItem('loanwick.fixture.identity.v1'); } catch { /* In-memory reset still works. */ } this.emit(); }
  setFailure(failure: 'none' | 'offline' | 'investigation') { this.failure = failure; this.emit(); }
  retry() { this.failure = 'none'; this.emit(); }
  disconnect() { this.failure = 'offline'; this.emit(); }
  private app(applicationId: string) { return this.state.snapshot.applications.find(a => a.id === applicationId) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'This case is unavailable.'); }
  private authorize(applicationId: string, roles: string[]) {
    if (this.failure === 'offline') fail('INVALID_STATE', 'Disconnected. Retry the connection before continuing.');
    const app = this.app(applicationId);
    if (!roles.includes(this.user.role) || this.user.organizationId !== app.organizationId || (this.user.role === 'borrower' && app.borrowerUserId !== this.user.id)) fail('NOT_FOUND_OR_FORBIDDEN', 'This action is not available for this session.');
    return app;
  }
  private editable(app: Application) { if (app.stage === 'released_demo') fail('ALREADY_RELEASED', 'This case has already been released. Its inputs are locked.'); }
  private audit(applicationId: string, action: string, safeDetails: string) {
    this.state.audit.push({ id: id(), applicationId, actorId: this.user.id, action, safeDetails, createdAt: now() });
  }
  private change(app: Application, kind: 'collateral' | 'payment' | 'other') {
    app.applicationRevision++; if (kind === 'collateral') app.collateralRevision++; if (kind === 'payment') app.paymentRevision++;
    app.updatedAt = now(); if (app.stage !== 'clarification_needed') app.stage = 'reviewing';
  }
  private current(revisions: SourceRevision[]) { return getChangedSourceIds(revisions, captureSourceRevisions(this.state.snapshot.applications)).length === 0; }
  private readiness(app: Application) {
    const policy = getPolicyReadiness({ application: app, reviews: this.state.snapshot.reviews, findings: this.state.findings, releases: this.state.releases });
    const reasons = [...policy.reasons];
    const job = this.state.jobs.filter(j => j.applicationId === app.id).at(-1);
    if (!job) reasons.push({ code: 'INVESTIGATION_MISSING', checkType: null });
    else if (job.status === 'queued' || job.status === 'running') reasons.push({ code: 'INVESTIGATION_PENDING', checkType: null });
    else if (job.status !== 'succeeded' || !this.current(job.capturedRevisions)) reasons.push({ code: 'INVESTIGATION_STALE', checkType: null });
    if (this.state.requests.some(r => r.applicationId === app.id && (r.state === 'sent' || r.state === 'answered'))) reasons.push({ code: 'CLARIFICATION_PENDING', checkType: null });
    const payment = this.state.payments.filter(p => p.applicationId === app.id).at(-1);
    const review = this.state.snapshot.reviews.filter(r => r.applicationId === app.id && r.checkType === 'payment_verification').sort((a,b) => b.sequence-a.sequence)[0];
    if (policy.checks.payment_verification.status === 'current' && (!payment || !review || !payment.evidenceIds.some(e => review.evidenceIds.includes(e)))) reasons.push({ code: 'PAYMENT_EVIDENCE_REQUIRED', checkType: 'payment_verification' });
    const eligibleByPolicy = reasons.length === 0;
    return { ...policy, eligibleByPolicy, reasons, canRelease: eligibleByPolicy && this.user.role === 'reviewer' };
  }
  private staffView(applicationId: string) {
    const app = this.authorize(applicationId, ['officer', 'reviewer']);
    const findings = this.state.findings.filter(f => f.applicationId === app.id);
    const relationships = this.state.snapshot.relationships.filter(r => r.leftApplicationId === app.id || r.rightApplicationId === app.id);
    const relatedIds = new Set([...findings.flatMap(f => f.applicationIds), ...relationships.flatMap(r => [r.leftApplicationId, r.rightApplicationId])]);
    const visible = new Set([app.id, ...relatedIds]);
    const payment = this.state.payments.filter(p => p.applicationId === app.id).at(-1);
    return StaffCaseViewSchema.parse({
      application: app, documents: this.state.snapshot.documents.filter(d => visible.has(d.applicationId)), evidence: this.state.snapshot.evidence.filter(e => visible.has(e.applicationId)),
      collateral: this.state.snapshot.collateral.filter(c => c.applicationId === app.id), findings, relationships,
      investigations: this.state.jobs.filter(j => j.applicationId === app.id).map(({ id, applicationId, runKey, status, executionMode, modelId, errorCode, startedAt, completedAt, capturedRevisions }) => ({ id, applicationId, runKey, status, executionMode, modelId, errorCode, startedAt, completedAt, capturedRevisions })),
      toolEvents: this.state.events.filter(e => this.state.jobs.some(j => j.id === e.investigationJobId && j.applicationId === app.id)),
      clarificationRequests: this.state.requests.filter(r => r.applicationId === app.id), responses: this.state.responses.filter(r => r.applicationId === app.id),
      reviews: this.state.snapshot.reviews.filter(r => r.applicationId === app.id), auditEvents: this.state.audit.filter(a => a.applicationId === app.id),
      readiness: this.readiness(app), release: this.state.releases.find(r => r.applicationId === app.id) ?? null,
      paymentSummary: payment ? { id: payment.id, applicationId: app.id, version: payment.version, maskedDisplay: payment.maskedDisplay, beneficiaryName: payment.beneficiaryName, evidenceIds: payment.evidenceIds } : null,
      relatedApplications: this.state.snapshot.applications.filter(a => a.id !== app.id && relatedIds.has(a.id)).map(({ id, businessName, amountCents, currency }) => ({ id, businessName, amountCents, currency })),
      findingCurrentness: Object.fromEntries(findings.map(f => [f.id, f.observedRevisions.every(r => {
        const source = this.app(r.applicationId); return r.applicationRevision === source.applicationRevision && r.collateralRevision === source.collateralRevision && r.paymentRevision === source.paymentRevision;
      })])),
    });
  }
  private borrowerView(applicationId: string) {
    const { id, businessName, amountCents, currency, stage } = this.authorize(applicationId, ['borrower']);
    return BorrowerCaseViewSchema.parse({ application: { id, businessName, amountCents, currency, stage },
      requests: this.state.requests.filter(r => r.applicationId === id && r.state !== 'draft').map(({ id, applicationId, borrowerSafeMessage, requestedDocumentType, state, createdAt }) => ({ id, applicationId, borrowerSafeMessage, requestedDocumentType, state, createdAt })),
      responses: this.state.responses.filter(r => r.applicationId === id), documents: this.state.snapshot.documents.filter(d => d.applicationId === id && d.uploadedBy === this.user.id).map(d => ({ ...d, requestId: Object.entries(this.state.corrections).find(([, documentId]) => documentId === d.id)?.[0] ?? null })),
    });
  }
  private subscribe<T>(get: () => T, cb: (v: T) => void, onError: (e: DomainError) => void) {
    return this.watch(() => { try { cb(structuredClone(get())); } catch (e) { onError(this.error(e, id())); } });
  }
  subscribeCase: CaseAdapter['subscribeCase'] = (app, cb, err) => this.subscribe(() => this.staffView(app), cb, err);
  subscribeBorrowerCase: CaseAdapter['subscribeBorrowerCase'] = (app, cb, err) => this.subscribe(() => this.borrowerView(app), cb, err);
  subscribeBorrowerApplications: NonNullable<FrontendAdapter['subscribeBorrowerApplications']> = (cb, err) => this.subscribe(() => {
    if (this.user.role !== 'borrower') fail('UNAUTHORIZED', 'Borrower access is required.');
    if (this.failure === 'offline') fail('INVALID_STATE', 'Disconnected. Retry to load your applications.');
    return prioritizeBorrowerApplications(this.state.snapshot.applications.filter(a => a.borrowerUserId === this.user.id && a.organizationId === this.user.organizationId).map(({ id, businessName, amountCents, currency, stage }) => ({
      id, businessName, amountCents, currency, stage, pendingRequestCount: this.state.requests.filter(r => r.applicationId === id && r.state === 'sent').length,
    })));
  }, cb, err);
  subscribePortfolio: CaseAdapter['subscribePortfolio'] = (cb, err) => this.subscribe(() => {
    if (!['officer', 'reviewer'].includes(this.user.role)) fail('UNAUTHORIZED', 'Staff access is required.');
    if (this.failure === 'offline') fail('INVALID_STATE', 'Disconnected. Retry to load applications.');
    return this.state.snapshot.applications.map(application => ({ application, openFindingCount: this.state.findings.filter(f => f.applicationId === application.id && f.status !== 'resolved').length, lastInvestigationStatus: this.state.jobs.filter(j => j.applicationId === application.id).at(-1)?.status ?? null }));
  }, cb, err);
  private error(e: unknown, correlationId: string): DomainError { return { code: (e as { code?: DomainError['code'] }).code ?? 'INVALID_INPUT', message: e instanceof Error ? e.message : 'The operation failed.', correlationId }; }
  private operation<T>(correlationId: string, action: () => T | Promise<T>): Promise<OperationResult<T>> {
    const actorId = this.user.id;
    const task = this.operationQueue.then(async (): Promise<OperationResult<T>> => {
      try {
        if (actorId !== this.user.id) fail('UNAUTHORIZED', 'The demo identity changed. Retry from the current session.');
        const value = await action(); this.emit(); return { ok: true, value, correlationId };
      } catch (e) { this.emit(); return { ok: false, error: this.error(e, correlationId) }; }
    });
    this.operationQueue = task; return task;
  }
  requestInvestigation: CaseAdapter['requestInvestigation'] = input => this.operation(input.correlationId, () => {
    const app = this.authorize(input.applicationId, ['officer']); this.editable(app);
    if (input.executionMode !== 'fixture') fail('MODEL_UNAVAILABLE', 'This adapter executes deterministic fixture checks only. Select fixture execution.');
    const job = { id: id(), applicationId: app.id, capturedRevisions: captureSourceRevisions(this.state.snapshot.applications), status: 'running' as 'running' | 'succeeded' | 'failed', runKey: input.correlationId, executionMode: 'fixture' as const,
      claimedBy: null, claimToken: null, leaseExpiresAt: null, startedAt: now(), completedAt: null as string | null, modelId: null, errorCode: null as DomainError['code'] | null };
    this.state.jobs.push(job); this.emit();
    const started = performance.now();
    if (this.failure === 'investigation') { job.status = 'failed'; job.errorCode = 'WORKER_ERROR'; job.completedAt = now(); fail('WORKER_ERROR', 'The fixture failure scenario stopped this investigation. Clear the failure and investigate again.'); }
    const output = analyzeSnapshot({ ...this.state.snapshot, applicationId: app.id });
    for (const result of output.results) {
      const existing = this.state.findings.find(f => f.applicationId === app.id && f.deduplicationKey === result.deduplicationKey);
      if (existing) Object.assign(existing, result, { investigationJobId: job.id, updatedAt: now() });
      else this.state.findings.push({ ...result, id: id(), applicationId: app.id, investigationJobId: job.id, status: 'open', createdAt: now(), updatedAt: now() });
    }
    job.status = 'succeeded'; job.completedAt = now();
    this.state.events.push({ id: id(), investigationJobId: job.id, sequence: 1, toolName: 'analyzeSnapshot', status: 'succeeded', safeInputSummary: `${this.state.snapshot.applications.length} synthetic applications`, safeOutputSummary: `${output.results.length} supported concerns; ${output.skippedCollateralIds.length} assets lack usable identifiers. This is not a safety guarantee.`, durationMs: Math.max(0, Math.round(performance.now() - started)), createdAt: now() });
    this.audit(app.id, 'investigation_completed', `Deterministic fixture run ${job.id}`); return { jobId: job.id };
  });
  createClarificationDraft: CaseAdapter['createClarificationDraft'] = input => this.operation(input.correlationId, () => {
    const app = this.authorize(input.applicationId, ['officer']); this.editable(app);
    if (!this.state.findings.some(f => f.id === input.findingId && f.applicationId === app.id && f.status !== 'resolved')) fail('INVALID_STATE', 'Select an unresolved finding.');
    if (this.state.requests.some(r => r.findingId === input.findingId && r.state !== 'closed')) fail('INVALID_STATE', 'This concern already has a clarification request.');
    const requestId = id(); this.state.requests.push({ id: requestId, applicationId: app.id, findingId: input.findingId, borrowerSafeMessage: requireText(input.borrowerSafeMessage, 'Message', 3000), requestedDocumentType: input.requestedDocumentType, state: 'draft', draftedBy: this.user.id, sentBy: null, createdAt: now() });
    this.audit(app.id, 'clarification_drafted', requestId); return { requestId };
  });
  updateClarificationDraft: NonNullable<CaseAdapter['updateClarificationDraft']> = input => this.operation(input.correlationId, () => {
    const r = this.state.requests.find(r => r.id === input.requestId) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'Request unavailable.');
    this.editable(this.authorize(r.applicationId, ['officer'])); if (r.state !== 'draft') fail('INVALID_STATE', 'Only drafts can be edited.');
    r.borrowerSafeMessage = requireText(input.borrowerSafeMessage, 'Message', 3000); r.requestedDocumentType = input.requestedDocumentType;
    this.audit(r.applicationId, 'clarification_draft_updated', r.id); return { correlationId: input.correlationId };
  });
  sendClarification: CaseAdapter['sendClarification'] = input => this.operation(input.correlationId, () => {
    const r = this.state.requests.find(r => r.id === input.requestId) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'Request unavailable.');
    const app = this.authorize(r.applicationId, ['officer']); this.editable(app);
    if (r.state !== 'draft' || input.borrowerSafeMessage !== r.borrowerSafeMessage) fail('INVALID_STATE', 'The draft changed. Save and preview it again before sending.');
    r.state = 'sent'; r.sentBy = this.user.id; app.stage = 'clarification_needed';
    const finding = this.state.findings.find(f => f.id === r.findingId)!; finding.status = 'awaiting_response';
    this.audit(app.id, 'clarification_sent', r.id); return { correlationId: input.correlationId };
  });
  submitBorrowerResponse: CaseAdapter['submitBorrowerResponse'] = input => this.operation(input.correlationId, () => {
    const r = this.state.requests.find(r => r.id === input.requestId) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'Request unavailable.');
    const app = this.authorize(r.applicationId, ['borrower']); this.editable(app);
    if (r.state !== 'sent') fail('INVALID_STATE', 'This request is no longer accepting responses.');
    if (input.documentIds.some(documentId => !this.state.snapshot.documents.some(d => d.id === documentId && d.applicationId === app.id && d.uploadedBy === this.user.id))) fail('INVALID_EVIDENCE', 'A selected document is unavailable.');
    this.state.responses.push({ id: id(), requestId: r.id, applicationId: app.id, message: requireText(input.message, 'Response', 3000), documentIds: input.documentIds, submittedBy: this.user.id, createdAt: now() });
    r.state = 'answered'; this.change(app, 'other'); this.audit(app.id, 'clarification_answered', r.id); return { correlationId: input.correlationId };
  });
  decideFinding: CaseAdapter['decideFinding'] = input => this.operation(input.correlationId, () => {
    const f = this.state.findings.find(f => f.id === input.findingId) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'Finding unavailable.');
    const app = this.authorize(f.applicationId, ['officer', 'reviewer']); this.editable(app);
    const rationale = requireText(input.rationale, 'Decision rationale');
    if ((input.decision === 'reopen') !== (f.status === 'resolved')) fail('INVALID_STATE', 'This finding changed. Refresh before recording a decision.');
    f.status = input.decision === 'resolved' ? 'resolved' : input.decision === 'escalate' ? 'escalated' : 'open'; f.updatedAt = now();
    this.state.requests.filter(r => r.findingId === f.id).forEach(r => { r.state = 'closed'; });
    if (!this.state.requests.some(r => r.applicationId === app.id && r.state === 'sent')) app.stage = 'reviewing';
    this.audit(app.id, `finding_${f.status}`, rationale); return { correlationId: input.correlationId };
  });
  recordReview: CaseAdapter['recordReview'] = input => this.operation(input.correlationId, () => {
    const app = this.authorize(input.applicationId, ['reviewer']); this.editable(app);
    if (app[REVIEW_REVISION_MAP[input.checkType]] !== input.observedRelevantRevision) fail('STALE_REVIEW', 'The inputs changed. Review the current revision before signing.');
    const rationale = requireText(input.rationale, 'Review rationale');
    const evidence = input.evidenceIds.map(e => this.state.snapshot.evidence.find(item => item.id === e && item.applicationId === app.id) ?? fail('INVALID_EVIDENCE', 'Select evidence belonging to this case.'));
    if (!evidence.length) fail('INVALID_EVIDENCE', 'Select at least one source for this review.');
    if (input.checkType === 'payment_verification' && input.status !== 'needs_review') {
      const payment = this.state.payments.filter(p => p.applicationId === app.id).at(-1);
      if (!payment || !payment.evidenceIds.every(e => input.evidenceIds.includes(e))) fail('INVALID_EVIDENCE', 'Select the current payment instruction and its supporting evidence.');
    }
    this.state.snapshot.reviews.push({ id: id(), applicationId: app.id, checkType: input.checkType, observedRelevantRevision: input.observedRelevantRevision, status: input.status ?? 'passed', rationale, evidenceIds: input.evidenceIds, reviewerId: this.user.id,
      sequence: Math.max(0, ...this.state.snapshot.reviews.filter(r => r.applicationId === app.id && r.checkType === input.checkType).map(r => r.sequence)) + 1, createdAt: now() });
    this.audit(app.id, 'review_recorded', `${input.checkType}: ${rationale}`); return { correlationId: input.correlationId };
  });
  changePaymentInstructions: CaseAdapter['changePaymentInstructions'] = input => this.operation(input.correlationId, async () => {
    const app = this.authorize(input.applicationId, ['reviewer']); this.editable(app);
    if (app.paymentRevision !== input.observedPaymentRevision) fail('STALE_REVIEW', 'Payment instructions changed. Review the current version.');
    const beneficiaryName = requireText(input.beneficiaryName, 'Beneficiary', 160);
    if (!/^SYNTH-[a-zA-Z0-9_-]{1,64}$/.test(input.syntheticAccountToken)) fail('INVALID_INPUT', 'Use a SYNTH- prefixed demo account token.');
    const version = app.paymentRevision + 1;
    const documentId = await this.addDocument(app, `payment-instruction-v${version}.json`, { label: 'SYNTHETIC DEMO DOCUMENT', beneficiaryName, syntheticAccountToken: input.syntheticAccountToken, paymentVersion: version }, 'payment_instruction', 'syntheticAccountToken', input.syntheticAccountToken);
    const e = this.state.snapshot.evidence.find(e => e.documentId === documentId)!;
    this.state.payments.push({ id: id(), applicationId: app.id, version, syntheticAccountToken: input.syntheticAccountToken, maskedDisplay: `**** ${String(version).padStart(4, '0')}`, beneficiaryName, evidenceIds: [e.id], createdAt: now() });
    this.change(app, 'payment'); this.audit(app.id, 'payment_instructions_changed', `Synthetic payment version ${version}; payment and document reviews need re-verification.`); return { correlationId: input.correlationId };
  });
  simulateRelease: CaseAdapter['simulateRelease'] = input => this.operation(input.correlationId, () => {
    const app = this.authorize(input.applicationId, ['reviewer']);
    const prior = this.state.releases.find(r => r.applicationId === app.id);
    if (prior) { if (prior.idempotencyKey === input.idempotencyKey) return prior; fail('ALREADY_RELEASED', 'A release already exists for this case.'); }
    const readiness = this.readiness(app); if (!readiness.canRelease) fail('INVALID_STATE', 'Release is blocked. Complete the current investigation and required checks.');
    const release = { id: id(), applicationId: app.id, idempotencyKey: input.idempotencyKey, releasedBy: this.user.id, releasedAt: now(), syntheticAmountCents: app.amountCents };
    this.state.releases.push(release); app.stage = 'released_demo'; this.audit(app.id, 'simulated_release', 'SIMULATED RELEASE - NO MONEY MOVED'); return release;
  });
  private async addDocument(app: Application, filename: string, content: Record<string, unknown>, type: string, fieldName: string, value: string) {
    const actorId = this.user.id;
    const raw = JSON.stringify(content, null, 2) + '\n';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    if (actorId !== this.user.id) fail('UNAUTHORIZED', 'The session changed before document selection completed.');
    this.editable(this.authorize(app.id, ['officer', 'reviewer', 'borrower']));
    const documentId = id(); this.state.sources[documentId] = raw;
    const version = type === 'collateral_schedule' ? app.collateralRevision + 1 : app.paymentRevision + 1;
    this.state.snapshot.documents.push({ id: documentId, applicationId: app.id, type, version, sha256: [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join(''), displayFilename: filename, extractionStatus: 'succeeded', createdAt: now(), uploadedBy: this.user.id });
    this.state.snapshot.evidence.push({ id: id(), applicationId: app.id, documentId, documentVersion: version, pageNumber: null, locator: `$.${fieldName}`, excerpt: `"${fieldName}": ${JSON.stringify(content[fieldName])}`, fieldName, extractedValue: value, extractionMethod: 'structured', createdAt: now() });
    return documentId;
  }
  canAttachSyntheticCorrection(requestId: string) {
    const request = this.state.requests.find(r => r.id === requestId);
    if (!request || request.state !== 'sent' || this.user.role !== 'borrower' || this.app(request.applicationId).borrowerUserId !== this.user.id) return false;
    const finding = this.state.findings.find(f => f.id === request.findingId);
    return finding?.findingType === 'collateral_conflict' && finding.facts.normalizedIdentifier === 'EX-0042';
  }
  async attachSyntheticCorrection(requestId: string) {
    const request = this.state.requests.find(r => r.id === requestId) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'Request unavailable.');
    const app = this.authorize(request.applicationId, ['borrower']); this.editable(app);
    if (request.state !== 'sent') fail('INVALID_STATE', 'This request is no longer open.');
    if (!this.canAttachSyntheticCorrection(requestId)) fail('EXTRACTION_UNSUPPORTED', 'There is no synthetic corrected-document scenario for this request. Send a written response instead.');
    const prior = this.state.corrections[requestId]; if (prior) return prior;
    const documentId = await this.addDocument(app, 'corrected-collateral-schedule.json', { label: 'SYNTHETIC DEMO DOCUMENT', businessName: app.businessName, equipmentIdentifier: 'EX-0042', activeCollateralClaim: false, explanation: 'Equipment EX-0042 is removed from the collateral offered for this application.' }, 'collateral_schedule', 'activeCollateralClaim', 'false');
    this.state.snapshot.collateral.filter(c => c.applicationId === app.id && c.identifier?.toUpperCase() === 'EX-0042').forEach(c => { c.active = false; });
    this.state.corrections[requestId] = documentId;
    this.change(app, 'collateral'); this.audit(app.id, 'synthetic_correction_selected', documentId); this.emit(); return documentId;
  }
  async source(documentId: string, version: number) {
    const document = this.state.snapshot.documents.find(d => d.id === documentId && d.version === version) ?? fail('NOT_FOUND_OR_FORBIDDEN', 'This source version is unavailable.');
    if (this.user.role === 'borrower') this.authorize(document.applicationId, ['borrower']);
    else this.authorize(document.applicationId, ['officer', 'reviewer']);
    const raw = this.state.sources[document.id] ?? fail('NOT_FOUND_OR_FORBIDDEN', 'Source text is unavailable.');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hash = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== document.sha256) fail('INVALID_EVIDENCE', 'This stored source does not match its document hash. Reset the synthetic demo.');
    return raw;
  }
}
