# Demo runbook

## Runnable now: local deterministic foundation

1. npm ci
2. npm run check
3. npm run fixtures:views if sample frontend projections need regeneration.
4. Inspect fixtures/applications/demo.json, fixtures/expected-results/demo.json, and the source files in fixtures/documents/.

The evaluation prints exact source/hash checks and case-finding counts. It makes no model request, does not create a database job, and is not the final live product demo.

## Planned integrated demo: pending other owners

| Step | Identity/case | Expected observable result |
| --- | --- | --- |
| 1 | Seeded officer, app-excavator-a | Application opens through an authorized subscription |
| 2 | Officer investigates | Real job claimed by worker; live mode and actual tool events visible |
| 3 | Staff views conflict | EX-0042 is supported by identifier/ownership excerpts in both excavator cases |
| 4 | Officer previews/sends clarification | Borrower receives only own-case request; no Granite applicant details |
| 5 | app-excavator-a borrower in separate session | Corrected schedule/ownership response is stored and extracted |
| 6 | Officer | New evidence reviewed; original concern resolved with rationale, not automatically by upload |
| 7 | Reviewer | All required current checks passed |
| 8 | Reviewer changes synthetic payment instructions | paymentRevision and applicationRevision advance; payment/document reviews stale |
| 9 | Reviewer attempts release | Server rejects due to stale checks; show actual error/reasons |
| 10 | Reviewer reverifies affected checks | Exactly one immutable simulated release; retry does not duplicate it |

The baseline app-office-a fixture separately illustrates a payment version 2 with version 1 reviews. app-similar-a is the clean control; app-similar-b has missing identifier/ownership and hostile source text. group-a/group-b show confirmed USD 1.1 million requests under a strictly-greater-than USD 1 million synthetic review policy.

Identity labels in fixtures/manifest.json are not real authenticated logins. Person 2 must provide actual local session/bootstrap instructions before these live steps are runnable. Person 3 owns the corrected document variant/ingestion transport with Person 4's fixture coordination.

## Failure handling

- Provider unavailable: show actual failed live run; explicitly select fixture mode if demonstrating a backup. Do not silently fall back.
- Stale completion: retain rejected run history and start a new job with current input scope.
- Unsupported document: display extraction unsupported; do not substitute a synthetic success.
- Lost connection: show disconnected/retry and reconcile actual stored operation result before repeating a mutation.

Record a backup only after the real integrated flow works. Keep OCR, graph rendering, and extra detection rules outside the protected demo sequence.
