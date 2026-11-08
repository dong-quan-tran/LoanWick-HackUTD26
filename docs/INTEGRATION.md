# Integration handoff: Person 4 foundation

## Ready to consume

From a checkout containing this change: npm ci, then npm run build. Workspace packages resolve by name; do not import another owner's private src directory.

| Owner | Take now | Implement next |
| --- | --- | --- |
| Person 1 | CaseAdapter, StaffCaseViewSchema, BorrowerCaseViewSchema, fixtures/views/*.json | Explicit fixture adapter, then real session-aware database adapter; label fixture data |
| Person 2 | contracts/domain, shared enums/revision map, fixtures/applications/demo.json, fixtures/manifest.json | Pin toolchain, map records to schema, seed identities safely, authorized case read and investigation operations |
| Person 3 | InvestigationSnapshotSchema, ToolArgumentsSchemas, AnalysisToolResultSchema, analysis helpers, fixture sources | Live provider/tool smoke test, then claim a real job and call the helpers |

Main still contains the plans only. A database implementation is now available on origin/1-loanwick-database; it has been inspected but not merged or tested here. Its generated bindings remain owned by Person 2. Recheck branches before integrating.

## Person 1 details

- Read fixtures/views/staff-case.json for an open high equipment concern with source excerpts. Tool activity and job lists are empty deliberately: no model calls are invented.
- Read fixtures/views/borrower-case.json for a safe own-case request. It is an independent synthetic UI state, not evidence that the staff request was actually sent.
- Staff/borrower sample generation: npm run fixtures:views.
- Stable errors and UTC/integer-cent rules are in contracts. Keep bigint conversion inside one adapter.
- Server's canRelease is distinct from pure eligibleByPolicy. Never enable release solely from a frontend helper.
- CaseAdapter is logical, including correlated async results; adapt it to Person 2's actual supported subscriptions/reducers. If your adapter already differs, reconcile names together before making a parallel incompatible contract.

## Person 2 details

- The Zod entry point is for worker/browser boundary validation. Import the no-Zod domain entry point for pure server helpers, and verify actual module-runtime compatibility before use.
- Person 4 did not choose a database version or generate bindings. You own that tooling and identity bootstrap.
- Fixture manifest identities are synthetic placeholders. Map them to actual local authenticated identities privately; never allow a client to claim a role using the label.
- Evidence stores exact document versions. The fixture document paths belong to development tooling, not a browser download API.
- Review sequences must be server-assigned and unique per case/check. Latest nonpass overrides an earlier pass.
- Payment mutation increments paymentRevision plus applicationRevision. Both payment verification and conservative document consistency become stale; collateral review remains current unless collateral changed.
- Job completion must validate related-source revisions and source membership, not just the target revision. Added matching collateral/relationships can invalidate a formerly negative result. getChangedSourceIds helps compare complete sets but cannot make queries transactional.
- Claim tokens and private file keys must never enter staff projections.
- Recheck actor, stage, reviews, blocking findings, and prior release transactionally. Direct-call/race/idempotency tests remain your responsibility; local policy tests do not prove these controls.

## Person 3 details

```ts
import { InvestigationSnapshotSchema, AnalysisToolResultSchema, validateCheckResults } from '@loanwick/contracts';
import { analyzeSnapshot } from '@loanwick/analysis';

const snapshot = InvestigationSnapshotSchema.parse(authorizedSnapshot);
const output = AnalysisToolResultSchema.parse(analyzeSnapshot(snapshot));
validateCheckResults(snapshot, output.results);
```

- Individual model tools can call checkCollateralConflicts/checkGroupThreshold/getPaymentVerificationState directly. analyzeSnapshot runs both deterministic checks as a convenient no-model baseline.
- Pass only own-case review history to getPaymentVerificationState. The helper rejects ambiguous multiple-case histories.
- Output sourceRevisions captures all input cases, including cases that produced no concern. skippedCollateralIds reports incomplete active identifier support. Neither an empty result nor a successful call means a case is safe.
- Group above-threshold output requires actual matching amount/currency evidence; missing support fails explicitly. Do not invent values or suppress the error to show success.
- validateCheckResults is reference/schema validation, not full natural-language truth verification. Compare model quantitative assertions with returned structured facts and enforce tool scope outside the model.
- Ownership evidence must use fieldName=exclusiveOwnershipClaim with extractedValue=true; identifier evidence uses fieldName=identifier. Both reference the relevant application's source document.
- Canonical source files are already present and hashed. Extend/generate variants rather than silently overwriting IDs or excerpts; update source metadata and expected fixtures with Person 4.
- Persist accepted findings before creating clarification drafts with their stable IDs. Officer sends; worker never sends/approves/releases.

## Integration checklist

- [x] Shared contracts and runtime schemas compile.
- [x] Pure collateral/group/review helpers have positive and negative tests.
- [x] Eight canonical cases and actual source excerpts/hashes validate.
- [x] Independent expected results match deterministic fixture evaluation.
- [x] Staff and borrower sample views validate; staff job tokens are excluded.
- [ ] Person 2 confirms supported database runtime/toolchain and schema mapping.
- [ ] Real identities and authorized subscriptions are connected.
- [ ] Worker claims/persists one real job using shared inputs and results.
- [ ] Live NVIDIA model performs an actual bounded multi-step tool run.
- [ ] Officer/borrower exchange a real persisted clarification in separate sessions.
- [ ] Updated document extraction and human finding resolution work.
- [ ] Server rejects stale result completion, unauthorized reads/writes, and stale release.
- [ ] Server concurrency/idempotency tests pass.
- [ ] Browser end-to-end demo and fresh integrated setup pass.

No database/browser/model integration is marked done by these package tests. Do not add placeholder passing test:integration or test:e2e scripts before runnable implementations exist.

## Small next shared demo

1. Person 2 seeds app-excavator-a and app-excavator-b with all referenced document/evidence records.
2. Person 1 opens app-excavator-a using real authorized data.
3. Officer requests an investigation; Person 3 claims it, calls checkCollateralConflicts, and submits results.
4. UI shows the EX-0042 conflict and opens ev-excavator-a-ownership and ev-excavator-b-ownership for authorized staff.
5. Repeat using the verified live model/tool loop and show its actual execution mode and tool events.

## Communication

This environment lacks GitHub CLI. Signal was read via authenticated read-only GitHub API instead; it contained no additional component assignments/contract decisions at initial inspection. The user authorized publishing this foundation and sharing the handoff. Use the PR and signal handoff for the current shared interfaces.

## Database branch mapping to resolve

The inspected database branch uses SDK-native fields. Keep conversion in adapters; do not edit generated bindings.

| Database | Shared contract | Action |
| --- | --- | --- |
| amountCents: bigint, SDK timestamps | safe integer cents, UTC strings | Range-check before converting money; convert timestamps explicitly |
| evidence.fieldValue | evidence.extractedValue | Rename at the boundary |
| source.revisions nested | flat SourceRevision | Flatten/map explicitly |
| collateral has no assetType/ownershipEvidenceIds and no nullable ownership | namespaced assets and separate ownership evidence | Agree with Person 2 on real fields or a documented extraction adapter; never invent ownership evidence |
| job claimEpoch | claimToken-based logical job | Use the actual epoch lease protocol; settle the logical job interface before worker integration |
| tool status started; summaries max 280 | running; summaries max 2000 | Map status and enforce the smaller write limit |
| finding.type and relatedApplicationIds | findingType and applicationIds | Convert owner/related IDs; preserve source facts separately if storage lacks them |
| review superseded flag | ordered review sequence | Agree on authoritative history mapping; never revive an older pass |
| readiness also blocks pending jobs/clarifications | pure policy currently covers checks/findings/stage/releases | Treat server readiness as authoritative; extend shared input rules before claiming full parity |

The database worker projection currently limits related-case evidence to linked collateral/entities. Above-threshold group output also needs amount/currency evidence for every counted case; request an authorized projection change rather than fetching unrelated private documents. The database normalizes identifiers independently; align its policy with the shared hyphen/namespace rules before using its candidate scope.

## Real database test update

The separate `1-analysis-database-test` branch now exercises shared checks against database commit `0bc9396`. The existing database suite (12 tests), bridge suite (8 tests), and shared checks (92 tests) pass locally. See DATABASE-TESTS.md. Database source and generated bindings were not edited. The worker projection is handled by a separate adapter and minimal analysis-input schema; missing seed evidence remains explicit. Frontend/live model checks remain pending.

## Seed alignment completed

The integration branch now seeds explicit ownership evidence and source-backed amount/currency fields. Fresh demo cases produce both expected findings immediately; no test-only uploads are required. The source manifest, generator, hash/locator checks, and live suites are documented in DATABASE-TESTS.md. Schema/reducer signatures and generated bindings are unchanged. Run npm run test:database:local for the complete disposable-server check. Upload transport remains with its owner; the user confirmed frontend/worker branches are still being built.

## Upload capability integration completed

Database commit `09288eb` is now merged into this isolated test branch. The bridge uses its real HTTPS handler: authorize a secret hash, correlate the generated grant, send bytes without a user database token, stage private bytes, extract fixture JSON, attach metadata/evidence, and reject replay. All 22 live tests pass locally. The test now waits for the officer projection to catch up after a worker outcome. Frontend/worker applications are still being built, so their final wiring remains pending.
