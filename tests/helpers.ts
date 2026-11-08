import { readFileSync } from 'node:fs';
import { InvestigationSnapshotSchema } from '@loanwick/contracts';
import type { Application, InvestigationSnapshot, ReviewRecord } from '@loanwick/contracts';

export function fixture(applicationId = 'app-excavator-a'): InvestigationSnapshot {
  const input = JSON.parse(readFileSync(new URL('../fixtures/applications/demo.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  return InvestigationSnapshotSchema.parse({ ...input, applicationId });
}
export function application(s: InvestigationSnapshot, id = s.applicationId): Application {
  const app = s.applications.find(a => a.id === id);
  if (!app) throw new Error(`Missing test application ${id}`);
  return app;
}
export function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return { id: 'review-test', applicationId: 'app-excavator-a', checkType: 'payment_verification', observedRelevantRevision: 1,
    status: 'passed', rationale: 'Synthetic test review', evidenceIds: [], reviewerId: 'user-reviewer', sequence: 1,
    createdAt: '2026-11-07T12:00:00.000Z', ...overrides };
}
