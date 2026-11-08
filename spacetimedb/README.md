# LoanWick database

This module owns loan cases, evidence metadata, investigation leases, clarification, review, and simulated release. The frontend and worker use the generated TypeScript client in [`bindings/`](bindings/) with `spacetimedb` 2.14.0.

## Run locally

Use Node.js 24 and SpacetimeDB CLI and standalone server 2.14.0. These commands run from the repository root.

```sh
npm ci --prefix spacetimedb
spacetime start --listen-addr 127.0.0.1:4310 --in-memory --non-interactive
```

In another terminal, run the database integration suite or create a seeded demo.

```sh
npm --prefix spacetimedb run typecheck
npm --prefix spacetimedb run test:local
npm --prefix spacetimedb run demo:local
```

Set `LOANWICK_SPACETIME_CLI` to the full path of the 2.14.0 CLI if it is outside `PATH`. Set `LOANWICK_DB_URL` to a different loopback HTTP origin if you use another port. The scripts publish to a new local database on each run. Run `demo:local` again for a fresh demo with the same synthetic cases.

`demo:local` prints the database name and writes `spacetimedb/.local/<database>/sessions.json` with the endpoint and five separately authorized demo sessions. Keep this file local. Give each client only the token for its role. The database publisher owns bootstrap access, and the demo assigns distinct borrower, officer, reviewer, and worker identities.

Regenerate client bindings after a module interface change.

```sh
spacetime generate --lang typescript --module-path spacetimedb --out-dir spacetimedb/bindings --yes
```

## Client handoff

Use `DbConnection.builder().withUri(endpoint).withDatabaseName(database).withToken(token)`. Register subscriptions once from `onConnect`. Wait for `onApplied` before reading the initial cache, and disconnect when changing identities. Case IDs are strings, `amountCents` is `bigint`, and SDK timestamps support `toISOString()` for the domain adapter.

| Client | Authorized views |
| --- | --- |
| All roles | `my_user` |
| Officer and reviewer | `staff_applications`, `staff_documents`, `staff_evidence`, `staff_collateral`, `staff_entities`, `staff_match_candidates`, `staff_payments`, `staff_jobs`, `staff_tool_events`, `staff_findings`, `staff_clarifications`, `staff_responses`, `staff_reviews`, `staff_readiness`, `staff_releases`, `staff_audit_events` |
| Borrower | `borrower_applications`, `borrower_documents`, `borrower_clarifications`, `borrower_own_responses`, `my_upload_grants` |
| Worker | `worker_available_jobs`, `worker_snapshots`, `worker_job_outcomes`, `worker_upload_grants` |

The frontend can correlate `requestInvestigation` with `staff_jobs` using `applicationId` and its own `runKey`. Generate a new run key for a fresh attempt. `staff_findings.isCurrent` identifies findings whose source revisions still match. The officer sends a clarification after selecting a borrower-safe template (`collateral`, `financials`, or `supporting`). Borrowers see only requests that were sent to them.

Workers subscribe to snapshots and outcomes before claiming a queued job. `worker_snapshots` provides the lease epoch, deadline, and evidence. Send the epoch on each job write. Tool event sequences start at 1 for each claim. A lease is at most 120 seconds per claim or renewal and expiry can requeue the job up to three claims total. Related cases include matching collateral and confirmed relationships, with scoped source evidence.

Wait for the terminal row in `worker_job_outcomes` for the job ID and claim epoch after submitting completion. Treat `succeeded` as acceptance and use its `acceptedFindingIds` for the next step. A stale completion commits `failed` with `STALE_RESULTS` and leaves findings untouched even though the reducer call resolves. If a claim encounters stale inputs before assigning a lease, its terminal outcome appears by job ID without a snapshot. `failed` also carries provider errors such as `MODEL_UNAVAILABLE`. `cancelled` ends the attempt. Only the assigned worker can read the outcome. Invalid calls such as `LEASE_LOST` still reject directly.

When a successful rerun returns the same unresolved finding key on the same case, it refreshes the existing finding ID and retains its human status and clarification links. Prior content is captured in a `finding_refreshed` audit event. Omitted findings stay open until a human resolves them.

For document transport, the uploader calls `authorizeUpload` with the case, request when applicable, document type, and worker ID. Check the grant through the uploader's authorized session before accepting bytes. The assigned worker calls `attachDocument` with the same grant. The reducer rechecks identity, application revision, expiry, request state, and document version. The worker owns file bytes, extraction, and storage, while the database owns the authorized metadata and evidence.

The reviewer submits the exact observed revision to `recordReview`. Collateral review follows `collateralRevision`, payment verification follows `paymentRevision`, and document consistency follows `applicationRevision`. Attaching a payment document advances both the payment and application revisions and retires earlier payment documents. The reviewer calls `changePaymentInstructions` to select the instruction for the new evidence. To approve payment, cite evidence linked to that instruction from a current payment document whose `syntheticAccountToken` field matches the selected account token.

`staff_readiness` is the authoritative release gate. It requires a successful investigation whose case, related source revisions, and source membership are current. `INVESTIGATION_MISSING` means there has been no successful run. `INVESTIGATION_STALE` means earlier runs succeeded against inputs that have since changed. Rerun the investigation after a borrower response or payment change. An unresolved high ownership conflict with matching exclusive collateral claims and cited evidence blocks each implicated case. Name or address similarity alone does not create a hold. Use `simulateRelease` with a stable idempotency key, then read `staff_releases`. Label the result **SIMULATED RELEASE — NO MONEY MOVED**.

The integration suite connects separate authenticated clients and exercises permissions, investigation, scoped evidence, clarification, stale approvals, and release races. The seeded evidence is synthetic. Live model execution and document bytes are supplied by the worker integration.
