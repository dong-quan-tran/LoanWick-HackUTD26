---
version: 1
slug: "apps-web-src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/ContractVerification.tsx","src/ContractVerification.module.css"]
---

# Applications and investigation workspace

Mode: Operate. November 8, 2026 approved frontend revamp: Applications is the staff home screen. The supplied Applications screenshot is the visual authority for the shared workspace; the existing full-screen verification dossier is the explicit exception.

## Approved direction contract

THESIS: Give loan staff a clear view of their authorized applications, then keep investigation and verification in one familiar workspace.

OWN-WORLD: Warm brown navigation, ivory ground, white bordered surfaces, warm gray text, bronze amount bars, dusty blue stages, clay concerns, and green clear indicators. System text carries controls; Source Serif 4 carries dashboard totals and the preserved dossier.

STORY: Scan the portfolio totals and stage distribution, filter the applications, open a case, and review its evidence. Verify contract retains its dossier introduction before revealing the shared workspace.

FIRST VIEWPORT: A narrow brown rail and white status header frame the Applications heading, four summary cards, a compact stage strip, and a searchable application table. Summaries cover the complete authorized portfolio; filters scope only the table.

FORM: User-pinned screenshot, implemented directly in React/CSS. No alternate concept round or generated comp. Verification keeps its existing cover artwork and menu; entering or directly selecting a file reveals the workspace without remounting the desk or losing state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Protected behavior

Preserve adapter contracts, borrower isolation, source citations, revisions, human review, release safeguards, explicit fixture/live states, and failure recovery. Aggregate money by currency. Release-ready totals describe application stages, not authorization to release. The sample remains deterministic; live progress follows actual service events.

## Preserved dossier behavior

`/verify` remains an officer route with its existing full-screen espresso cover, two-line Source Serif 4 statement, Antique Gold emphasis, selected-loan context, double hairlines, edge labels, five orientation milestones, compact Menu, and generated engraved-banknote margins. These treatments are scoped to the cover. The shared operating desk below it has a system-font heading, selected-loan dropdown above a white bordered upload panel, small folio, message stream, and expandable results/evidence. It has no parchment double frame, overlapping gold pill, or floating banknotes.

The cover stays in normal flow above the mounted desk. Entry and skip focus the desk heading; direct keyboard focus, file selection, and sample execution also reveal it without remounting or losing input state. Entry state resets on session changes. Running, completed, failed, and disconnected states bypass the cover. Five cover milestones are orientation only. The four-stage desk ruler follows existing synthetic events; live emphasis is limited to confirmed extraction and completion. Reduced motion disables decorative drift and entrance/message animations.

Only safe operational summaries are shown, never private model reasoning. Preliminary file checks do not claim upload, extraction, or verification. Actual live messages come from document/job/tool states; the explicitly synthetic sample runs existing deterministic checks. PDF/DOCX service activation requires backend support. Preserve source versions, role isolation, and review/release safeguards.

## Implemented scope and validation

Source: `src/App.tsx`, `src/App.module.css`, `src/ContractVerification.tsx`, `src/ContractVerification.module.css`, `src/styles.css`, `src/components/WorkspaceShell.*`, `src/components/PortfolioSummary.*`, and `src/portfolio.ts`. App owns one session subscription. Adapter APIs, backend, generated bindings, and deterministic fixture behavior are unchanged by the visual revamp.

Metrics aggregate the complete authorized portfolio across table filters. Money uses per-currency sums/maxima; latest succeeded investigation status, open findings/flagged cases, and ready/released stages remain distinct. Canonical fixture: 8 applications; USD 1,980,000 shown as $2M with an exact accessible value; 4 open concerns across 4 cases; 8 Reviewing; 0 ready/releases. Stage readiness is not server authorization.

The shared shell has expandable navigation at 700px and below. Metrics use 4/2/1 columns at desktop/999px/599px; mobile filters stack, and the table scrolls in a focusable contained region. Loading skeletons, empty/error states, and subscription updates are implemented.

Validation: 32 web unit tests, all 21 Chromium browser tests, automated Axe scans, and fixture/live production builds passed after the revamp and borrower attachment-grouping fix. Screenshots under repository-root `.impeccable/review/`: `dashboard-reference.png`, `dashboard-desktop.png`, `dashboard-mobile.png`, `dossier-cover-desktop.png`, `dossier-cover-mobile.png`, `desk-desktop.png`, `desk-mobile.png`, `verification-evidence-desktop.png`, `mobile.png` (borrower), and `review-stale.png`. Existing shipping rasters retain adjacent provenance and prompt records; no new raster was generated. These checks do not establish whole-product WCAG conformance, worker/model/extraction completion, or a new cloud/database integration result.

Finish review: the initial review confirmed reference fidelity and identified two material fixes: stale product/design documentation and the borrower attachment grouping. The verdict pass scored both resolved and returned `disposition: ship`. That verdict covers those two scored fixes.

## Entrance motion refinement

November 8 follow-up: adapt entrance motion from `claude/visual-polish` (`a18838c`) without merging that branch's prototype components or changing the approved workspace layout. Shared `src/motion.module.css` owns the (8px) rise, (70ms) summary-card stagger, (800ms) pipeline growth, and (900ms) amount-bar growth. Case panels restart a (450ms) entrance when their tab changes; the table, borrower view, and entered verification desk share that timing. Content and controls stay available during arrival. Reduced motion shows the settled state immediately. No new runtime dependency or perpetual concern pulse was introduced.

Validation for this refinement: 32 web unit tests and all 22 Chromium browser tests passed, along with typechecking and fixture/live production builds. Accessibility scans wait for finite entrances/transitions to settle while ignoring decorative loops. A new regression covers immediate reduced-motion arrivals and Home/End keyboard tab navigation. Desktop/reference/mobile captures retain the approved composition. Manual browser checks confirmed staggered arrival, rapid arrow-key tab changes with focus retained, and the release-ready help overlay above the pipeline after arrival. This is a scoped motion finish check; the earlier reviewer verdict above remains limited to the original revamp fixes.

## Plain-language application comparison

November 8 follow-up: Findings & evidence now presents readable equipment/ownership statements for non-technical loan officers. Concern titles, record status, explanations, and next steps use straightforward language. Each panel identifies the business and document, then shows labeled values without JSON or field paths in the first view. “View original wording” retains verbatim excerpts, document versions, and recorded locations; “Open full document” requests the cited version. This application's records appear first. Resolved concerns, changed application details, and unavailable documents remain explicit. Currency formatting requires matching document/version evidence; false or absent ownership statements never imply a lease or confirmed ownership.

The operating palette, dossier, entrance motion, borrower permissions, clarification flow, and release safeguards remain in place. Desktop matching fields align, while phone panels and the comparison heading/status stack. The scoped finish check covers readability, disclosure access, source fidelity, keyboard operation, and overflow. Captures: `comparison-desktop.png`, `comparison-mobile.png`, `comparison-mobile-expanded.png`, and `comparison-group.png` under repository-root `.impeccable/review/`.

Validation: all 38 web unit tests and 23 Chromium browser tests passed, including Axe checks, original-document access, narrow-phone disclosure/overflow, role isolation, clarification, and release workflows. Typechecking and fixture/live production builds passed. After adding the focused comparison capture, the source-viewer browser test passed again. Presentation tests cover missing/false ownership, unknown pledge status, document-version currency, preservation of original equipment text, absent group totals, and cited version ordering. Desktop and phone captures were visually reviewed; this scoped check is separate from the earlier revamp reviewer verdict.
