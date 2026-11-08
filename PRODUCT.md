<!-- impeccable:product-schema 1 -->
# Product

## Platform
web

## Stack
Planned TypeScript monorepo using npm workspaces: React/Vite frontend, SpacetimeDB application database, and a Node/TypeScript worker with NVIDIA/Nemotron orchestration. Shared contracts and deterministic analysis belong in separate packages. Coordinate root tooling and the frontend styling approach with Person 4; Person 2 must verify and pin compatible database tooling before integration.

## Current State
This checkout now contains the shared contracts and deterministic analysis packages, eight canonical synthetic applications and their source documents, and a runnable React frontend in `apps/web`. The complete fixture officer/borrower/reviewer workflow has passed frontend unit and browser tests. Responsive staff/borrower captures and two automated accessibility scans have been checked; this does not establish whole-product WCAG conformance.

The live frontend boundary compiles against unchanged Person 2 bindings from database commit `09288ebcad82fbb5c8fb867281794082ed924131`. Actual live database authorization, distinct-session persistence, connected investigation worker/model execution, source/download/upload transport, editable live draft persistence, and server release/concurrency acceptance remain unverified or incomplete. Requirements below must not be presented as completed live functionality. See `docs/FRONTEND.md` for executed checks and integration gates.

## Users
- **Primary**: **Commercial Loan Officer**: Investigates commercial loan applications for collateral conflicts (e.g., equipment double-pledging) and entity risk; reviews side-by-side evidence; drafts and previews borrower-safe clarification requests; monitors worker extraction; records human resolutions with mandatory rationale.
- **Secondary**:
  - **Borrower**: Reviews clarification requests via a strictly isolated projection; submits explanations and supporting documents (JSON/CSV); tracks document extraction status without exposure to internal bank notes or other borrowers.
  - **Loan Reviewer**: Examines required pre-disbursement checks against active revision vectors; simulates payment-instruction updates (verifying stale-check invalidation); executes simulated fund release protected by idempotency keys.

## Product Purpose
LoanWick is a planned commercial-loan investigation prototype that helps lending teams investigate conflicting equipment ownership claims, review confirmed-group exposure, exchange borrower clarifications, and verify release readiness against current evidence.

Success is one complete workflow across distinct identities: an officer investigates a case and opens its source evidence; a borrower answers a clarification; the officer records a reasoned decision; a reviewer sees a payment change invalidate required checks, reverifies them, and performs exactly one simulated release. A live model/tool demonstration must be verified separately from deterministic or fixture execution.

## Positioning
Deterministic checks establish traceable concerns from stored evidence; model orchestration assists with tool use, supported explanations, and clarification drafts. Side-by-side source excerpts, preserved document versions, audit history, and revision-aware release controls support human investigation. A finding is a concern to investigate, not a fraud verdict or automatic lending decision.

## Operating Context
Desktop-oriented staff investigation work, demonstrated with synthetic applications and separate officer, borrower, and reviewer sessions. Officers compare collateral schedules and source excerpts, preview borrower-safe requests, and follow asynchronous extraction and investigation activity. The borrower has a separate, narrowly scoped case view. The app must support an explicitly selected development fixture adapter and live authorized SpacetimeDB subscriptions through the same frontend domain interface.

## Workflow Priorities
Follow `docs/team-plans/01-FRONTEND.md` for the frontend workflow within the shared project contract:

1. Establish session identity, connection feedback, execution labels, case navigation, and visible failure states.
2. Provide a portfolio with stage/status filters and a case workspace prioritizing findings, precise source evidence, application/collateral context, related-case reasons, actual tool activity, clarification history, required checks, and audit history.
3. Complete the officer preview/send -> borrower response -> officer review/resolution round trip. Receipt or extraction of a new document never automatically resolves a finding.
4. Show server-computed release readiness and blocking reasons; demonstrate stale checks after a payment change and one simulated release after re-verification.

Integrate the first real subscription/job/worker/evidence flow before expanding optional features. Cut OCR, relationship graphs, extra models, and optional checks before sacrificing the complete workflow or server-enforced permissions.

## Capabilities and Constraints
- **Desktop Workstation Density**: High information density optimized for desktop screens with multi-pane side-by-side document and excerpt comparisons.
- **Strict Evidence Grounding**: Every finding must point to concrete document excerpts, versions, and locators (no hallucinated page numbers or invented confidence scores).
- **Deterministic Concerns**: Equipment conflicts require active conflicting exclusive ownership claims with source evidence. Similar names or shared addresses only suggest candidates; group exposure uses human-confirmed relationships and a named, versioned synthetic policy. Missing evidence remains unknown.
- **Human-in-the-Loop Investigation**: Flags indicate potential concerns (clerical errors, outdated schedules, or potential conflicts) requiring human inquiry, not automated fraud verdicts. All finding resolutions and checklist sign-offs require written rationale.
- **Revision Vector Gating**: Relevant input changes advance the overall application revision and the collateral/payment revision where applicable. Collateral review binds to the collateral revision, payment verification to the payment revision, and document consistency review conservatively to the overall application revision. Dependent related-case changes must also prevent stale results from appearing current. Readiness requires current passed checks, an eligible stage, no blocking high-severity findings, and no prior release.
- **Role-Based Data Isolation**: The borrower interface receives only the server's borrower projection for the authenticated borrower; internal notes, other-borrower evidence, and officer controls are never loaded or merely hidden with CSS.
- **Simulated Release Safeguards**: The server atomically rechecks policy and records one immutable release per application. The browser reuses an idempotency key on uncertain retries, prevents pending double submissions, handles server rejection, and displays the release ID plus `SIMULATED RELEASE - NO MONEY MOVED`. Release-relevant edits are rejected after simulated release.
- **Dual Adapter Architecture**: Starts with a development fixture adapter implementing the exact same domain interface as the real SpacetimeDB subscription adapter; connection failures display explicit errors and never silently fallback to fixtures.
- **Resilient State Coverage**: Comprehensive handling of pending, disconnected, empty, forbidden, failed, and retry states across all views.
- **Document Intake**: Prioritize structured JSON, then CSV, with an initial 10 MB limit and actual field/row locators. Text PDFs are optional after the core flow; OCR is outside initial scope. Uploads use authenticated worker transport and authorized database attachment. If unavailable, an agreed synthetic-document selection flow must be labeled honestly.
- **Synthetic Data Prototype**: Operates strictly on synthetic commercial loan applications and documents; no real money, real PII, or live banking integrations.

## Integration Boundaries
- **Frontend — Person 1, `apps/web/`**: Use shared contracts through one adapter; receive generated bindings from Person 2. Display server-confirmed mutations, revisions, readiness, and stable errors. A visual role selector cannot grant authority. Clear sensitive cached data on logout and unsubscribe on session/route changes.
- **Database — Person 2, `spacetimedb/`**: Own identity, organization-scoped permissions, safe projections, job claims/leases, validated persistence, audit history, review invalidation, and atomic release. Borrower isolation and business policy must hold for direct calls as well as the UI.
- **Worker — Person 3, `apps/worker/`**: Own private document bytes, extraction, bounded model/tool orchestration, and validated findings/drafts. Document text is untrusted evidence. The worker cannot send requests, resolve findings, approve reviews, or release; secrets and private storage paths never reach the browser.
- **Shared contracts and integration — Person 4, `packages/contracts/`, `packages/analysis/`, and fixtures**: Own runtime schemas, public string IDs, integer cents with explicit currency, UTC boundary timestamps, stable fixture IDs, deterministic checks, expected results, and root tooling. Do not aggregate different currencies or substitute zero for missing values.
- **Shared execution truth**: Frontend data-adapter mode and worker live/fixture execution must remain explicit. Show actual stored job/tool events rather than invented activity. Neither a connection nor a live provider failure may silently become fixture success. Do not introduce a second application database or duplicate CRUD backend.

## Brand Commitments
- **Name**: LoanWick
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
4. **Density and Clarity**: Maximize screen utility for desktop investigation workflows, keeping evidence, context, and resolution actions accessible without unnecessary nesting or clutter.
5. **Fail-Visible Resilience**: Connection losses, model errors, or extraction failures must remain visibly surfaced with retry actions; never hide errors behind infinite spinners or fake successes.

## Accessibility & Inclusion
- Target WCAG AA with keyboard-operable controls, readable contrast, and text labels alongside status colors. This is an accessibility requirement, not an audited conformance claim.
- Announce meaningful asynchronous worker, extraction, and subscription updates through accessible status feedback such as `aria-live`; avoid overwhelming users with every tool event.
