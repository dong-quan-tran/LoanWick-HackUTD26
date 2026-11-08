---
name: "LoanWick"
description: "A warm, compact evidence workspace with a preserved espresso dossier cover."
colors:
  rail: "#3b2c23"
  workspace: "#f8f5f0"
  surface: "#fff"
  ink: "#392b23"
  muted: "#7a6958"
  line: "#e5d9cb"
  accent: "#84603f"
  focus: "#52778e"
  navigation-hover: "#4b3d2e"
  navigation-current: "#5b4d39"
  navigation-text: "#e0d5c9"
  control-line: "#d8d4cf"
  input-line: "#d5d1cc"
  button-hover: "#f2efed"
  button-active: "#ebe6e1"
  primary-hover: "#553e25"
  primary-active: "#3f2e1a"
  disabled-background: "#eee7dc"
  disabled-ink: "#726e68"
  disabled-line: "#e3e1de"
  activity-background: "#e9eff7"
  activity-ink: "#3e5e85"
  concern-background: "#fcece6"
  concern-ink: "#a23824"
  clear-background: "#eaf2e6"
  clear-ink: "#486d3c"
  pending-background: "#fbf1d9"
  pending-ink: "#846116"
  current-background: "#f1ede7"
  current-ink: "#65523c"
  amount-bar: "#a17a50"
  amount-track: "#f0eae1"
  reviewing-stage: "#7293b8"
  evidence-highlight: "#fcf0c9"
  evidence-highlight-ink: "#5c4a21"
  inline-evidence: "#f0e9dc"
  espresso: "#18120d"
  mahogany: "#231a14"
  gold: "#c89d5c"
  bronze: "#b68b4c"
  cover-ivory: "#fbf9f5"
  parchment: "#f3ece0"
  cover-blue: "#5b7a94"
  upload-drag: "#f4ede3"
typography:
  portfolio-total:
    fontFamily: "\"Source Serif 4\", Georgia, serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.22
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
  metadata:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.6
  source:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 2
  dossier-display:
    fontFamily: "\"Source Serif 4\", Georgia, serif"
    fontSize: "clamp(25px, 5.5vw, 84px)"
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: "-0.035em"
  verification-message:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  badge: "4px"
  field: "5px"
  control: "6px"
  surface: "8px"
  upload: "9px"
  metric: "10px"
  concern: "20px"
  dossier-entry: "100px"
spacing:
  xs: "4px"
  sm: "8px"
  compact: "12px"
  md: "16px"
  form: "18px"
  panel: "22px"
  section: "24px"
  canvas: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled-background}"
    textColor: "{colors.disabled-ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.button-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 11px"
  navigation:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.navigation-text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  badge-reviewing:
    backgroundColor: "{colors.activity-background}"
    textColor: "{colors.activity-ink}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
  concern-pill:
    backgroundColor: "{colors.concern-background}"
    textColor: "{colors.concern-ink}"
    rounded: "{rounded.concern}"
    padding: "3px 8px"
  clear-pill:
    backgroundColor: "{colors.clear-background}"
    textColor: "{colors.clear-ink}"
    rounded: "{rounded.concern}"
    padding: "3px 8px"
  surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
  metric:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.metric}"
    padding: "18px"
  contract-upload:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.upload}"
    padding: "32px"
  dossier-entry:
    backgroundColor: "{colors.bronze}"
    textColor: "{colors.espresso}"
    rounded: "{rounded.dossier-entry}"
    padding: "15px 27px"
---

# Design System: LoanWick

## Overview

**Creative North Star: "The Evidence Workspace"**

LoanWick uses a narrow warm-brown rail, an ivory canvas, and compact white bordered panels for application scanning and evidence work. System UI text carries controls and headings; bundled Source Serif 4 gives portfolio totals a distinct numerical voice. Bronze amount bars, dusty-blue stages, clay concerns, and green Clear indicators carry meaning alongside written labels.

The existing espresso dossier cover is an explicit surface exception. Its serif statement, antique-gold framing, artwork, and Menu remain intact before the shared verification desk opens. The desk uses the same workspace materials as Applications. Existing generated rasters are reused with provenance; decorative paper never stands in for source evidence.

**Key Characteristics:**
- Warm-brown navigation and an ivory ground across role-appropriate workspaces.
- Compact white panels with fine warm borders and flat evidence surfaces.
- System UI headings and controls; Source Serif 4 totals and dossier statement.
- Text-backed semantic states, visible keyboard focus, and contained mobile overflow.

## Colors

The palette combines warm operational neutrals with restrained, literal status colors; frontmatter contains the source-derived values.

### Primary
- **Rail Brown** anchors navigation; **Contract Brown** is the shared action/link accent. Navigation hover and current tones distinguish state without adding depth.
- **Bronze Amount** fills relative requested-amount bars over their pale track.

### Secondary
- **Activity Blue** marks reviewing, sent, and running badges. **Reviewing Stage** supplies the pipeline segment; **Focus Blue** supplies keyboard outlines.
- **Source Highlight** marks actual cited text; its paired ink keeps excerpts readable.

### Tertiary
- **Concern Clay** and **Clear Green** are application-table concern pills. Legacy high/failed case badges retain their existing clay pair (`#fbece7` / `#973c28`).
- **Pending Ochre** supports pending, stale, unknown, and review-needed states. **Current Warm Neutral** supports current, passed, answered, resolved, and released-demo badges.
- **Espresso**, **Mahogany**, **Antique Gold**, **Bronze**, **Cover Ivory**, **Parchment**, and **Cover Blue** belong to the preserved dossier palette and its existing local accents.

### Neutral
- **Workspace Ivory** is the shared canvas; **Surface White** is the panel and field ground. **Warm Ink**, **Muted**, and **Line** establish text and boundaries.
- Control, input, hover, active, and disabled tokens keep native interactions explicit. **Upload Drag** tints the white intake panel during drag-over; **Inline Evidence** groups verification excerpts.

**The Literal Status Rule.** Pair semantic color with a written status. A concern is an item for human investigation, never a fraud verdict.

## Typography

**Display Font:** Bundled Source Serif 4 Regular, with Georgia and serif fallbacks, for portfolio totals and the preserved dossier statement. The font uses `font-display: swap`; its OFL license remains beside the TTF in `src/assets/`.

**Body Font:** Native system UI stack, including Segoe UI and sans-serif fallbacks. Source readers use native monospace.

### Hierarchy
- **Portfolio total:** The serif total role reduces to (26px) at 1250px and returns to (30px) at 599px. Table amounts use the same face at (13px).
- **Headline:** Shared page headings use the frontmatter role; compact desktop headings reduce to (24px), and workspace mobile headings to (23px). The verification desk keeps a (24px) mobile heading.
- **Title:** Section headings use the title role; panel headings commonly use (14px), verification upload/result headings (19px).
- **Body / label / metadata:** Compact system text serves dense staff work. Metric captions are short uppercase data labels at (10px), (9px) on compact desktop, and (11px) on small mobile; these are not a general heading template.
- **Verification message:** Plain-language activity text remains (16px), with (12px) details and a (68ch) limit; mobile details use (13px).
- **Source:** Monospaced excerpts preserve whitespace and wrap long values; mobile evidence excerpts use (12px).
- **Borrower:** Main requests use (16px) text and (1.8) line height, reducing to (15px) on mobile. Mobile form fields use (16px).
- **Dossier display:** The existing fluid serif statement remains cover-only; at 600px it uses (clamp(22px, 6.15vw, 37px)) and (1.25) line height.

**The Comparable Numbers Rule.** Use tabular numerals for comparable totals, amounts, case metadata, facts, and revision summaries.

## Layout

The shared shell has a fixed desktop rail with width (clamp(160px, 14.25vw, 216px)), a flexible content frame, a white status header, and a synthetic-data strip. Main content is bounded at (1760px) with (30px 32px 22px) padding. At 1250px, gutters become (26px) and the header becomes denser. At 700px, the rail becomes a full-width top navigation with an expandable Menu, the frame loses its left margin, and main gutters become (18px). Escape closes the mobile navigation and restores toggle focus.

Portfolio summaries use four columns with a (14px) gap, two columns at 999px, and one at 599px. The compact stage strip follows them. The application table uses a (740px) minimum width in a focusable contained horizontal-scroll region. Filters stack at 700px, where native search/select controls have (44px) minimum height and (16px) text. Table filters affect rows while the summaries remain portfolio-wide.

Case evidence uses a findings column (277px) beside flexible evidence, with (25px) between them; the findings column narrows at 1250px and 1050px. Paired evidence stacks at 1050px; findings and evidence stack at 700px. General staff grids use (1.15fr / 1fr), then one column at 1050px. Borrower content is capped at (780px).

The verification desk is bounded at (1120px), with the shared shell outside it. A selected-loan dropdown sits above the upload panel; file summary, messages, result disclosures, and evidence stay on the same page. Its cover remains in normal flow above the mounted desk. Cover layout, copy, bypass paths, and stage behavior are recorded in `.impeccable/surfaces/apps-web-src-app-tsx.md`.

## Elevation & Depth

Shared cards, metric panels, upload, findings, and evidence use flat white fills and warm borders. Metric cards add a short colored bottom boundary. Depth is reserved for the native source dialog and the preserved cover Menu/entry action; no paper-lift shadow remains on the desk upload.

- **Source dialog:** (`0 15px 65px #3c2f1f30`), with backdrop (`#2b221970`).
- **Cover Menu:** (`0 18px 40px #18120d14`).
- **Cover entry:** (`0 10px 38px #c89d5c26`), becoming (`0 12px 40px #c89d5c38`) on hover.

**The Cover Boundary Rule.** Keep the dossier’s gold framing, engraved-banknote margins, and ceremonial entry treatment on its cover. Shared operating panels stay flat, white, and bordered.

## Shapes

Small rounded rectangles define controls, fields, badges, and panels; the frontmatter records their distinct existing radii. Concern pills are rounder than stage badges. Metric icons use compact softly squared fields; connection dots and message icons are circular. Fine one-pixel borders carry ordinary structure. Cover double hairlines, edge labels, and the pill-shaped entry action are preserved exceptions, not reusable desk framing.

## Components

### Buttons
Shared primary actions use Contract Brown with white text, a control radius, and (40px) minimum height; hover/active deepen the brown. Secondary actions use white, Warm Ink, and the control border. Verification primary actions use the same accent with (46px) minimum height and (24px) inline padding; their local hover is (`#443126`). The preserved dossier entry keeps its Bronze/Gold treatment and (54px) minimum height, reducing to (50px) on mobile. Disabled states retain solid muted colors. Global focus is a (3px) outline with (3px) offset. Background/border transitions use (160ms ease-out); reduced motion removes transitions and animation.

### Chips
Application stages use compact rectangular text badges; Reviewing uses Activity Blue. Open concern pills combine a clay fill, dot, and count; Clear uses green with its written label. They are informational, not filtering controls. Existing case badges retain their domain-state mappings.

### Cards / Containers
Shared white surfaces use a warm border and no ordinary shadow. General panel bodies use (22px) padding, decreasing to (18px) on mobile. Metrics have (18px) padding, a (3px) bottom boundary, a small icon field, serif total, and explanatory detail. Their compact-desktop padding is (12px 16px). Loading totals use quiet solid skeletons; errors and empty states use explicit text.

### Inputs / Fields
Native fields are white with Warm Ink, a one-pixel Input Line boundary, field radius, and (40px) minimum height. Labels remain visible; textareas resize vertically. Disabled fields use pale fills and muted text. Written alerts communicate errors. Search combines a stroked SVG icon with a borderless input inside the bordered field shell.

### Navigation
The rail pairs stroked SVG icons with text; current and hover states use distinct warm-brown fills and white text. The white header shows connection/data mode and role/session controls; the strip below states synthetic data and no money movement. Borrowers receive their own-case navigation. Mobile Menu uses `aria-expanded` and `aria-controls`; current links use `aria-current`. Case tabs remain horizontally scrollable with a selected bottom rule and arrow/Home/End keyboard behavior. The cover retains its own native Menu until entry.

### Contract upload and activity
A flat white bordered upload panel contains the small generated folio in a (116px × 80px) box, system-text title, requirements, and actions. Drag-over tints the surface and strengthens its border. A selected file becomes a compact summary. The separate sample action is explicitly synthetic. Activity uses written messages and (26px) circular state icons; expandable results keep source versions and locators beside evidence. The four-stage ruler follows supported events; cover milestones are orientation only.

### Evidence and supporting documents
Evidence panels keep application context, filename, document version, exact marked excerpt, locator, and source action together. The native source dialog has a title, close control, bounded size, and written access failure. Borrower synthetic-document explanation and action remain grouped in a pale tinted container; its text child can shrink without overflow. Generated folio and engraved-paper assets keep their adjacent provenance and prompt records. Banknote decoration appears only on the cover, masked away from text, and drifts over (24s/29s) only when motion is allowed.

## Do's and Don'ts

### Do:
- **Do** extend the shared warm-brown rail, ivory canvas, and white bordered panel language.
- **Do** pair stage and concern colors with literal text and preserve visible keyboard focus.
- **Do** preserve per-currency money, exact accessible totals, and source versions beside evidence.
- **Do** keep the cover exception scoped and the small folio inside upload.
- **Do** keep mobile filters usable, tables in contained scroll regions, and borrower fields legible.

### Don't:
- **Don't** reintroduce parchment double frames, overlapping gold loan pills, or floating banknotes into the operating desk.
- **Don't** use concern or Clear styling to imply fraud proof, lending approval, or server release authorization.
- **Don't** give ordinary panels ornamental shadows or use decorative imagery as evidence.
- **Don't** present fixture behavior, preliminary file checks, or a completed sample as live extraction or model verification.
