# Person 1 frontend handoff

## Implemented on this branch

`apps/web` is a React/Vite/TypeScript application with an evidence-first staff workspace, application portfolio, borrower view, clarification preview/send, human decisions, review checks, payment changes, tool activity, audit history, and simulated release.

The complete **fixture** workflow is runnable. Its single-window identity switch is explicitly synthetic and does not authenticate a real person. All canonical records remain synthetic. The fixture adapter runs the shared deterministic analysis helpers; no live model calls or tool traces are invented.

The **live** adapter compiles against unchanged Person 2 bindings from database commit `09288ebcad82fbb5c8fb867281794082ed924131` (SpacetimeDB 2.14.0). It subscribes to `my_user`, then only the permitted staff or borrower projections. Live workflow acceptance is not established by compilation or fixture tests.

## Run and verify

Use the repository's Node 24 CI baseline and npm. From the root:

```sh
npm ci
npm run dev:web
```

Open http://127.0.0.1:5173. The fixture app opens Cedar Demo Excavation. Demo controls provide reset, disconnection, and investigation-failure scenarios. Synthetic scenario state and the synthetic identity persist in session storage; no live case data or credentials are stored there.

```sh
npm run check
npm run build:web
npm run build:live --workspace @loanwick/web
npx playwright install chromium
npm run test:e2e --workspace @loanwick/web
```

`check` retains the shared-package typecheck, 84 existing tests, and fixture evaluator, and adds frontend typechecking and 22 frontend adapter/workflow/upload tests. The seven-test browser suite exercises the complete synthetic round trip and release, opening the corrected response source before the human decision, responsive borrower forms, forbidden routes, connection recovery, empty filters, keyboard tabs, live connection failure without fixture fallback, and two automated WCAG AA scans. Screenshots are generated under the repository's `.impeccable/review/` directory. These scans do not establish whole-product accessibility conformance.

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
| Person 2 | A provisioned running database and separate officer/borrower/reviewer identities; verify safe reads, correlated mutations, current-investigation gates, direct-call release rejection, and exactly one release. |
| Person 2 | Add authorized draft-update support for message and requested document type, with the sent content bound to the reviewed draft. The current backend supports standard templates, so the live UI exposes that limitation and never substitutes edited copy. Regenerate bindings rather than hand-editing them. |
| Person 3 | Run and wire the supplied HTTPS upload handler with storage/extraction and a worker identity. The frontend client implements the current capability protocol; actual worker-service execution remains pending. `LiveAdapter` accepts a typed `DocumentTransport` for source retrieval. No download protocol is supplied on the inspected branch, so opening original live source bytes reports unavailable; no guessed endpoint or fake source is returned. |
| Person 3 | Prove a worker claims a real investigation, persists actual tool events and accepted findings, processes the supported JSON/CSV response, and reports actual provider/model metadata. A standalone live clock smoke does not satisfy this gate. |
| Persons 2–4 | Recheck mapping against the final database commit and shared schemas; retain server-supplied blockers and source currentness. Prove the full flow with distinct authenticated sessions. |

Browser release controls require reviewer role and server `canRelease`. Mutation success waits for an observed matching record after the reducer completes. Uncertain results require reconciliation before retry; release retries retain the same idempotency key. The adapter does not compute live readiness with frontend policy helpers.

## Current verification boundary

The deterministic foundation, frontend unit tests, fixture browser journey, responsive captures, automated accessibility checks, and fixture/live production builds have executed successfully during implementation. No running database endpoint, live authenticated browser integration, connected investigation worker, or source/upload service has been verified from this checkout. Milestones A–D in the team plan remain pending until their real integration evidence exists.

## Current branch compatibility audit

Inspected after refreshing origin on November 8, 2026:

| Source | Compatibility result |
| --- | --- |
| Person 2: `1-loanwick-database`, `09288ebcad82fbb5c8fb867281794082ed924131` | Web SDK matches 2.14.0. Received all 56 generated files unchanged. The adapter uses actual role projections/reducer arguments, maps `extracted` to `succeeded`, preserves `fixture` extraction provenance and server currentness/blockers, includes own and related source revisions, and supports server-length IDs including payment IDs. Current payment-source selection must match actual token evidence. The HTTPS upload client matches the new grant/digest/scope/claim/receipt interface. Editable drafts and live source downloads remain unsupported by the inspected server surface. |
| Person 4 test bridge: `1-analysis-database-test`, `c4d78e8af25d4343b464fbb1e3f3189169a1b986` | The source-backed database seed uses different IDs and equipment from the offline fixture set; the live UI does not assume EX-0042 or the canonical JSON IDs. This branch contains the authorized worker analysis adapter and a real HTTPS integration test. Its reported 95 shared and 22 live checks are separate from this frontend's executed test counts. It is an unmerged combined test branch, not the frontend's base. |
| Person 3 worker | No `apps/worker` files exist on any published origin ref fetched for this audit. Signal reports NVIDIA/Nemotron clock smoke only, with `connectedDatabase: false`. Its implementation and compatibility cannot be source-verified until a worker commit is published. A smoke result does not prove job consumption, terminal-outcome handling, upload serving, or extraction. |

Next shared integration: publish the worker branch; consume Person 4's authorized database adapter; claim real jobs and wait for `worker_job_outcomes`; run the HTTPS handler with the declared capability contract; supply an authorized download transport; then execute the real multi-session browser flow. Do not merge the combined database-test branch wholesale merely to make frontend checks green. Coordinate shared type/root-script changes with Person 4.
