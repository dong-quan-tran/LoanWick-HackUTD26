# Person 4: Shared contracts, deterministic analysis, and integration lead

## Your outcome

Make the other three components fit together and give the investigation reliable facts. Own shared schemas, reproducible scenarios, deterministic checks, integration tooling, and the final demo. You also implement substantial domain logic; this is not only a coordination role.

Read 00-START-HERE.md for architecture, shared operations, and revision policy. The initial repo has coordination tools but no application implementation.

## Ownership

- Own packages/contracts/, packages/analysis/, canonical fixtures/applications/, fixtures/expected-results/, shared fixture manifest, root workspace tooling, shared integration tests, README, and integration/demo/evaluation docs.
- Person 3 owns document-generation/extraction code. Agree on document fixture IDs/text together before generation.
- Person 2 owns actual database policy enforcement. You define pure helpers and expected behavior with them, not a second backend policy implementation.
- Person 1 owns frontend adapter implementation and UI tests. Coordinate shared end-to-end coverage to avoid duplication.
- Review/coordinate root dependency and configuration changes; do not silently modify someone else's feature paths.

Suggested structure:

```text
packages/contracts/src/   domain types and runtime schemas
packages/analysis/src/    pure checks and normalization
packages/analysis/tests/
fixtures/applications/
fixtures/documents/      canonical manifest; generated sources coordinated with Person 3
fixtures/expected-results/
tests/integration/
tests/e2e/
docs/ARCHITECTURE.md
docs/CONTRACTS.md
docs/DEMO.md
docs/EVALUATION.md
docs/LIMITATIONS.md
```

## Step 1: Shared scaffold and first contracts

1. Inspect current work and repository AGENTS.md. Refresh main before implementation and preserve signal tooling/roster.
2. Establish TypeScript npm workspaces and shared formatting/typechecking/test configuration with the team. Do not introduce competing package managers.
3. Agree with Person 2 on database-compatible dependency boundaries. Server-compatible pure helpers must not import Node-only libraries or runtime schemas unsupported by its module runtime.
4. Publish enums, string-ID boundary rules, integer-cent/currency representation, UTC format, revision vector, and stable error schema.
5. Define schemas for core entities, investigation snapshot, CheckResult/FindingDraft, tool results, clarification draft, and safe staff/borrower views.
6. Define the frontend domain adapter interface with Person 1 and logical database operations with Person 2. Document supported async mutation result/correlation behavior rather than pretending every reducer directly returns a record.
7. Publish valid sample payloads and malformed/foreign-ID examples so teammates can build against the same contract immediately.
8. Create a fixture manifest with stable case, document, evidence, collateral, relationship, and identity IDs.

Target planned scripts after implementation: setup/install instructions, dev:web, dev:worker, documented database start/publish/seed commands, typecheck, test, test:integration, test:e2e, evaluate, and live worker smoke test. These commands do not exist yet; choose exact names together and verify them before documenting them as runnable.

Deliverable: other three people can import shared types and validate the same sample case without borrowing one another's implementation internals.

## Step 2: Deterministic check interface

Agree on pure SDK-independent functions, approximately:

```ts
normalizeIdentifier(raw: string, policy: IdentifierPolicy): NormalizationResult
checkCollateralConflicts(snapshot: InvestigationSnapshot): CheckResult[]
checkGroupThreshold(snapshot: InvestigationSnapshot, policy: GroupReviewPolicy): CheckResult[]
getPaymentVerificationState(currentRevision: number, review?: ReviewSnapshot): VerificationState
```

These are proposed domain signatures, not external SDK methods. Finalize exact numeric/optional-field representation with Person 2.

CheckResult must contain: finding type, severity, evidence state, source application IDs, actual evidence IDs, explanation, uncertainty, suggested next step, observed source revisions, rule version, and a stable deduplication key. Include structured facts such as matched identifier or aggregated cents so the worker does not have to rederive them from prose.

Pure functions must not call the model, filesystem, network, database, wall clock, or generate random IDs. An absent input is unknown, not an invitation to fabricate a value.

## Step 3: Identifier normalization and collateral conflict

1. Define an explicit identifier policy for the demo equipment type.
2. Trim permitted whitespace and normalize case only when that identifier format is case-insensitive.
3. Remove separators only when the format explicitly permits equivalence. Preserve meaningful punctuation and leading zeros.
4. Return invalid/unknown when a required identifier is missing or malformed.
5. Compare active claims across distinct applications using exact normalized identifiers.
6. Require conflicting exclusive ownership claims before producing the demo's high-priority concern. Same identifier without ownership evidence is a clarification need, not a confirmed conflict.
7. Exclude duplicate records and same-application self-matches. Use deterministic ordering and keys.
8. Return both supporting evidence references, the exact normalized identifier, and source revisions.
9. Explain alternative possibilities such as a clerical error, changed ownership, or an outdated schedule. Do not label a borrower a fraudster.

Tests: exact conflict, permitted formatting equivalence, meaningful separator difference, preserved leading zero, missing identifier, no ownership evidence, nonexclusive/shared ownership, inactive collateral, same-application duplicate, two independent conflicts, reversed input order, and clean unrelated assets.

Deliverable: one passing conflict case and meaningful negative controls before the worker needs the check.

## Step 4: Confirmed-group review threshold

1. Use confirmed relationships only. Similar names/addresses may form candidates but never aggregate automatically.
2. Define a named/versioned synthetic policy with threshold cents, currency, active stages, group membership meaning, and comparison semantics.
3. Proposed demo threshold: USD 1,000,000; review required only when the distinct active group's total is greater than that threshold. Confirm the number with the team; this is a demo policy, not a legal threshold.
4. Sum each application's amount once, including when relationship paths repeat. Define connected-group behavior explicitly for confirmed edges.
5. Exclude inactive stages and reject/partition currency mixtures rather than summing unlike money.
6. Return application IDs, amounts, relationship evidence, total, threshold, policy version, and why membership applies.
7. Label the outcome group-level review required. It is not a claim of deliberate loan splitting.

Tests: below/equal/above boundary, duplicate edges, cycles, repeated IDs, unconfirmed candidates, shared address alone, excluded stages, mixed currencies, missing relationship evidence, and safe integer bounds.

Deliverable: deterministic expected totals that Person 3 can expose directly as tool results.

## Step 5: Payment review and readiness semantics

1. Define pure payment-review state: missing -> pending; passed current revision -> current; passed older revision -> stale; nonpassed current record -> needs review.
2. Agree with Person 2 which review record is authoritative, including later nonpassed decisions. Do not resurrect an older pass after a newer failed/needs-review decision.
3. Publish the shared review invalidation map and examples for collateral, payment, and other document changes.
4. Specify how cross-case evidence revisions are captured and validated; updating case B cannot leave a result based on B silently current in case A.
5. Define expected readiness reasons for missing checks, stale checks, high open findings, invalid stage, and prior release.
6. Person 2 enforces actual transactional readiness and release. Use pure helpers where compatible; test direct reducer behavior separately from helper correctness.

Tests: no review, current pass, old pass, newer nonpass overriding old pass, unrelated changes preserving the appropriate check, payment change invalidation, related-case revision change, and duplicate release expectations.

Deliverable: Person 1, Person 2, and Person 3 use the same terms and expected blocking reasons.

## Step 6: Synthetic fixtures and evaluation

Build at least eight distinct applications covering all scenarios in the shared plan. Use only clearly synthetic business names, identifiers, accounts, and documents.

For each case/state, record:

- Source document and evidence IDs with excerpts that actually exist.
- Confirmed versus candidate relationships and why.
- Expected check outputs, exact involved cases, source revisions, and deduplication keys.
- Expected absent findings for legitimate cases.
- State transitions for correction and payment-update scenarios.

Coordinate document generation with Person 3. A source text change must update expected excerpts, hashes/versions where appropriate, and expected results together.

Build an evaluation command that runs pure checks over the fixture set and reports: expected findings found, expected findings missing, unexpected findings, invalid evidence references, and quantitative mismatches. Record model explanation validation separately from deterministic detection results.

Do not present this tiny planted fixture set as real-world fraud accuracy. Report actual counts and observed timings, not planned performance targets. Include the hostile-document scenario and verify that it cannot gain privileged tool access.

Optional only after the core flow: compare document totals for the same scope/period. Missing values remain unknown; metadata alone does not establish document forgery.

## Step 7: Integration sequence

Checkpoint A:

1. Person 2 seeds canonical records; Person 1 opens them through real subscriptions.
2. Person 3 claims a real job and calls your collateral helper.
3. Database validates/persists results; frontend opens the precise source evidence.
4. Repeat with live provider orchestration; distinguish this from the deterministic worker test.

Checkpoint B:

1. Live investigation produces stored findings and a safe draft.
2. Officer sends a request; a separate borrower identity responds.
3. Updated document becomes new evidence; officer reviews and resolves the specific concern with rationale.
4. Verify unrelated findings/reviews do not disappear accidentally.

Checkpoint C:

1. Reviewer passes all current required checks.
2. Change payment details; observe exactly the documented invalidation.
3. Attempt direct server release and confirm rejection, not merely a disabled button.
4. Reverify payment and any conservatively invalidated document review.
5. Simulate release once, retry the same request, and verify there is one immutable release event.

Keep one shared end-to-end script for these checkpoints. Delegate component fixes back to their owners instead of accumulating undocumented workarounds in integration code.

## Step 8: Setup, demo, and final handoff

README must explain prerequisites, pinned toolchain, package installation, local database setup, private identity bootstrap, seeding, worker/browser startup, environment variable names, fixture/live mode, and test commands. Do not include actual secrets.

docs/DEMO.md must contain exact identities, application IDs, action sequence, expected evidence, expected stale-review failure, successful recheck/release, and honest recovery steps for model/connection failures.

docs/LIMITATIONS.md must cover synthetic data, supported formats, nonauthenticated document truth, local-only byte storage, model/provider dependencies, and absence of production lending validation.

Run fresh setup from a separate clean checkout if feasible, execute required unit/database/integration/browser checks, and perform the actual live model/tool smoke test. If blocked, name the exact blocked check and preserve successful independent verification.

## Acceptance checklist

- [ ] All components import compatible shared schemas and enums.
- [ ] Pure checks return real evidence, explicit uncertainty, versions, and stable keys.
- [ ] Positive and negative fixtures pass; missing evidence stays unknown.
- [ ] Group aggregation handles duplicates, candidates, boundaries, and currencies correctly.
- [ ] Revision examples match database behavior and frontend messages.
- [ ] Complete officer/borrower/reviewer flow works with distinct identities.
- [ ] Server blocks stale release and duplicate release.
- [ ] Live Nemotron tool workflow is demonstrated separately from fixture mode.
- [ ] Setup/demo/evaluation/limitations docs reflect executed results.
- [ ] Team receives exact remaining blockers rather than a premature done report.

## Ongoing team handoff

At each checkpoint publish the current contract version, fixture IDs, merged interface changes, exact checks run/results, remaining dependencies, and next shared demo step. Follow repository communication rules and obtain explicit authorization before sending external team messages. Do not automatically push, deploy, create paid resources, or alter the roster.
