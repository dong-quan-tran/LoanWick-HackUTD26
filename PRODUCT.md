<!-- impeccable:product-schema 1 -->
# Product

## Platform
web

## Stack
Planned TypeScript monorepo using npm workspaces: React/Vite frontend, SpacetimeDB application database, and a Node/TypeScript worker with NVIDIA/Nemotron orchestration. Shared contracts and deterministic analysis belong in separate packages. Coordinate root tooling and the frontend styling approach with Person 4; Person 2 must verify and pin compatible database tooling before integration.

## Current State
Current user direction (November 8, 2026): the primary frontend is a bank loan-contract verification tool. A loan officer selects a PDF or DOCX contract, starts verification, and follows a simple series of operational pipeline messages. Results and source evidence use progressive disclosure. The officer interface is one page with two visual stages: an initial espresso dossier cover opens onto a warm-ivory operating desk with a compact menu, contract upload, and verification messages/results in the same view. The cover is an introduction, not an extra workflow route. Earlier portfolio, borrower, and reviewer routes remain available only for compatibility with existing role workflows; they are not primary navigation.

The new upload screen checks file type/signature, size, and SHA-256 locally. In the sample workspace (or when running a sample verification), verification steps progress through a staged sequence of plain-language updates (reading contract pages, comparing equipment IDs and ownership claims, calculating connected borrower limits, and preparing the summary) before presenting non-technical concern titles, explanations, next steps, and human-readable document records. Real live officer intake uses the application-scoped capability transport only when explicitly enabled for a PDF/DOCX-capable worker.

This checkout now contains the shared contracts and deterministic analysis packages, eight canonical synthetic applications and their source documents, and a runnable React frontend in `apps/web`. The complete fixture officer/borrower/reviewer workflow has passed frontend unit and browser tests. Responsive staff/borrower captures and two automated accessibility scans have been checked; this does not establish whole-product WCAG conformance.

The live frontend boundary uses unchanged Person 2 bindings from database commit `09288ebcad82fbb5c8fb867281794082ed924131`. A disposable real database has verified distinct-session browser clarification, current/stale reviews, server release rejection, and release retry/persistence, using Person 4's deterministic analysis bridge. Person 3's published `1-ai-worker-and-ingestion` branch currently implements only a clock-tool smoke with `connectedDatabase: false`. Connected investigation/model execution, source/download/upload transport, and editable live draft persistence remain incomplete. Requirements below must not be presented as fully completed live functionality. See `docs/FRONTEND.md` for executed checks and integration gates.

## Users
- **Primary**: **Bank Loan Officer**: Uploads a loan contract in PDF or DOCX format, follows current verification stages as concise messages, and reviews the returned concerns and their source evidence.
- **Secondary**:
  - **Borrower**: Reviews clarification requests via a strictly isolated projection; submits explanations and supporting documents (JSON/CSV); tracks document extraction status without exposure to internal bank notes or other borrowers.
  - **Loan Reviewer**: Examines required pre-disbursement checks against active revision vectors; simulates payment-instruction updates (verifying stale-check invalidation); executes simulated fund release protected by idempotency keys.

## Product Purpose
LoanWick is a bank loan-contract verification prototype. Its primary workflow is contract upload → current-stage messages → verification results. It helps the officer follow what the pipeline is doing and open supporting evidence when attention is required. Operational summaries are shown, never private model reasoning.

A completed check is not approval of a loan, a legal-compliance certification, or proof of fraud. Actual upload, extraction, model use, and verification completion must be confirmed by the corresponding service/database events.

## Positioning
Deterministic checks establish traceable concerns from stored evidence; model orchestration assists with tool use, supported explanations, and clarification drafts. Side-by-side source excerpts, preserved document versions, audit history, and revision-aware release controls support human investigation. A finding is a concern to investigate, not a fraud verdict or automatic lending decision.

## Operating Context
The officer first sees a dossier cover with the selected loan, one “Enter Verification Desk” action, and five orientation milestones. Entry reveals a single-column verification desk; choosing a file, starting a sample, or focusing the desk directly also reveals it. Running, completed, failed, and disconnected states bypass the cover. Entry state is local to the current session and resets with session changes. One contract upload remains the primary operating action. A compact Menu contains the existing-loan selector and session actions. The selected loan remains visible in a pill crossing the parchment upload frame, while upload, messages, and expandable evidence stay on the same page. Four stages above the footer reflect the existing synthetic sample events; live stage emphasis is limited to confirmed extraction and completion, without invented intermediate work. There are no tabs or case-history links in the officer's main flow. Borrower clarification and reviewer release tools retain their existing authorized routes but do not clutter the primary verification screen.

## Workflow Priorities
The current user direction supersedes the earlier dashboard-first hierarchy in `docs/team-plans/01-FRONTEND.md`:

1. Choose or drop one PDF or DOCX loan contract, with clear file requirements and meaningful failure feedback.
2. Start verification and display safe, factual messages for upload, extraction, queued/running checks, actual tool output, failure, and completion as supported by real events.
3. Show a concise outcome and expandable concerns/source excerpts. Keep uncertainty and human review explicit.
4. Retain deeper case investigation, clarification, and revision/release controls as secondary surfaces compatible with the rest of the project.

Do not invent successful uploads or verification stages while the worker is unavailable. The explicitly labeled sample uses the existing synthetic case; it never analyzes the officer's selected file.

## Capabilities and Constraints
- **Simple Primary Surface**: The initial dossier cover uses a two-line serif statement, one entry action, fine gold framing, and workflow orientation. The centered desk has one parchment upload area, which becomes a compact file summary and readable pipeline message stream. The user-pinned palette is espresso, mahogany, antique gold, bronze, warm ivory, parchment, and restrained dusty blue. A generated leather folio with a security-paper fan supports intake; fictional engraved-banknote cutouts move slowly in the margins and remain decorative. Larger plain-language messages serve non-technical loan officers. Dense comparisons belong in secondary case details.
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
- **Palette and imagery**: Brown/gold rather than green, with restrained institutional blue accents. Goldman Sachs is a design reference, not the product brand. Use the project's own generated leather-folio and fictional engraved-paper artwork; keep the officer workflow to one page with a compact menu. Decorative financial paper has no denomination or real-currency claim and never serves as evidence or an approval symbol.
- **Voice & Tone**: Conservative, objective, and analytical. Terminology must remain non-accusatory (e.g., use "conflicting ownership claim" or "potential concern" rather than "fraudster" or "fraud confirmed").
- **Visual Status Banners**: Persistent shell header displays connection state, authenticated role, live/fixture execution mode, and a clear `SYNTHETIC DATA - NOT REAL MONEY` indicator.

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
4. **Task Clarity**: Give the officer one primary action and a linear message stream. Reveal results and evidence on demand; keep the primary screen free of portfolio tables, role switches, and review/release controls.
5. **Fail-Visible Resilience**: Connection losses, model errors, or extraction failures must remain visibly surfaced with retry actions; never hide errors behind infinite spinners or fake successes.

## Accessibility & Inclusion
- Target WCAG AA with keyboard-operable controls, readable contrast, and text labels alongside status colors. This is an accessibility requirement, not an audited conformance claim.
- Announce meaningful asynchronous worker, extraction, and subscription updates through accessible status feedback such as `aria-live`; avoid overwhelming users with every tool event.
