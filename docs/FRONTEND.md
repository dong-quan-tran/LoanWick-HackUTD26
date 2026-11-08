# Person 1 frontend handoff

## Implemented on this branch

The staff home at `/` redirects to `/applications`; borrowers retain their authorized own-case home. Applications follows the user-pinned reference: narrow warm-brown navigation, ivory canvas, compact white bordered panels, system UI text, Source Serif 4 totals, blue stages, clay concern pills, and green Clear indicators. The shared shell serves officer, borrower, reviewer, and entered verification screens; existing case/borrower/reviewer deep links remain supported. App owns one session subscription.

Portfolio summaries aggregate the complete authorized `PortfolioItem[]`, independently of table search/stage/concern filters. They count applications, latest succeeded investigations, open findings and flagged cases, and ready/released stages. Money totals and row amount bars use per-currency sums/maxima with no FX summation. Release-ready is a stage count, not server permission to release. The canonical fixture shows 8 applications, USD 1,980,000 (displayed $2M with an exact accessible value), 4 open concerns across 4 cases, 8 Reviewing, and 0 ready/releases. Subscription updates, loading skeletons, empty results, and errors are covered.

`/verify` remains an officer route. Its existing full-screen espresso dossier cover, copy, artwork, and Menu are preserved. The desk stays mounted below it; entry, skip, keyboard focus, direct file input, and sample access reveal the shared shell without losing input state. The selected-loan dropdown sits above a compact white upload panel. Upload, progress, results, and evidence remain on one page. The desk no longer uses the parchment double frame, gold loan pill, or floating banknotes; banknotes remain on the cover and the small folio remains in upload.

At 700px and below, shared navigation expands from Menu and supports Escape; portfolio filters stack and the table scrolls within a focusable contained region. Metrics use four columns on desktop, two at 999px and below, and one at 599px and below. Borrower synthetic supporting-document content remains grouped in its tinted panel.

Officer file checks cover a 10 MB limit, extension, PDF header/DOCX package markers, and the selected bytes' SHA-256. They do not extract contract text or certify authenticity. Both contract verification and sample runs progress through a staged sequence of plain-language status updates (reading contract pages, comparing equipment IDs and sole-ownership claims, calculating connected borrower limits, and preparing the summary) before revealing non-technical concern titles, explanations, and human-readable document records that translate raw JSON/JSONPath locators into clear business labels and application context. Default PDF/DOCX intake reports unavailable and explicitly says the file was not uploaded.

`LiveAdapter.uploadContract` uses officer application scope, `supporting_document`, optional request ID omitted, and the existing single-use HTTPS capability protocol. Enable `VITE_CONTRACT_UPLOAD_ENABLED=true` only after the configured worker privately stores and extracts PDF/DOCX. The client waits for matching owned document metadata/hash, reconciles uncertain attempts, and refuses blind replay. The screen requests a live investigation only after the stored contract's extraction succeeds; messages come from actual document/job/tool projections. Failed/unsupported extraction and worker failures stay visible. No PDF/DOCX worker service or model verification has been exercised here.

`apps/web` is a React/Vite/TypeScript application with an evidence-first staff workspace, application portfolio, borrower view, clarification preview/send, human decisions, review checks, payment changes, tool activity, audit history, and simulated release.

The complete **fixture** workflow is runnable. Its single-window identity switch is explicitly synthetic and does not authenticate a real person. All canonical records remain synthetic. The fixture adapter runs the shared deterministic analysis helpers; no live model calls or tool traces are invented.

The **live** adapter uses unchanged Person 2 bindings from database commit `09288ebcad82fbb5c8fb867281794082ed924131` (SpacetimeDB 2.14.0). It subscribes to `my_user`, then only the permitted staff or borrower projections. A real loopback database browser test now verifies the subset below; compilation and the offline fixture suite do not establish live worker/document integration.

The decorative upload artwork was generated with the built-in image tool, optimized to a 600×400 WebP (~36 KB), and saved at `apps/web/src/assets/contract-folio.webp`. Its exact generation prompt is in `apps/web/.impeccable/assets/contract-folio.prompt.txt`, with a provenance sidecar beside the image. No image API secret is used by the frontend.

## Run and verify

Use the repository's Node 24 CI baseline and npm. From the root:

```sh
npm ci
npm run dev:web
```

Open http://127.0.0.1:5173. The fixture app opens Applications; open Cedar Demo Excavation for the case journey. Demo controls provide reset, disconnection, and investigation-failure scenarios. Synthetic scenario state and the synthetic identity persist in session storage; no live case data or credentials are stored there.

```sh
npm run check
npm run build:web
npm run build:live --workspace @loanwick/web
npx playwright install chromium
npm run test:e2e --workspace @loanwick/web
```

`check` runs the shared-package typecheck, 95 shared/database-adapter/source-seed tests, the fixture evaluator and database-source freshness check, frontend typechecking, and 32 frontend adapter/workflow/upload/file/portfolio tests. The worker's separate suite contains 13 tests. The current 21-test Chromium suite covers the dashboard at 1131×713, 1440×900, and 390×844; table filtering and subscription updates; role-specific homes; mobile Menu/Escape; dossier keyboard/direct-input/sample/reset/reduced-motion behavior; uploads/messages/disconnection; the borrower/reviewer round trip; stale checks and release persistence; and live connection failure without fixture fallback. All 32 web unit tests (including three aggregation tests), all 21 browser tests, and both fixture/live production builds passed after the revamp. Automated Axe scans passed within the browser suite; this does not establish whole-product accessibility conformance. The revamp did not rerun cloud or real-database integration checks.

Current captures under repository-root `.impeccable/review/` include `dashboard-reference.png`, `dashboard-desktop.png`, `dashboard-mobile.png`, `dossier-cover-desktop.png`, `dossier-cover-mobile.png`, `desk-desktop.png`, `desk-mobile.png`, `verification-evidence-desktop.png`, `mobile.png` (borrower), and `review-stale.png`. Existing shipping rasters are reused with adjacent provenance; no new raster was generated. The dated integration reports below retain their original test counts and limits.

## Repeatable real database browser check

Use an isolated checkout of Person 4's source-backed test branch at `c4d78e8af25d4343b464fbb1e3f3189169a1b986`, which contains Person 2's `09288eb` database interface. In that checkout, install its dependencies with `npm ci` and `npm ci --prefix spacetimedb`. Keep this frontend checkout on `1-frontend`; no combined branch merge is required. Obtain the official portable SpacetimeDB 2.14.0 CLI and standalone server, with both executables in the same directory, then run from this frontend repository:

```sh
export LOANWICK_WEB_DATABASE_SOURCE=/absolute/path/to/isolated-database-checkout
export LOANWICK_SPACETIME_CLI=/absolute/path/to/spacetimedb-cli
npm run test:e2e:database
```

On Windows, use the corresponding `.exe` CLI path and environment-variable syntax. `LOANWICK_SPACETIME_SERVER` can select a separately stored standalone executable.

The launcher builds both checkouts' shared packages, creates temporary signing keys and a new in-memory database on a free loopback port, provisions separate synthetic identities, starts the live frontend, runs one multi-session Playwright workflow, and stops its own server. It does not change an existing database/server. Tokens remain in the ignored backend session file and test-process memory; each browser context receives only its role's token. Browser tracing/video/failure screenshots are disabled during credential entry, and launcher output redacts the generated tokens. Successful source/review/release captures contain no credentials.

Executed successfully on macOS arm64 with Node 26.12.0 and CLI/server/SDK 2.14.0. CI is configured to run this check on Node 24/Linux against the same pinned backend commit; that CI result is not claimed here. This check verifies:

- Officer/reviewer subscriptions render eight real applications. A separate borrower receives its own sent request; another borrower cannot load that case or request. A fresh borrower login prioritizes applications with sent requests. The own-case selector contains only borrower-authorized summaries, updates pending counts, recovers from an unavailable case, and preserves unsent response text in memory while switching applications. A 390px capture, 1280px capture, and a third automated WCAG AA scan cover that selector; no token or response draft is persisted in web storage.
- A UI-created live job receives a terminal `MODEL_UNAVAILABLE` result from the test driver and displays failure. No provider call or success is invented.
- The authenticated worker test driver runs Person 4's actual deterministic checks in **fixture execution mode** and waits for accepted terminal outcomes. Both ownership-conflict documents, stored hashes, versions, excerpts, and exact line locators agree with the published source files and rendered evidence panels. Original-source download remains visibly unavailable.
- A standard request is previewed/sent, answered by a distinct borrower, and escalated by the officer with rationale. The text-only response is not treated as proof that the active ownership conflict vanished.
- On the clean control case, current reviews permit release; a payment instruction update stales payment/document reviews. A direct reducer call also rejects release. A fresh deterministic investigation and reverified checks permit one simulated release; same-key retry, different-key rejection, and reconnect persistence are checked.
- Explicit disconnect clears the displayed case and credential form. Web storage contains no session tokens. This is browser integration evidence, not a comprehensive authorization or concurrency audit.

The test-only driver imports Person 4's bridge in Node from the isolated checkout. Neither its worker identity nor its implementation enters the web bundle. This does not prove Person 3's model loop, document transport, extraction, or corrected-document resolution. The ten-test browser suite used for this historical integration check was independent of the database tooling; the current frontend suite has 21 tests.

## Fixture demo sequence

1. Investigate Cedar Demo Excavation and open the source behind the EX-0042 concern.
2. Request clarification, edit the own-case message, save/preview it, and send exactly that preview.
3. Switch the demo role to Borrower. Respond and select the clearly labeled synthetic corrected schedule. This is not an upload or live extraction.
4. Switch to Officer, rerun the investigation, inspect the response, and resolve the finding with rationale. New evidence does not resolve findings automatically.
5. Switch to Reviewer. Record the three checks with their actual supporting evidence and rationale. Payment verification must cite the selected instruction's token evidence.
6. Change the synthetic payment instruction. Payment and document-consistency checks become stale; collateral remains current. Release becomes unavailable.
7. Switch to Officer and investigate again, then to Reviewer and reverify payment and document consistency. Simulate release once. Reload to inspect the same immutable release record.

The fixture scenario adds clearly synthetic payment-source documents under `apps/web/src/adapters/payment-seed.json`; their exact source bytes and SHA-256 values accompany the metadata. Corrected schedules and payment changes create new source records without rewriting historical excerpts or canonical fixtures. The frontend-local simulator is not a production backend and does not prove server permissions or transactions.

## Shared interface changes for Person 4

- Optional safe borrower document metadata, masked staff payment summaries, related-case summaries, and server-supplied finding currentness.
- A public staff job summary can omit worker-only lease/captured-source fields. Existing optional public fields remain accepted; claim tokens remain rejected.
- `PresentedFinding` and `PresentedCollateral` distinguish persisted presentation data from full analysis inputs. The live adapter never fabricates structured result facts, asset namespaces, or ownership evidence. Worker/check/snapshot schemas remain strict.
- Optional `updateClarificationDraft` and explicit optional review `status` preserve existing adapter consumers. The fixture adapter supports draft updates; the current live backend does not.
- Readiness includes the current investigation/clarification/payment blockers. Unsupported live readiness shapes fail visibly rather than enabling release.

Components import public workspace packages. Database-specific ID encoding, bigint bounds, timestamps, field names, statuses, review precedence, and result correlation stay in the live adapter. All database IDs are reversibly encoded at the public boundary, including IDs with `/` characters.

## Live integration gates

Start the live app with `npm run dev:web:live` at http://127.0.0.1:5174 and use Person 2's database endpoint (the documented local setup uses port 4310), database name, and **one individual token** in the connection form. Tokens remain in memory. Do not import the multi-user sessions file into the browser. The server supplies the role and organization; the live UI has no demo identity selector. Connection failures never activate fixtures.

To enable the browser upload client, configure the public `VITE_UPLOAD_ORIGIN` and `VITE_UPLOAD_WORKER_ID` values in the web app's local environment and restart Vite. The origin must use HTTPS with a browser-trusted certificate. Person 3 must run Person 2's handler with this app's exact origin allowed. The browser generates a 32-byte capability, sends only its SHA-256 digest to `authorizeUpload`, correlates the server grant, and posts the File with scoped `X-Upload-*` headers and no user database token/cookies. The browser supplies Content-Length. Success waits for the grant's attached document ID and own-case metadata. Failed or uncertain responses revoke/reconcile the grant rather than blindly replaying the body. Raw capability secrets are never stored or logged. Authorization revocation and connection loss abort active requests. Unknown attempts retain only non-secret grant ID/digest metadata; the UI blocks new files until explicit reconciliation. Restored server grants also require reconciliation after a reload. This client is unit-tested against the published protocol; it has not been exercised against a running worker service here.

Before calling the live frontend complete:

| Owner | Required remaining evidence or interface |
| --- | --- |
| Person 2 | Revalidate against the final database commit. Local browser coverage now proves separate role sessions, correlated workflow writes, stale-investigation/review gates, direct-call rejection, and one persisted release; the owner's comprehensive authorization/concurrency suite remains separate. |
| Person 2 | Add authorized draft-update support for message and requested document type, with the sent content bound to the reviewed draft. The current backend supports standard templates, so the live UI exposes that limitation and never substitutes edited copy. Regenerate bindings rather than hand-editing them. |
| Person 3 | Run and wire the supplied HTTPS upload handler with storage/extraction and a worker identity. The frontend client implements the current capability protocol; actual worker-service execution remains pending. `LiveAdapter` accepts a typed `DocumentTransport` for source retrieval. No download protocol is supplied on the inspected branch, so opening original live source bytes reports unavailable; no guessed endpoint or fake source is returned. |
| Person 3 | Prove a worker claims a real investigation, persists actual tool events and accepted findings, processes the supported JSON/CSV response, and reports actual provider/model metadata. A standalone live clock smoke does not satisfy this gate. |
| Persons 2–4 | Recheck mapping against the final database commit and shared schemas; retain server-supplied blockers and source currentness. Prove the full flow with distinct authenticated sessions. |

Browser release controls require reviewer role and server `canRelease`. Mutation success waits for an observed matching record after the reducer completes. Uncertain results require reconciliation before retry; release retries retain the same idempotency key. The adapter does not compute live readiness with frontend policy helpers.

## Current verification boundary

The deterministic foundation, frontend unit tests, fixture browser journey, responsive captures, automated accessibility checks, fixture/live production builds, and the real database browser check described above have executed successfully. Person 3's isolated typecheck, 13 tests, and fixture clock-tool smoke also pass at `cd9cf5f`; its smoke explicitly reports `connectedDatabase: false`. No connected NVIDIA investigation, original-source download service, or running production upload/extraction service has been verified. The full A–D milestones remain pending; the local database subset does not stand in for their missing worker/document evidence.

## Current branch compatibility audit

Inspected after refreshing origin on November 8, 2026:

| Source | Compatibility result |
| --- | --- |
| Person 2: `1-loanwick-database`, `4a26fa4` | Latest commit adds independent QA and deployment documentation; its schema, bindings, transport, and package interface are unchanged from `09288ebcad82fbb5c8fb867281794082ed924131`. Web SDK matches 2.14.0. Received all 56 generated files unchanged. The adapter uses actual role projections/reducer arguments, maps `extracted` to `succeeded`, preserves `fixture` extraction provenance and server currentness/blockers, includes own and related source revisions, and supports server-length IDs including payment IDs. Current payment-source selection must match actual token evidence. The HTTPS upload client matches the new grant/digest/scope/claim/receipt interface. Editable drafts and live source downloads remain unsupported by the inspected server surface. |
| Person 4 test bridge: `1-analysis-database-test`, `c4d78e8af25d4343b464fbb1e3f3189169a1b986` | The source-backed database seed uses different IDs and equipment from the offline fixture set; the live UI does not assume EX-0042 or the canonical JSON IDs. This branch contains the authorized worker analysis adapter and a real HTTPS integration test. Its reported 95 shared and 22 live checks are separate from this frontend's executed test counts. It is an unmerged combined test branch, not the frontend's base. |
| Person 3: `1-ai-worker-and-ingestion`, code at `cd9cf5f` | Latest `21b94f0` changes only the root README; worker code is unchanged from the reviewed/tested `cd9cf5f`. It contains NVIDIA/fixture providers and `read_worker_clock` orchestration, with no database imports, job consumer, upload/download server, extraction, or persisted investigation. Node 26.12.0 typecheck and all 13 isolated tests pass; an explicitly fixture clock smoke passes and reports `connectedDatabase: false`. Its live/fixture enum agrees with the shared contract and it refuses live-to-fixture fallback. No frontend-callable API is present to wire. Keep provider keys and calls inside this worker. Its package-local lockfile/tool versions also need coordination with Person 4 when merging the workspace. |

Person 2's [deployment record](https://github.com/minhle211/LoanWick-HackUTD26/blob/4a26fa4/spacetimedb/DEPLOYMENT.md) also documents the synthetic Maincloud database `loanwick-hackutd26-dev` at `https://maincloud.spacetimedb.com`. That deployment has not been exercised by this frontend run. Use individual owner-provisioned sessions through the existing connection form; public endpoint/name values do not grant access. The record explicitly says the worker upload endpoint is not deployed.

Next shared integration: Person 3 should consume Person 4's authorized database adapter; claim real jobs and wait for `worker_job_outcomes`; persist the actual provider `model` as the database's `modelId` (required for a live completion); map bounded provider errors to supported terminal database errors; run the HTTPS handler with the declared capability contract; and supply an authorized download transport. Then rerun the browser flow using that worker and real response documents. The standalone clock smoke must not be displayed as a case investigation or tool event. Do not merge the combined database-test branch wholesale merely to make frontend checks green. Coordinate shared type/root-script changes with Person 4.

### Combined-main compatibility, November 8, 2026

Merged team `main` at `e31a782` into `1-frontend` in `dbe2928`, retaining the simplified contract screen. This brings the published database, analysis bridge, worker workspace, and root lockfile into the same checkout. After clean dependency installation, `npm run check`, the worker typecheck and 13 tests, both web builds, all ten browser tests, and the disposable database browser workflow passed. The database browser workflow used this checkout itself as `LOANWICK_WEB_DATABASE_SOURCE`, rather than an external copy. The total unit count is 137 (95 shared/bridge/seed, 29 web, 13 worker).

Person 3's branch remains at `21b94f0`; its worker still does not accept or extract contracts or consume database investigations. The integrated workspace and passing frontend tests do not establish real PDF/DOCX processing. Keep `VITE_CONTRACT_UPLOAD_ENABLED` disabled until that service is implemented and exercised with authorized sessions.
