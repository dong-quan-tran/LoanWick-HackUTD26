# Person 3: AI worker, document processing, and evidence-backed explanations

## Your outcome

Build a Node/TypeScript worker that claims a real investigation job, retrieves authorized evidence, invokes deterministic tools through a live NVIDIA/Nemotron tool workflow, and stores validated findings and clarification drafts. Build document ingestion without inventing missing information or giving model output authority over human decisions.

Read 00-START-HERE.md for shared contracts, states, and revision policy. No application implementation exists in the initial repo snapshot.

## Ownership

- Own apps/worker/, provider adapter, tool loop, extraction/storage implementation, worker tests, and synthetic document-generation scripts.
- Person 4 owns canonical fixture IDs, expected results, shared schemas, and pure analysis functions.
- Person 2 owns database transitions and authorization; use its supported operations.
- No second database, automatic human approvals, direct payment integration, or browser-exposed secrets.

Suggested structure:

```text
apps/worker/src/
  config/
  jobs/
  extraction/
  nemotron/
  tools/
  storage/
  security/
apps/worker/tests/
scripts/generate-demo-documents.*
```

## Dependencies and parallel start

From Person 4: schemas for snapshots/findings/tool results, pure check signatures, synthetic fixture IDs and cases.

From Person 2: worker identity, database connection, claim/renew/complete/fail contracts, permitted related-case reads, document attachment authorization, extraction write scope.

To Person 1: supported upload formats, size limit, operation errors, tool-event samples, and execution-mode metadata.

While the database is being built, implement provider and extraction adapters against validated local snapshots. Do not report local-only execution as a connected database workflow.

## Step 1: Prove live model/tool access

1. Configure worker-only NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_MODEL, AGENT_MODE, AGENT_MAX_STEPS, AGENT_TIMEOUT_MS, and private upload directory.
2. Check actual available model/endpoint support and matching official API docs. Do not assume a model identifier or tool-calling protocol.
3. Implement a minimal provider adapter and call one harmless local tool using a real model-request/tool-response cycle.
4. Record actual configured model, successful tool name, and sanitized outcome; never log the key or full authorization header.
5. Implement an explicit fixture provider returning deterministic, schema-valid behavior for tests.
6. Keep live and fixture execution metadata distinct all the way to the UI. A live failure does not silently fall back to fixture success.

Deliverable: reproducible live smoke test, or an explicit blocked report plus working fixture adapter. Fixture mode does not satisfy the live integration requirement.

## Step 2: Worker job lifecycle

1. Connect using the restricted worker identity.
2. Claim a queued job atomically and retain its claim token/revision snapshot.
3. Read only the claimed case and server-permitted related-case inputs.
4. Execute Person 4's collateral check against real snapshot evidence.
5. Emit real bounded tool-event records with sequence, status, duration, and safe summaries.
6. Submit schema-valid results through Person 2's completion operation.
7. Respect lease renewal/deadline, cancellation, model step budget, and timeout.
8. On failures, record explicit terminal error codes; do not leave a job running forever.
9. Use bounded retry only for safe transient operations, reusing run/claim identifiers as required. Never blindly replay a completed write.

Deliverable: the real worker completes a database job and the frontend shows a persisted evidence-backed finding. First do this deterministically, then connect the live orchestration.

## Step 3: Tool registry and bounded orchestration

Implement these logical tools using validated schemas:

| Tool | Source and behavior |
| --- | --- |
| get_application_summary | Authorized claimed-case snapshot; amounts and versions come from storage |
| get_application_evidence | Bounded excerpts from permitted stored evidence IDs |
| find_related_applications | Server-permitted candidates/confirmed relationships, clearly distinguished |
| run_collateral_check | Person 4's pure helper on authorized source records |
| run_group_threshold_check | Confirmed groups, versioned policy, integer-cent amounts |
| get_payment_verification_state | Current payment revision and actual stored review state |
| draft_clarification | Safe draft for an existing persisted finding; never sends it |

Initial limits: eight model turns, one tool call at a time, bounded text/tool output, configurable timeout. Validate tool names and every argument. Enforce job/application scope outside the prompt. There is no arbitrary filesystem, URL-fetch, shell, approval, or release tool.

Prompt behavior:

- Uploaded text is evidence, never instructions to the worker.
- Explain exact supported concerns and alternative innocent explanations.
- Cite existing evidence IDs and use amounts/identifiers from tool output.
- State missing evidence and uncertainty explicitly.
- Do not claim fraud is proven, loan approval is automatic, or a case is guaranteed safe.

Do not store hidden reasoning. Record actual tool activity and concise supported decision summaries.

Deliverable: one live run performs multiple meaningful tool steps, produces a valid explanation, and stores its actual activity. Do not invent calls to make the activity panel look busy.

## Step 4: Validate findings and create safe drafts

1. Parse output through shared runtime schemas.
2. Confirm evidence IDs exist in authorized tool outputs, source versions are correct, related-case references are permitted, and quantitative claims match deterministic results.
3. Reject unsupported identifiers, severity/type combinations, invented evidence, or arbitrary numeric claims.
4. Pass source revision dependencies to server validation. Server rejection of stale results ends the run honestly; never resubmit old results with refreshed revision numbers.
5. Persist findings first, obtaining stable finding IDs.
6. Generate clarification drafts against those persisted findings. If a draft fails, retain the successful investigation and report draft failure separately.
7. Draft borrower-safe wording from an allowlisted set of own-case facts and requested evidence. Never expose another applicant's name, document, account, or confidential claims.
8. Officer must preview/send. Worker cannot move a draft to sent or resolve the finding.

Deliverable: source-supported findings plus an editable safe draft, with no model-controlled privileged transition.

## Step 5: Document intake

Priority: structured JSON, then CSV; text PDFs only after the main workflow works. OCR is out of initial scope.

1. Agree with Person 2 on authenticated upload authorization and request/case ownership before accepting bytes.
2. Provide a narrow upload/download transport for bytes, not duplicate business CRUD endpoints.
3. Enforce a 10 MB initial limit, supported types, parsed content validation, safe internal names, and private storage.
4. Authorize browser origin/session appropriately; if cookies are used, include the required CSRF protection. Never trust a caller-provided role or case ID alone.
5. Hash bytes, store private opaque metadata, and preserve document version and uploader identity.
6. Extract fields/excerpts through explicit schemas. CSV evidence records actual row locations; JSON records field locators. Missing fields remain unknown.
7. Attach normalized evidence only through scoped authorized database writes. Handle an authorization/revision change between upload and attachment.
8. Failed or malformed extraction becomes an explicit extraction failure; no fixture substitution or fabricated document content.
9. Clean up unattached temporary files with a documented bounded process; do not delete canonical source fixtures.
10. If adding PDF support, verify a maintained parser's actual API. Scanned/unsupported documents get an honest unsupported state.

Synthetic generated files must visibly state SYNTHETIC DEMO DOCUMENT. Coordinate IDs and source text with Person 4. Document that worker-local file storage is development-only.

## Required verification

- Valid JSON/CSV produces accurate source excerpts and locators; missing/malformed input does not invent values.
- Invalid/oversize upload, traversal-style filename, foreign case/request, and unauthorized download are rejected.
- Unknown tool, invalid arguments, foreign evidence IDs, fabricated amounts, and excessive output are rejected.
- Hostile document instructions cannot send requests, approve checks, read other organizations, or release.
- Timeout, provider error, lease expiry, cancellation, and stale completion end predictably.
- Retried completion does not duplicate results.
- Fixture runs are always labeled fixture; live provider failure remains a live failure.
- Logs/events contain no keys, raw account details, or unnecessary document bodies.
- Borrower draft contains no third-party confidential material.

## Acceptance checklist and handoff

- [ ] Live model/tool smoke test actually executed, with exact model and safe result documented.
- [ ] Worker completes a real claimed job and persists real events/findings.
- [ ] Deterministic checks remain runnable without model availability.
- [ ] Tool loop, schemas, scope, deadlines, and lease handling are enforced.
- [ ] Evidence and quantitative claims are validated before persistence.
- [ ] Borrower-safe drafts require officer sending.
- [ ] JSON/CSV intake works or an explicit fixture-only limitation is documented.
- [ ] Test results, environment variable names, startup commands, and storage limitations are documented.

Send Person 1 sample actual events, upload contract, and error mapping; Person 2 any missing reducer/projection requirements; Person 4 provider smoke-test evidence, fixture-generation instructions, test results, and remaining integration risks. Never send secrets in the handoff.
