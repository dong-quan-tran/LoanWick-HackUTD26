# Contract v0.1.0

Authoritative types: packages/contracts/src/domain.ts. Runtime boundaries: packages/contracts/src/schemas.ts. These are proposed shared interfaces ready for integration; they do not assert that database reducers or frontend adapters already exist.

## Conventions

- IDs are bounded strings at package/UI boundaries. Database bigint IDs must use a single conversion adapter, not lossy Number conversion.
- Money uses nonnegative safe-integer cents and a separate uppercase three-letter currency. Group totals reject unsafe sums and unlike currencies. Zero is valid; absent is not zero.
- Timestamps are UTC ISO strings ending in Z. Revisions and review sequences are nonnegative safe integers.
- Runtime objects are strict: extra private fields are rejected instead of silently passed through.
- All document hashes are lowercase SHA-256. JSON evidence uses real $.field locators and null pageNumber, never invented PDF pages.
- A normalized identifier is computed by analysis; do not persist an independently calculated normalization and assume the policies match.

## Snapshot and findings

InvestigationSnapshot contains target applicationId, authorized applications, document metadata, evidence, collateral, application relationships, and review history. It must contain unique record IDs, one organization, correct document versions, valid ownership/reference scope, and unambiguous review sequences. This structural validation is not authorization: the database must construct the permitted snapshot.

Collateral separates identifier evidenceIds from ownershipEvidenceIds. An exclusive-ownership conflict requires identifiers supported by fieldName=identifier evidence and ownership supported by fieldName=exclusiveOwnershipClaim, extractedValue=true in each application's own evidence. At least two distinct active applications must claim exclusive ownership. Missing ownership support yields unknown/review when a supported identifier is shared. A missing/invalid identifier is not matched and never becomes a clean-case guarantee.

Demo normalization trims outer whitespace, uppercases ASCII, preserves hyphens and leading zeros, and rejects unsupported characters/internal whitespace. Explicit alternate IdentifierPolicy can change case/separator handling; worker and module must use the same policy. Matching is scoped by the exact assetType namespace, which is also included in result facts and deduplication keys. Real identifier formats may require additional explicit policies.

CheckResult contains structured facts, actual evidence IDs, all source application IDs, complete source revision vectors, uncertainty, next step, rule version, and stable deduplicationKey. Finding adds persistence identity, owner applicationId, job link, lifecycle status, and timestamps. Cross-case sources are in applicationIds; there is deliberately no second independently maintained relatedApplicationIds array.

validateCheckResults checks result shape, source membership, evidence references, complete/current captured source revisions, and duplicate keys. It does not establish that model prose is true or recompute every numeric claim. Person 3 must compare model assertions to deterministic tool facts; Person 2 validates again against current persisted state before acceptance.

## Group policy

DEMO_GROUP_POLICY is synthetic-confirmed-group-review v1.0.0: strictly greater than USD 100,000,000 cents ($1 million), using submitted/reviewing/clarification_needed/ready_for_release requests. This is a configurable demo policy, not a lending regulation.

Confirmed human-reviewed relationships with supporting evidence form connected components. Candidate/rejected links do not. Inactive members can connect a component but add no money. Every active request is counted once. A group finding captures all membership source revisions, relationship evidence, and matching amountCents/currency evidence for each counted request. Above-threshold data without quantitative source evidence fails explicitly. Mixed currencies require partition/review; no exchange rate is guessed.

## Revisions and latest reviews

| Review | Relevant revision |
| --- | --- |
| collateral_review | collateralRevision |
| payment_verification | paymentRevision |
| document_consistency_review | applicationRevision |

applicationRevision advances on every relevant investigation input change; collateral/payment changes also advance their specific revision. The document review mapping is intentionally conservative. Review/log creation alone does not advance evidence revisions.

ReviewRecord.sequence is monotonic and unique per application/check type, assigned by the server. Highest sequence is authoritative, not client timestamp or highest passing review. A later needs_review supersedes an earlier pass. Missing -> pending; passed current -> current; revision mismatch or explicit stale -> stale; current needs_review -> needs_review.

captureSourceRevisions/getChangedSourceIds compare complete source sets, detecting changed, added, and removed members. A job must capture the entire bounded query dependency scope, not only applications appearing in a positive finding. Comparing old known IDs alone misses a newly added matching claim. Person 2 must use a supported index/query-generation revision or recheck current source membership/inputs transactionally at completion. These helpers do not make database reads atomic.

## Policy readiness versus authorization

getPolicyReadiness returns eligibleByPolicy, per-check state, and reasons. It does not return canRelease or authenticate a caller. Eligible stages are reviewing, clarification_needed, and ready_for_release, provided all other checks pass.

The server's ReleaseReadiness adds canRelease after actor/organization authorization. High open/awaiting_response/escalated findings block; human-resolved findings do not. Missing/stale/nonpassed reviews, invalid stage, or prior release block. The release reducer rechecks within a transaction and enforces one release per application plus idempotent same-key retry. Local policy tests are not proof that this reducer exists.

## Views, tools, and adapter

- StaffCaseViewSchema includes safe evidence, findings, review/readiness, real job/tool summaries, requests/responses, and audit data. Staff job projections omit claimToken. DocumentMetadata never contains private storage keys.
- BorrowerCaseViewSchema permits only own public application fields, sent/answered/closed safe requests, and own responses. It excludes finding IDs, internal evidence, related applicants, role mappings, and draft requests. Server identity/scope enforcement is still required.
- CaseAdapter defines subscription and asynchronous mutation contracts. Its Promise results describe the adapter's correlated operation result, not a claim that a SpacetimeDB reducer directly returns arbitrary objects. Person 1 and Person 2 implement this with the actual supported SDK semantics.
- ToolArgumentsSchemas contains only the seven allowed investigation tools. It provides no approval, send, release, filesystem, shell, or URL-fetch tool. Tool arguments still require server/worker scope enforcement.
- AnalysisToolResult can include skippedCollateralIds so missing identifiers/evidence are visible rather than presented as a clean investigation. sourceRevisions must capture the entire input scope, including negative matches.
- ClarificationDraft references an existing finding. Worker may draft; officer alone sends. Its schema cannot prove free text contains no confidential information; generate from allowlisted own-case context and preview with an officer.

Errors follow the shared ERROR_CODES and include a correlationId. Borrower-facing not-found/forbidden responses must not disclose other-case existence. Model/extraction failures remain explicit; live mode never silently becomes fixture mode.

## Worker projection compatibility

`AnalysisSnapshotSchema` is the boundary for minimal authorized worker inputs. It accepts full offline application records or minimal analysis applications without borrower identity/timestamps. Original `InvestigationSnapshotSchema` remains strict for full fixtures. Both share reference/revision checks. `fixture` is an explicit extraction method, not live extraction.

An analysis relationship may cite `confirmationSource=authorized_projection` only when constructed from the server's authenticated confirmed-relationship view. That marker does not authenticate arbitrary JSON or model output. The adapter must remain outside model control. Missing review metadata is not replaced with invented identities or dates.

Use `toAnalysisSnapshot` and `toDatabaseFindings` from the database-adapter package on this integration branch; see DATABASE-TESTS.md for evidence requirements, database write limits, and seed differences.
