# LoanWick worker

The worker claims an investigation, runs the deterministic collateral and group checks, records bounded tool events, and stores findings from `toDatabaseFindings`. The model may explain those results. It does not invent a fraud match, send a borrower question, or approve a loan. An officer sends drafts.

JSON, CSV, and text-PDF intake lives in this package. The public site is unchanged and does not receive `NVIDIA_API_KEY`. Do not put that key in `VITE_*` or the website bundle.

## Modes

`AGENT_MODE=fixture` (the default) never calls NVIDIA. Fixture jobs complete with `modelId` omitted.

`AGENT_MODE=live` stays live when the provider fails. It does not switch to the fixture provider. A live job is completed only with the configured `NVIDIA_MODEL`. A live job refused by a fixture worker is failed as `MODEL_UNAVAILABLE`.

`connectedDatabase` is true only for `runQueuedCloudJob`, which requires `SPACETIMEDB_TOKEN`. Tests use an in-memory claim session and do not call the shared database.

## Environment

Names only. Values stay in `apps/worker/.env`, which is not committed and must not be printed.

- `AGENT_MODE` `fixture` or `live`
- `AGENT_MAX_STEPS` from 1 to 8
- `AGENT_TIMEOUT_MS` from 1000 to 120000
- `WORKER_UPLOAD_DIR` development-only private directory
- `SPACETIMEDB_URI`, `SPACETIMEDB_DATABASE`, `SPACETIMEDB_TOKEN` for a real claim
- `NVIDIA_BASE_URL`, `NVIDIA_API_KEY`, `NVIDIA_MODEL` for live mode
- Optional `NVIDIA_MAX_TOKENS`, `NVIDIA_TEMPERATURE`, `NVIDIA_TOP_P`, `NVIDIA_REASONING_BUDGET`

Copy `.env.example`. A live clock smoke still uses `npm run smoke`.

## Commands

From the repository root:

```text
npm run typecheck --workspace @loanwick/worker
npm test --workspace @loanwick/worker
npm run smoke --workspace @loanwick/worker
npm run investigate --workspace @loanwick/worker
```

`investigate` runs the local demo case unless `SPACETIMEDB_TOKEN` is set. A cloud claim subscribes to `my_user`, `worker_available_jobs`, `worker_snapshots`, and `worker_job_outcomes` before `claimInvestigation`. This machine has no worker-role token, so a live claim against `loanwick-hackutd26-dev` has not been run. `claimEpoch >= 3` is not claimed; the server fails that job as `LEASE_EXHAUSTED`.

Local check: `npm run typecheck --workspace @loanwick/worker` passed, and `npm test --workspace @loanwick/worker` passed 50 tests. Those tests use an in-memory claim client. They do not call the shared database.

## Job rules

The worker claims one queued job, keeps that claim epoch, and reads only that job's snapshot. Tool events use sequence 1, 2, 3, and so on, status `started`, `succeeded`, or `failed`, summaries of at most 280 characters with no newlines, and `durationMs` of at most 120000. Over-long durations fail the job instead of being clipped. Findings passed to `completeInvestigation` are recomputed with `toDatabaseFindings`. Fixture completion omits `modelId`. Stale inputs call `failInvestigation` and do not complete. The same completion payload may be tried up to three times after a transient transport error, and it is not retried after `STALE_RESULTS` or with refreshed revisions. A claim is not retried. Draft creation happens after accepted finding ids exist. Draft failure leaves the investigation succeeded. The worker does not call `sendClarification` or `decideFinding`.

## Intake

Supported uploads are JSON, CSV, and text PDFs, at most 10 MB. The grant's application, request, document type, and uploader are authoritative. A caller-supplied role or case id is not. A browser `Origin` that does not match the allowed origin is rejected. A request that sends a cookie must also send the matching CSRF token. Bytes are hashed with SHA-256 and stored under an internal `wk_` plus 32 hex characters. JSON evidence uses `$.field` locators. CSV evidence uses `row N column name`. PDF text comes from `unpdf` 2.1.0 `extractText(bytes, { mergePages: false })`, one string per page. Missing fields stay unknown. Malformed extraction is `failed` with no evidence. A PDF with no extractable text, including a scan, is `unsupported`. No fixture document is substituted.

Worker-local storage is development-only. `cleanupUnattachedUploads` deletes unattached private files older than 24 hours from `WORKER_UPLOAD_DIR`. It does not delete canonical fixtures. If the application revision changes before attachment, attachment is refused.

The website at https://loanmebro.vip was not changed by this intake. Uploads are not accepted there until an officer grant and a worker token are wired to this extractor.

Text PDFs are parsed from their bytes. Expected-result sidecars are not model input and are not treated as findings.
