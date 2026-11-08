# Four-person build plan

Repository: https://github.com/minhle211/HackUTD-Fraud-detector

These are proposed implementation assignments based on the supplied commercial-loan investigation idea. At inspection, main contained coordination files and no application implementation or package manifests. Paths and commands below are planned deliverables, not existing functionality. DealPilot is a temporary product name.

Send each teammate their numbered assignment plus this document. Assign people to roles by experience; the numbers do not assign GitHub logins.

## Product and scope

Build a commercial-loan investigation prototype where an officer investigates an application, sees evidence of conflicting equipment ownership, requests clarification, receives a borrower response, and resolves the finding. A reviewer verifies required checks and performs a simulated release. Changing payment instructions must invalidate payment verification and block release until reverified.

The system supports human review. A shared identifier is a concern to investigate, not proof of fraud. No real money, customer information, automatic lending decisions, or real bank integrations.

## Ownership

| Person | Assignment | Owned implementation |
| --- | --- | --- |
| 1 | Frontend | apps/web/, frontend adapter, browser UI tests |
| 2 | Database and authorization | spacetimedb/, generated binding workflow, database tests |
| 3 | AI worker and ingestion | apps/worker/, document-generation scripts |
| 4 | Contracts, analysis, integration | packages/contracts/, packages/analysis/, canonical fixtures, root tooling, integration tests and docs |

Person 4 coordinates integration and root configuration. Person 2 exclusively generates database bindings; coordinate with Person 1 before replacing generated files. Person 3 can propose fixture documents, but Person 4 owns canonical fixture IDs and expected results. Each person tests their own behavior; Person 4 does not inherit everyone's testing.

## Architecture to agree on before coding

- TypeScript monorepo, npm workspaces, React/Vite frontend, Node worker.
- SpacetimeDB is the application database and owns permissions and business-state changes. Person 2 verifies and pins a compatible CLI/server/SDK toolchain before choosing module syntax.
- Use the TypeScript server module if supported by that pinned toolchain. Resolve toolchain incompatibility together before parallel schema implementation.
- Worker handles file bytes, extraction, deterministic check invocation, and NVIDIA/Nemotron orchestration.
- Browser calls authorized database operations through a small adapter. No model secrets in browser code.
- A narrow authenticated worker upload/download transport may handle file bytes. It must not become a second CRUD backend or bypass database authorization.
- Private development file storage is local to the worker. Store opaque keys in private metadata, never browser-accessible filesystem paths. Fixture-only documents are acceptable for the first checkpoint.
- Vitest for pure/domain tests; supported database integration checks for authorization and transactions; Playwright for a small number of complete workflows.
- Do not add another application database or introduce extra agents/services before the core flow works.

## First joint session: freeze the contract

Target approximately 30-45 minutes; these are planning estimates, not guaranteed implementation times.

1. Person 4 creates workspace skeleton, contracts, stable fixture IDs, and documented scripts.
2. Person 2 proves a minimal authorized database write/read and records exact compatible versions.
3. Person 3 proves the configured model can call a real tool; report a blocked credential/model test honestly.
4. Person 1 renders one case using a development-only implementation of the agreed adapter.
5. Agree on domain fields, operations, error shapes, revision rules, and which identity performs every demo step.
6. Integrate immediately after the database and worker smoke tests. Do not wait for finished screens.

## Shared types and data rules

Person 4 publishes runtime schemas plus SDK-independent TypeScript types. Start with these records:

| Record | Minimum fields |
| --- | --- |
| User | id, authenticated identity mapping, role, organizationId, displayName, active |
| Application | id, borrowerUserId, organizationId, businessName, amountCents, currency, stage, applicationRevision, collateralRevision, paymentRevision |
| Document | id, applicationId, type, version, sha256, displayFilename, extractionStatus, uploadedBy; storage key is private |
| Evidence | id, applicationId, documentId, documentVersion, excerpt, fieldName/value when available, extractionMethod, nullable pageNumber/locator |
| EntityRecord | id, applicationId, original/normalized names, optional identifiers/address, evidenceIds |
| MatchCandidate | entity IDs, matched attributes, similarity score, human decision and reviewer metadata |
| Collateral | id, applicationId, identifier, normalizedIdentifier, active, exclusiveOwnershipClaim, evidenceIds |
| PaymentInstruction | id, applicationId, version, syntheticAccountToken, maskedDisplay, beneficiaryName, evidenceIds |
| InvestigationJob | id, applicationId, captured revision vector, status, runKey, worker lease, executionMode, modelId, timestamps, errorCode |
| ToolEvent | jobId, sequence, toolName, status, safe summaries, durationMs |
| Finding | id, applicationId, jobId, type, severity, status, evidenceState, title, explanation, uncertainty, suggestedNextStep, evidenceIds, relatedApplicationIds, observed revision vector, ruleVersion, deduplicationKey |
| ClarificationRequest | id, applicationId, findingId, borrowerSafeMessage, requestedDocumentType, state, draftedBy, sentBy |
| BorrowerResponse | id, requestId, applicationId, message, documentIds, submittedBy |
| ReviewRecord | id, applicationId, checkType, observedRelevantRevision, status, rationale, evidenceIds, reviewerId |
| AuditEvent | id, applicationId, actorId, action, safeDetails, createdAt |
| DemoRelease | id, applicationId, idempotencyKey, releasedBy, releasedAt, syntheticAmountCents |

Use string IDs at public boundaries and one adapter for database-specific numeric IDs. Use integer cents and explicit currency; never sum different currencies. Use UTC timestamps at boundaries. Define actual representation and maximum safe money range in contracts. Empty/missing values are not zero. Evidence locators must describe actual sources; JSON fixtures do not have invented PDF page numbers.

Enums:

- Application stage: draft, submitted, reviewing, clarification_needed, ready_for_release, released_demo.
- Job status: queued, running, succeeded, failed, cancelled. Represent stale completion as failed with STALE_RESULTS and retain its history; do not invent a separate status in one component.
- Finding status: open, awaiting_response, resolved, escalated.
- Evidence state: supported, contradicted, unknown.
- Match decision: candidate, confirmed_same_entity, confirmed_related, rejected.
- Review status: pending, passed, needs_review, stale.
- Request state: draft, sent, answered, closed.
- Roles: officer, borrower, reviewer, worker. Administrator bootstrap is a controlled setup procedure, not a freely selectable client role.

## Logical operations

These are domain interfaces, not claims about SDK method names. Person 2 maps them to supported reducers/views; Person 1 adapts generated APIs to them. Mutations return or expose a correlatable result through supported SDK behavior.

| Operation | Actor | Required result/behavior |
| --- | --- | --- |
| listApplications / getCase | Staff | Organization-scoped safe case projection |
| getBorrowerCase | Borrower | Own case and sent requests; no internal/other-borrower evidence |
| requestInvestigation | Officer | Job ID, captured current revision vector, live/fixture mode |
| claimInvestigation | Worker | Atomic lease, scoped snapshot, claim token |
| recordToolEvent | Claimed worker | Ordered, bounded safe event for its job |
| completeInvestigation | Claimed worker | Validated findings or explicit stale/lease rejection |
| failInvestigation | Claimed worker | Explicit terminal error; do not leave UI spinning |
| createClarificationDraft | Officer/worker | Draft bound to an existing finding |
| sendClarification | Officer | Sent borrower-safe request and audit entry |
| submitBorrowerResponse | Borrower | Response/documents for own sent request; no automatic resolution |
| decideFinding | Officer/reviewer | Resolve, escalate, or reopen with rationale and audit |
| reviewMatchCandidate | Officer/reviewer | Explicit relationship decision with rationale |
| recordReview | Reviewer | Required check bound to current relevant revision |
| changePaymentInstructions | Authorized reviewer for MVP | New payment version, revision changes, stale payment check |
| getReleaseReadiness | Staff | Server-computed canRelease, check states, blocking reasons |
| simulateRelease | Reviewer | Atomic policy check and one immutable simulated release |

Define stable errors: UNAUTHORIZED, NOT_FOUND_OR_FORBIDDEN, INVALID_INPUT, INVALID_STATE, LEASE_LOST, STALE_RESULTS, STALE_REVIEW, BLOCKING_FINDINGS, ALREADY_RELEASED, MODEL_UNAVAILABLE, EXTRACTION_UNSUPPORTED. Keep sensitive existence details out of borrower errors. Add correlation IDs where a mutation is observed asynchronously.

## Revision and release agreement

- applicationRevision is the overall investigation input revision. Changing documents, collateral, payment instructions, or confirmed relationship inputs affecting a case increments it. Reviews and tool logs alone do not increment it.
- Also increment collateralRevision for collateral changes and paymentRevision for payment changes.
- Initial review map: collateral_review -> collateralRevision; payment_verification -> paymentRevision; document_consistency_review -> applicationRevision. The last mapping is deliberately conservative; document it.
- Recompute readiness and invalidate affected reviews in the same transaction as a relevant update. A previously ready application returns to reviewing or clarification_needed as appropriate.
- Job captures all three revisions. Completion checks current state, claim ownership, and lease. Cross-case checks also carry relevant related-case revisions; changing a source case must prevent stale results from appearing current. Person 2 and Person 4 choose a supported mechanism before cross-case completion ships.
- Readiness requires an eligible stage, passed current required checks, no blocking findings, and no prior release. High findings in open, awaiting_response, or escalated states block release.
- A server transaction rechecks every release condition and inserts DemoRelease. Repeating the same idempotency key returns the existing result; another key cannot create a second release for the same application.
- Concurrent update/release behavior follows transaction order. After simulated release, reject further changes to release-relevant inputs for this MVP; do not silently change an already-released case.

## Shared fixture set

Person 4 supplies at least eight synthetic applications spanning:

1. Two exclusive ownership claims on one equipment identifier: one evidence-backed conflict.
2. An updated collateral schedule removing that asset: a human resolves the concern.
3. Businesses at the same office: no identity merge or high concern from address alone.
4. Similar business names with different identifiers: candidate only.
5. Confirmed related requests exceeding a named, versioned demo threshold: group review required, not proven evasion.
6. Payment version 1 verified, then version 2: payment review becomes stale.
7. Missing ownership evidence: unknown; no fabricated ownership.
8. An unrelated clean application for a negative control.

The correction and payment-update scenarios can be later states of existing applications. Keep at least eight distinct application records overall. Add a document containing hostile instructions to verify that extraction/model input cannot authorize privileged actions.

## Integration checkpoints

| Checkpoint | Required demonstration |
| --- | --- |
| A: first full flow | UI creates a real job; worker claims it, executes a check, persists a finding; UI opens its source evidence |
| B: human workflow | Officer sends a safe request; separate borrower session responds; officer reviews and resolves the finding |
| C: release controls | Reviewer passes current checks; payment change makes verification stale; server refuses release; reverify and simulate exactly one release |
| D: submission | Fresh setup works, live model/tool run demonstrated, negative scenarios checked, backup fixture mode clearly labeled |

If the schedule slips, cut OCR, relationship graphs, extra models, and optional check types first. Preserve the complete demo and server-enforced permissions.

## Collaboration and handoff

Follow the repository AGENTS.md and its signal workflow where tooling is available. Reading the signal log requires authenticated GitHub CLI; this planning environment could not read it because gh is absent. Do not infer assignments or acknowledgments from an unread log.

Before implementation, refresh main and inspect current work. Follow the issue-based branch convention when there is an issue. Stage only owned changes, coordinate shared changes, and use small PRs. Do not overwrite the existing signal tooling or contributor roster. This plan does not create issues, post team messages, push, or deploy.

Each milestone handoff must include changed paths, exported interfaces, exact commands actually run, results, known limitations, dependencies, and the next integration step. Never label an unexecuted live integration as working.
