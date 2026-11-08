// Explicit development fixture export. Never use as an automatic connection fallback.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BorrowerCaseViewSchema, InvestigationSnapshotSchema, StaffCaseViewSchema } from '@loanwick/contracts';
import { checkCollateralConflicts, checkGroupThreshold, getPolicyReadiness } from '@loanwick/analysis';

const root = new URL('../', import.meta.url);
const snapshot = InvestigationSnapshotSchema.parse(JSON.parse(readFileSync(new URL('fixtures/applications/demo.json', root), 'utf8')));
const application = snapshot.applications.find(a => a.id === snapshot.applicationId);
const results = [...checkCollateralConflicts(snapshot), ...checkGroupThreshold(snapshot)];
const findings = results.map((result, i) => ({ ...result, id: `finding-fixture-${i + 1}`, applicationId: application.id, investigationJobId: null, status: 'open', createdAt: application.updatedAt, updatedAt: application.updatedAt }));
const relationships = snapshot.relationships.filter(r => [r.leftApplicationId, r.rightApplicationId].includes(application.id));
const visibleIds = new Set([application.id, ...results.flatMap(r => r.applicationIds), ...relationships.flatMap(r => [r.leftApplicationId, r.rightApplicationId])]);
const reviews = snapshot.reviews.filter(r => r.applicationId === application.id);
const policy = getPolicyReadiness({ application, reviews, findings, releases: [] });
const staff = StaffCaseViewSchema.parse({ application, documents: snapshot.documents.filter(d => visibleIds.has(d.applicationId)), evidence: snapshot.evidence.filter(e => visibleIds.has(e.applicationId)),
  collateral: snapshot.collateral.filter(c => c.applicationId === application.id), findings, relationships, investigations: [], toolEvents: [], clarificationRequests: [], responses: [], reviews, auditEvents: [], readiness: { ...policy, canRelease: false }, release: null });
const borrower = BorrowerCaseViewSchema.parse({ application: { id: application.id, businessName: application.businessName, amountCents: application.amountCents, currency: application.currency, stage: application.stage },
  requests: [{ id: 'request-fixture-1', applicationId: application.id, borrowerSafeMessage: 'Please provide current ownership documentation for equipment EX-0042 and an updated collateral schedule.', requestedDocumentType: 'ownership_document', state: 'sent', createdAt: application.updatedAt }], responses: [] });
mkdirSync(new URL('fixtures/views/', root), { recursive: true });
writeFileSync(new URL('fixtures/views/staff-case.json', root), JSON.stringify(staff, null, 2) + '\n');
writeFileSync(new URL('fixtures/views/borrower-case.json', root), JSON.stringify(borrower, null, 2) + '\n');
console.log('Exported synthetic staff and borrower views. No database writes, model calls, or tool events were simulated.');
