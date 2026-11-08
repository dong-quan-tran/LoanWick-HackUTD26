<!-- impeccable:product-schema 1 -->
# Product

## Platform
web

## Stack
TypeScript monorepo using npm workspaces: React/Vite frontend, SpacetimeDB application database, and a Node/TypeScript worker with NVIDIA/Nemotron orchestration. Shared contracts and deterministic analysis belong in separate packages. Coordinate root tooling and the frontend styling approach with Person 4; Person 2 must verify and pin compatible database tooling before integration.

## Current State
Current user direction (November 8, 2026): Applications is the staff home screen (`/` redirects to `/applications`); borrowers retain their authorized own-case home. The shared workspace follows the user-pinned Applications reference: a narrow warm-brown sidebar, ivory canvas, compact white bordered panels, system UI text, serif totals, blue stages, clay concern pills, and green Clear indicators. Staff can scan their authorized portfolio, filter the application table, and open the case workspace. Existing case, borrower, and reviewer deep links remain supported.

`/verify` is an officer route with an explicit visual exception: its existing full-screen espresso dossier cover, copy, artwork, and compact Menu remain intact. Entering, using the skip link, focusing the desk, selecting a file, or starting the sample reveals the shared workspace. The desk remains mounted below the cover to preserve input state. Its selected-loan dropdown sits above a compact white upload panel; upload, messages, results, and evidence remain on the same page. The cover is an introduction, not a separate workflow route.

The new upload screen checks file type/signature, size, and SHA-256 locally. In the sample workspace (or when running a sample verification), verification steps progress through a staged sequence of plain-language updates (reading contract pages, comparing equipment IDs and ownership claims, calculating connected borrower limits, and preparing the summary) before presenting non-technical concern titles, explanations, next steps, and human-readable document records. Real live officer intake uses the application-scoped capability transport only when explicitly enabled for a PDF/DOCX-capable worker.

This checkout now contains the shared contracts and deterministic analysis packages, eight canonical synthetic applications and their source documents, and a runnable React frontend in `apps/web`. The complete fixture officer/borrower/reviewer workflow and dashboard aggregation have passed 32 frontend unit tests and 21 Chromium browser tests. Responsive staff/borrower captures and automated Axe accessibility scans have been checked; this does not establish whole-product WCAG conformance.

The live frontend boundary uses unchanged Person 2 bindings from database commit `09288ebcad82fbb5c8fb867281794082ed924131`. A disposable real database has verified distinct-session browser clarification, current/stale reviews, server release rejection, and release retry/persistence, using Person 4's deterministic analysis bridge. Person 3's published `1-ai-worker-and-ingestion` branch currently implements only a clock-tool smoke with `connectedDatabase: false`. Connected investigation/model execution, source/download/upload transport, and editable live draft persistence remain incomplete. Requirements below must not be presented as fully completed live functionality. See `docs/FRONTEND.md` for executed checks and integration gates.

## Users
- **Primary**: **Bank Loan Officer**: Scans authorized applications, opens a case, investigates source-backed concerns, and requests clarification. The officer can also upload a PDF or DOCX contract, follow concise verification messages, and review returned concerns and evidence.
- **Secondary**:
  - **Borrower**: Reviews clarification requests via a strictly isolated projection; submits explanations and supporting documents (JSON/CSV); tracks document extraction status without exposure to internal bank notes or other borrowers.
  - **Loan Reviewer**: Examines required pre-disbursement checks against active revision vectors; simulates payment-instruction updates (verifying stale-check invalidation); executes simulated fund release protected by idempotency keys.

## Product Purpose
LoanWick is a synthetic commercial-loan investigation and contract-verification prototype. Staff begin with their authorized application portfolio, then investigate a case or enter contract verification. The verification workflow remains contract upload → current-stage messages → results and supporting evidence on one page. Operational summaries are shown, never private model reasoning.

A completed check is not approval of a loan, a legal-compliance certification, or proof of fraud. Actual upload, extraction, model use, and verification completion must be confirmed by the corresponding service/database events.

## Positioning
Deterministic checks establish traceable concerns from stored evidence; model orchestration assists with tool use, supported explanations, and clarification drafts. Side-by-side source excerpts, preserved document versions, audit history, and revision-aware release controls support human investigation. A finding is a concern to investigate, not a fraud verdict or automatic lending decision.

## Operating Context
Staff begin on Applications with four portfolio summaries, a stage distribution, and a searchable table. Summaries use the complete authorized `PortfolioItem[]`; search, stage, and concern filters affect only table rows. Totals preserve currency, investigation counts use the latest succeeded status, and open concerns sum open findings while separately counting flagged cases. Release-ready and released totals count application stages; release-ready is not server authorization. The canonical fixture shows eight applications, USD 1,980,000 (compact display $2M with an exact accessible value), four open concerns across four cases, eight Reviewing, and zero ready/released applications. Subscription changes update these values; loading, empty, and error states remain explicit.

The shared shell serves officer, borrower, and reviewer screens. Borrowers receive only their authorized own-case navigation and projections. On narrow screens its navigation expands from a Menu control; application-table scrolling stays inside a focusable region and filters stack.

On `/verify`, the preserved cover introduces the selected loan and five orientation milestones. The mounted desk below it opens through the entry action, skip link, direct keyboard focus, file selection, or sample action. Running, completed, failed, and disconnected states bypass the cover. Entry state resets with session changes. Once entered, the selected-loan dropdown, upload, factual messages, and expandable evidence share the standard shell and one reading column. The desk has no parchment double frame, overlapping gold loan pill, or floating banknotes; the small folio remains in upload and engraved banknotes remain on the cover only. Four desk stages follow existing sample events; live stage emphasis is limited to confirmed extraction and completion.

## Workflow Priorities

The November 8 approved Applications reference supersedes the earlier verification-first hierarchy:

1. Scan the complete authorized application portfolio and stage distribution, then filter the table or open a case.
2. Investigate source evidence, request clarification, and use the existing role-appropriate review workflow.
3. From Verify contract, choose one PDF or DOCX contract and follow safe, factual service-supported messages on the same page as results.
4. Keep uncertainty, current source revisions, human review, and server release safeguards visible across all surfaces.

Do not invent successful uploads or verification stages while the worker is unavailable. The explicitly labeled sample uses the existing synthetic case; it never analyzes the officer's selected file.

## Capabilities and Constraints
- **Shared Staff Workspace**: Applications is the staff home, with compact portfolio summaries, a stage strip, and a filterable table. Warm-brown navigation and an ivory canvas frame white bordered panels across case, borrower, reviewer, and entered verification screens. System UI text carries controls and headings; bundled Source Serif 4 carries dashboard totals and the preserved dossier statement. Blue stages, clay concern pills, green Clear indicators, and bronze amount bars support literal text labels. The expressive espresso/gold dossier cover is a scoped exception. Its generated engraved-paper decoration stays on the cover; the small leather folio remains in the upload panel.
- **Strict Evidence Grounding**: Every finding must point to concrete document excerpts, versions, and locators (no hallucinated page numbers or invented confidence scores).
- **Deterministic Concerns**: Equipment conflicts require active conflicting exclusive ownership claims with source evidence. Similar names or shared addresses only suggest candidates; group exposure uses human-confirmed relationships and a named, versioned synthetic policy. Missing evidence remains unknown.
- **Human-in-the-Loop Investigation**: Flags indicate potential concerns (clerical errors, outdated schedules, or potential conflicts) requiring human inquiry, not automated fraud verdicts. All finding resolutions and checklist sign-offs require written rationale.
- **Revision Vector Gating**: Relevant input changes advance the overall application revision and the collateral/payment revision where applicable. Collateral review binds to the collateral revision, payment verification to the payment revision, and document consistency review conservatively to the overall application revision. Dependent related-case changes must also prevent stale results from appearing current. Readiness requires current passed checks, an eligible stage, no blocking high-severity findings, and no prior release.
- **Role-Based Data Isolation**: The borrower interface receives only the server's borrower projection for the authenticated borrower; internal notes, other-borrower evidence, and officer controls are never loaded or merely hidden with CSS.
- **Simulated Release Safeguards**: The server atomically rechecks policy and records one immutable release per application. The browser reuses an idempotency key on uncertain retries, prevents pending double submissions, handles server rejection, and displays the release ID plus `SIMULATED RELEASE - NO MONEY MOVED`. Release-relevant edits are rejected after simulated release.
- **Dual Adapter Architecture**: Starts with a development fixture adapter implementing the exact same domain interface as the real SpacetimeDB subscription adapter; connection failures display explicit errors and never silently fallback to fixtures.
- **Resilient State Coverage**: Comprehensive handling of pending, disconnected, empty, forbidden, failed, and retry states across all views.
- **Document Intake**: The officer upload accepts PDF and DOCX contracts up to 10 MB. Browser header/package checks are preliminary file checks, not text extraction or document authenticity verification. Private storage, PDF/DOCX extraction, encryption/scanned-document errors, source locators, and pipeline execution belong to the worker. Borrower JSON/CSV intake remains a secondary existing capability. Unavailable services must remain explicit.
- **Synthetic Data Prototype**: Operates strictly on synthetic commercial loan applications and documents; no real money, real PII, or live banking integrations.

## Integration Boundaries
- **Frontend — Person 1, `apps/web/`**: Use shared contracts through one adapter; receive generated bindings from Person 2. Display server-confirmed mutations, revisions, readiness, and stable errors. A visual role selector cannot grant authority. Clear sensitive cached data on logout and unsubscribe on session/route changes.
- **Database — Person 2, `spacetimedb/`**: Own identity, organization-scoped permissions, safe projections, job claims/leases, validated persistence, audit history, review invalidation, and atomic release. Borrower isolation and business policy must hold for direct calls as well as the UI.
- **Worker — Person 3, `apps/worker/`**: Own private document bytes, extraction, bounded model/tool orchestration, and validated findings/drafts. Document text is untrusted evidence. The worker cannot send requests, resolve findings, approve reviews, or release; secrets and private storage paths never reach the browser.
- **Shared contracts and integration — Person 4, `packages/contracts/`, `packages/analysis/`, and fixtures**: Own runtime schemas, public string IDs, integer cents with explicit currency, UTC boundary timestamps, stable fixture IDs, deterministic checks, expected results, and root tooling. Do not aggregate different currencies or substitute zero for missing values.
- **Shared execution truth**: Frontend data-adapter mode and worker live/fixture execution must remain explicit. Show actual stored job/tool events rather than invented activity. Neither a connection nor a live provider failure may silently become fixture success. Do not introduce a second application database or duplicate CRUD backend.

## Brand Commitments
- **Name**: LoanWick
- **Palette and imagery**: The user-pinned Applications reference governs the shared workspace: warm brown, ivory, white, bronze, dusty blue, clay concerns, and green Clear indicators. Preserve the espresso/gold dossier cover as an explicit exception. Goldman Sachs is a design reference, not the product brand. Reuse the project-owned leather folio and fictional engraved-paper artwork with their provenance. Decorative financial paper has no denomination or real-currency claim and never serves as evidence or an approval symbol.
- **Voice & Tone**: Conservative, objective, and analytical. Terminology must remain non-accusatory (e.g., use "conflicting ownership claim" or "potential concern" rather than "fraudster" or "fraud confirmed").
- **Visual Status Banners**: The shared shell shows connection state, live/fixture data mode, role/session controls, and `Synthetic data · No money moves`. Fixture role switching is explicitly labeled a demo, not authentication. The preserved dossier has its own session/Menu header until entry.

## Evidence on Hand
- Shared scope, proposed architecture, operations, and revision agreement: `docs/team-plans/00-START-HERE.md`.
- Frontend workflow and acceptance requirements: `docs/team-plans/01-FRONTEND.md`.
- Authorization and transactional release requirements: `docs/team-plans/02-DATABASE-AND-AUTH.md`.
- Model/tool, extraction, and upload requirements: `docs/team-plans/03-AI-WORKER-AND-INGESTION.md`.
- Shared schema, deterministic analysis, fixture, and integration requirements: `docs/team-plans/04-ANALYSIS-AND-INTEGRATION.md`.
- Eight canonical application fixtures, source documents, stable IDs, and independent expected deterministic results are present under `fixtures/`. They cover ownership conflicts, shared addresses, similar names, confirmed-group exposure, stale payment checks, missing evidence, a clean control, and hostile source text. The frontend simulator adds clearly labeled payment and corrected-document scenarios without rewriting the canonical sources.
- Person 4's validated staff/borrower sample views and shared schemas are present. The shared checks pass 84 tests and source/evaluation validation. Frontend checks cover the synthetic round trip and revision/release behavior; they do not prove live authorization or model integration. No real-world accuracy, performance, or production lending validation is established.

## Open Decisions
- Exact compatible SpacetimeDB CLI/server/module/SDK versions, generated bindings, and supported authorized subscription behavior require Person 2's toolchain proof.
- Shared runtime schemas, fixture IDs, and safe money bounds are implemented. The database/shared-contract mapping and real cross-case currentness still require integrated verification.
- The implemented shared group-review policy uses a strictly-greater-than USD 1,000,000 synthetic threshold. It is not a legal threshold.
- Actual supported model/endpoint, authenticated upload contract, and frontend/root tooling conventions remain to be verified or agreed by their owners.

## Product Principles
1. **Evidence Over Accusation**: Ground findings in exact document excerpts and normalized identifiers; treat discrepancies as items for human investigation.
2. **Complete Auditability**: Preserve document versions and audit state transitions, clarification exchanges, reviewer decisions, and actual tool activity. Bind jobs, findings, and reviews to the relevant source revisions.
3. **Revision-Locked Safety**: Release readiness is dynamic; any mutation to loan inputs automatically invalidates dependent reviews and requires re-verification before release.
4. **Task Clarity**: Give staff an Applications home for portfolio scanning and a consistent shell for each case task. Keep verification upload, messages, results, and evidence on one page; retain borrower isolation and role-appropriate review/release controls.
5. **Fail-Visible Resilience**: Connection losses, model errors, or extraction failures must remain visibly surfaced with retry actions; never hide errors behind infinite spinners or fake successes.

## Accessibility & Inclusion
- Target WCAG AA with keyboard-operable controls, readable contrast, and text labels alongside status colors. This is an accessibility requirement, not an audited conformance claim.
- Announce meaningful asynchronous worker, extraction, and subscription updates through accessible status feedback such as `aria-live`; avoid overwhelming users with every tool event.
