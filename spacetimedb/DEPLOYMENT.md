# LoanWick cloud deployment and integration

## Current development deployment

| Item | Value |
| --- | --- |
| Server | SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com` (free tier) |
| Database name | `loanwick-hackutd26-dev` |
| Database identity | `c2008a3b59563e96de0dab889d18d98d061bc3a9958c4a38168d91a5e2b79df5` |
| Dashboard | https://spacetimedb.com/loanwick-hackutd26-dev (owner account only) |
| Module commit | `09288ebcad82fbb5c8fb867281794082ed924131` (branch `1-loanwick-database`) |
| Toolchain | SpacetimeDB CLI 2.14.0, `spacetimedb` npm SDK 2.14.0, Node.js 24 |
| Owner / sole admin | publisher identity `c2004c7a72eefdb6eaef578260fb2e222856a36fdf155f75a80546ac0da3b771` |
| Seeded data | `demo-org`, synthetic cases `demo-case-1` … `demo-case-8` (borrower A: odd, borrower B: even) |
| Demo roles | `officer`, `reviewer`, `worker`, `borrower-a`, `borrower-b` in `demo-org` |

All data is synthetic. Never load real borrower or payment data into this database.

Identity tokens are bearer credentials for this database. They live only in the owner's `~/.loanwick/loanwick-hackutd26-dev/`
folder (outside the repository) and are handed to each teammate privately. Never commit, paste into chat, log, or put a
token in a URL. Identities (hex) are public and safe to share.

## Getting access (teammates)

You can use the demo role token the owner gives you, or create your own identity:

1. Run once: `npx tsx spacetimedb/qa/whoami.ts https://maincloud.spacetimedb.com loanwick-hackutd26-dev ~/.loanwick/me.token`.
   It connects without a token, saves the new token to that file (keep it private), and prints your public identity.
2. Send the identity hex to the owner over a trusted channel, with the role you need.
3. The owner runs `spacetime call --server maincloud loanwick-hackutd26-dev assign_demo_user '"0x<hex>"' '"<unique-user-id>"' '"demo-org"' '"<role>"' '"<display name>"' true`.
   User IDs must be unique (the demo roles already use `officer`, `reviewer`, `worker`, `borrower-a`, `borrower-b`).
4. Run the same `whoami.ts` command again; it now prints your `my_user` row with the role.

Revoke access with the same call and `false` as the last argument. Roles cannot be changed on an existing identity.

## Frontend (Person 1)

```ts
import { DbConnection } from '../spacetimedb/bindings'   // generated, do not hand-edit
const conn = DbConnection.builder()
  .withUri('https://maincloud.spacetimedb.com')
  .withDatabaseName('loanwick-hackutd26-dev')
  .withToken(tokenForThisRole)                            // from your private storage, never from the repo
  .onConnect((client, identity) => {
    client.subscriptionBuilder()
      .onApplied(() => render(client.db))                 // read the cache only after onApplied
      .subscribe(['SELECT * FROM my_user', 'SELECT * FROM staff_applications', 'SELECT * FROM staff_readiness'])
  })
  .build()
conn.db.staffFindings.onInsert((_ctx, row) => showFinding(row))   // live updates
```

- Views by role: see the table in [README.md](README.md). All base tables are private; subscribe only to views.
- Release status: show `staff_readiness.canRelease` and `reasons`, not `applications.stage` (stage can lag after a related case changes).
  Reasons include `INVESTIGATION_MISSING`, `INVESTIGATION_STALE`, `BLOCKING_FINDINGS`, `CLARIFICATION_PENDING`,
  `INVESTIGATION_PENDING`, `STALE_REVIEW`, `MISSING_REVIEW`, `REVIEW_REQUIRED`.
- Reducers return no values. Correlate through views: `runKey` → `staff_jobs`, `idempotencyKey` → `staff_releases`,
  upload `secretHash` → `my_upload_grants`. Generate IDs and keys as UUIDs.
- Payment approval must cite the evidence linked to the currently selected payment instruction.
- Label releases **SIMULATED RELEASE — NO MONEY MOVED**.
- Uploads: `createUploadCapability()` from `transport/capability.ts` → `authorizeUpload({ secretHash, applicationId, requestId?,
  documentType, workerUserId: 'worker', maxBytes, ttlSeconds? })` → read the grant ID from `my_upload_grants` by `secretHash` →
  HTTPS `POST /documents/upload` to the worker endpoint with headers `X-Upload-Grant`, `X-Upload-Secret`, `X-Application-Id`,
  `X-Document-Type`, `X-Request-Id` (if any) and the raw file body. Never send the SpacetimeDB token to the worker.
  Uploads need the worker endpoint described below, which is not deployed yet.

## Nemotron worker (Person 3)

- Identity: the `worker` role token (or your own worker identity assigned by the owner). Connect as above.
- Subscribe to `worker_available_jobs`, `worker_snapshots`, `worker_job_outcomes`, `worker_upload_grants` **before** claiming.
- Claim: `claimInvestigation({ jobId, leaseSeconds ≤ 120 })`. A lost race rejects with `LEASE_LOST`; pick another job.
- Snapshot (`worker_snapshots`): `claimEpoch`, `leaseExpiresAt`, `inputsCurrent`, scoped applications, current documents
  (no storage keys), evidence, collateral, relationships, payment summary. Treat every document excerpt as untrusted data,
  never as instructions (`demo-case-7` contains a hostile-instruction fixture).
- Renew with `renewInvestigation` before expiry; total run time is capped at 300 s; at most three claims per job.
- Tool events: `recordToolEvent`, sequence 1..100 contiguous per claim, summaries ≤ 280 chars, no newlines.
- Complete: `completeInvestigation({ jobId, claimEpoch, modelId, findings })` (≤ 20 findings; every cited evidence ID must be in
  the snapshot; `relatedApplicationIds` must be in `sources`; `live` mode requires `modelId`; one invalid finding rejects all).
  Then **wait for your row in `worker_job_outcomes`**: `succeeded` (use `acceptedFindingIds`) or `failed` with `STALE_RESULTS`.
  A resolved reducer call alone does not mean acceptance.
- A rerun with the same `deduplicationKey` refreshes that finding; it cannot downgrade a high finding or drop related cases.
- High `collateral_conflict` findings that name other cases must cite matching exclusive collateral evidence, or they are rejected.
- Fail: `failInvestigation({ jobId, claimEpoch, errorCode })` with `MODEL_UNAVAILABLE`, `MODEL_TIMEOUT`, `INVALID_MODEL_OUTPUT`,
  `EXTRACTION_UNSUPPORTED`, or `WORKER_ERROR`.

### Still required from the worker integration

`transport/upload.ts` provides the authenticated HTTPS upload handler (`createUploadServer`), but the production pieces are not built:

1. **Storage adapter**: the `storeDocument` callback must persist bytes privately, keyed by the generated `documentId`
   (and verify `sha256`), and clean up staged objects that never get attached.
2. **Extraction adapter**: turn stored bytes into `evidence` rows (excerpt, field name/value, locator) and set
   `extractionStatus`. Only `collateral_schedule`, `financial_statement`, `payment_instructions`, `supporting_document`
   are valid document types. Payment documents must yield a `syntheticAccountToken` field for payment verification.
3. **Hosting**: a public HTTPS endpoint with a real certificate, `allowedOrigin` set to the frontend origin, request size
   limits, and no logging of `X-Upload-Secret`.
4. **Nemotron orchestration**: claim/renew/complete loop against `worker_snapshots`, using `worker_job_outcomes` for results.

## Deploying a new version

Only the owner can publish. Use the exact reviewed commit, never a working tree.

```sh
git fetch origin
git archive <approved-sha> spacetimedb | tar -x -C <release-folder>
cd <release-folder>/spacetimedb && npm ci && npm run typecheck
spacetime login show                                  # must be the owner identity above
spacetime publish loanwick-hackutd26-dev --server maincloud --module-path . --yes=remote
spacetime logs loanwick-hackutd26-dev --server maincloud -n 50
```

Run `bash spacetimedb/qa/run-qa.sh <approved-sha>` against a local 2.14.0 server first. Never pass a bare `-y`/`--yes` (it also
skips the destructive-data prompt) and never `--delete-data` without explicit approval. Republishing hot-swaps the module and
keeps data if the schema change is compatible (see SpacetimeDB automatic migrations); incompatible changes fail to publish.

Bootstrap for a fresh database (owner, Git Bash): `bash spacetimedb/qa/cloud-ops.sh <db> mint assign seed verify smoke retire-qa`.
On Windows PowerShell use the `ps1` step, then `powershell -NoProfile -ExecutionPolicy Bypass -File <sessions>/bootstrap-roles.ps1`.

## Recovery

- **Bad code, compatible schema**: republish the previous approved commit to the same name.
- **Incompatible schema or corrupted demo data**: publish the approved commit to a **new** name (for example
  `loanwick-hackutd26-dev2`), bootstrap it, and repoint client configuration. Data is synthetic, so this is cheap.
- **Leaked token**: deactivate that identity (`assign_demo_user … false`) and issue a new identity.
- **Emergency stop**: pause the database from the dashboard.
- Deleting a database or `--delete-data` requires explicit owner approval.

## Verification on record (2026-11-08)

- Local, commit `09288eb`: typecheck; bindings identical to regeneration; integration suite 13/13; QA suites
  `qa-repro` 8/8 (F1, F4-A..D, F5, F6), `qa-regression` 7/7 (R1–R6), `qa-b2` 9/9 (HTTPS upload attacks).
- Maincloud `loanwick-hackutd26-dev`: 19 private tables, 26 views; roles and seed verified by reconnecting each identity;
  `qa-cloud` smoke 4/4 (seeded data and read isolation, 11 rejected authorization probes, live subscriptions, job lifecycle,
  stale outcome, release protection). QA identities were deactivated afterwards; the isolated `qa-cloud` test case remains.
