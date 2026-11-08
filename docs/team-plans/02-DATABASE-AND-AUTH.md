# Person 2: SpacetimeDB, authorization, and release policy

## Your outcome

Build the authoritative state and business transitions for the loan-investigation prototype. Staff can investigate and request clarification; borrowers can answer only their own requests; reviewers can record checks and simulate a release only when the current server state permits it.

Read 00-START-HERE.md before creating schemas. The repo has no application scaffold yet. Verify toolchain capabilities rather than assuming an SDK API exists.

## Ownership

- Own spacetimedb/, schema/reducers/authorized projections, database integration tests, seed/bootstrap, and binding-generation workflow.
- Coordinate shared domain types with Person 4 and binding output with Person 1.
- Do not add another database or a conventional REST CRUD service.
- Do not expose sensitive tables publicly to make frontend subscriptions easier.

Suggested structure, adjusted to the actual supported scaffold:

```text
spacetimedb/src/
  schema/
  reducers/
  views/
  auth/
  policy/
spacetimedb/tests/
```

## Step 1: Prove the toolchain and identity model

1. Inspect current repository work and coordinate root dependencies with Person 4.
2. Verify compatible SpacetimeDB CLI/server/TypeScript module/client SDK versions using their installed output and matching official docs.
3. Pin versions and record exact start, publish-to-local, connect, seed, and binding-generation commands.
4. Build the smallest private application record and a supported authorized read path.
5. Prove a privileged identity can read it and an anonymous/unrelated identity cannot.
6. Establish controlled local bootstrap for officer, reviewer, worker, and two distinct borrowers. No unrestricted choose-my-role operation.
7. Generate bindings and give Person 1 a minimal real subscription example.

Deliverable: seeded application visible only to an authorized identity through a real client connection. Surface unsupported authorization features immediately; agree on a supported secure approach before building all tables.

## Step 2: Schema and safe projections

Implement the records in the shared contract incrementally:

1. Users, applications, document metadata, evidence, collateral, and payment instructions.
2. Investigation jobs, leases, tool events, and findings.
3. Clarification requests, borrower responses, human review records, audit events, and demo releases.
4. Entity records and candidate/confirmed relationships for the group-threshold check.

Preserve evidence/document versions and immutable audit history. Add supported indexes for application, borrower, organization, job status, and normalized collateral identifier as needed for actual access patterns.

Projections:

- Staff portfolio/case: organization-scoped application, findings, evidence, related-case summaries, tool events, and reviews.
- Borrower case: own application and sent requests/responses; exclude internal findings, other borrowers, storage keys, and confidential evidence.
- Worker job: claimed case scope and permitted related-case inputs; no general cross-organization dump.

Do not rely on client subscription filters as authorization. Check both read paths and every mutation.

Deliverable: Person 1 can replace its fixture adapter, and Person 3 can retrieve a narrowly scoped job snapshot.

## Step 3: Job lifecycle and result persistence

Implement logical operations from the shared plan with supported reducers/views:

1. requestInvestigation: authorize officer, capture revisions and mode, create a job, return/expose correlatable job ID.
2. claimInvestigation: atomically claim an available job, issue a claim token and lease deadline, record worker identity.
3. Renew a lease or use a documented execution timeout safely below lease duration. Define how expired jobs are reclaimed.
4. recordToolEvent: validate worker identity, current claim, event sequence, size bounds, and safe fields.
5. completeInvestigation: validate claim/lease, current revision vector, related-source revisions, evidence references, application scope, and domain schema.
6. Save accepted findings and terminal job state atomically. Deduplicate retries with runKey/finding keys.
7. For stale results, retain run history and mark the job failed with errorCode STALE_RESULTS; do not insert current findings or mutate current evidence from the rejected completion.
8. failInvestigation/cancel: record a safe terminal state; late completion by an expired/cancelled worker cannot succeed.

Agree with Person 4 on cross-case revision validation. A change in application B must invalidate a result for A that depended on B, even when A's own revision is unchanged. MVP may store captured dependent case revisions on the job/result and compare them at completion; choose actual representation together.

Deliverable: two workers cannot both own the same active claim, retry cannot duplicate accepted results, and a stale worker cannot overwrite fresh state.

## Step 4: Human workflow and document updates

1. Permit officer/worker to create drafts against existing findings. Only the officer sends borrower-visible messages.
2. Validate outgoing message content and approved evidence context; do not copy third-party excerpts into borrower text.
3. Borrower responses must reference an own sent request. Reject cross-case request IDs and closed requests.
4. Coordinate upload authorization with Person 3: authorize before bytes are accepted and again before metadata/evidence attachment. Bind upload scope to authenticated actor, case, and request.
5. Worker extraction writes must use the same authorized upload/extraction context; job scope alone is not permission to attach arbitrary documents.
6. Preserve old evidence versions. A newly submitted document does not automatically resolve a finding or pass a review.
7. Human resolve/escalate/reopen requires permitted role and nonempty rationale. Audit actor and transition.
8. Confirm/reject entity relationships through a human decision; similarity alone never confirms identity.

Deliverable: separate officer and borrower identities complete the clarification round trip with no third-party data exposure.

## Step 5: Revision invalidation and atomic release

Implement the exact shared revision agreement:

- Overall applicationRevision changes whenever investigation inputs change; also advance collateralRevision/paymentRevision where relevant.
- Review map: collateral_review uses collateralRevision; payment_verification uses paymentRevision; document_consistency_review conservatively uses applicationRevision.
- The data update, revision increment, affected review invalidation, readiness change, and audit event happen atomically.
- Reviews bind to the revision observed by the reviewer. Reject a stale submit if data changed after it was loaded.
- Compute readiness server-side and expose machine-readable reasons plus useful UI text.

simulateRelease must atomically verify:

1. Actor is an active authorized reviewer in the application's organization.
2. Application is in the documented eligible state and has no previous release.
3. collateral_review, document_consistency_review, and payment_verification all exist, passed, and reference current revisions.
4. No high-severity finding is open, awaiting_response, or escalated.
5. Idempotency key/application uniqueness rules permit this operation.

Then insert the immutable DemoRelease, set released_demo, and audit. Same-key retry returns the prior result; different keys cannot release the same case twice. If release precedes a competing relevant edit, reject that edit because the case is already released. If the edit precedes release, release sees the new stale checks and fails.

No external payment calls. Expose a clear simulated-only result.

## Required verification

Use the pinned database toolchain's supported integration mechanism with real distinct identities. Coordinate the command runner with Person 4.

- Anonymous cannot read application data.
- Borrower A cannot read or mutate borrower B's data, even using known IDs/direct calls.
- Officer/reviewer access is organization-scoped; inactive users are rejected.
- Worker cannot send a request, resolve a finding, record human review, or release.
- Unauthorized role assignment and document attachment fail.
- Two simultaneous claims have one winner; expired lease holders cannot complete.
- Repeated completion creates no duplicate findings; stale own-case or related-case inputs reject completion.
- Invalid/foreign evidence IDs reject an entire result rather than partially saving it.
- Borrower upload leaves the finding awaiting human review.
- Payment change invalidates payment verification; documented conservative document review invalidation also occurs.
- Missing/stale/failed required checks and blocking findings prevent direct release calls.
- Payment-update/release race obeys transaction order; concurrent release attempts create one record.
- Same release key retries successfully; another key creates no duplicate.

## Acceptance checklist

- [ ] Pinned compatible toolchain and reproducible local setup documented.
- [ ] Safe server-enforced projections and mutation authorization work with distinct identities.
- [ ] Frontend bindings generated reproducibly and handed off.
- [ ] Job claim, lease, result validation, and stale handling work.
- [ ] Clarification, document attachment, and human review transitions are audited.
- [ ] Revision invalidation and release gate are transactional.
- [ ] Direct calls cannot bypass UI restrictions.
- [ ] Relevant integration tests run with actual results reported.

## Handoff

Send Person 1 generated bindings, projection types, connection setup, seeded identities, and error mapping. Send Person 3 job/lease/write contracts and upload-authorization integration. Send Person 4 schema decisions, revision dependencies, exact commands, and passing/failing checks. Do not hand-edit generated bindings or claim a stubbed authorization check proves server enforcement.
