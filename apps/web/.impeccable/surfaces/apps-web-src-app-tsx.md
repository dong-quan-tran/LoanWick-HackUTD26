---
version: 1
slug: "apps-web-src-app-tsx"
primary_target: "apps/web/src/App.tsx"
related_targets: ["apps/web/src/ContractVerification.tsx","apps/web/src/ContractVerification.module.css"]
---

# Loan contract verification

Mode: Operate. Bank loan officer, primarily desktop with a usable mobile layout. The current user request replaces the primary dashboard with contract upload and a stream of pipeline messages. PDF and DOCX are the confirmed input formats.

## Direction contract

THESIS: Give non-technical loan officers one page for choosing a contract and following verification in plain language.

OWN-WORLD: User-pinned espresso brown, antique gold, warm ivory, and restrained Goldman Sachs-inspired dusty blue accents. Familiar readable controls, a calm serif heading, and larger system-text messages. The project-owned generated leather contract-folio cutout is the single visual signature; no borrowed bank logo.

STORY: Choose a contract, start verification, follow actual stage messages, then open only the result and evidence details needed for review.

FIRST VIEWPORT: LoanWick and one compact Menu above a concise heading, the selected loan, and one illustrated PDF/DOCX upload area. Menu holds loan/session options. After submission, the file collapses to a summary and actual stage messages take priority. Results and evidence expand inline; there are no navigation tabs or extra-page links.

FORM: User-specified upload-to-message-stream workflow within the established visual world. Code-first application surface. seed: none (user-pinned direction).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Protected behaviors

Only safe operational summaries are shown, never private model reasoning. File selection/format checks must not claim upload or verification. Live messages come from actual database job/tool/document states; no invented stage percentages or timer-driven success. The explicitly synthetic sample runs existing deterministic checks. PDF/DOCX service activation requires backend support. Keep source versions, role isolation, and existing review/release safeguards available behind case details.
