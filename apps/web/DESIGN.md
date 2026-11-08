---
name: LoanWick
description: An espresso dossier cover opens onto an ivory contract-verification desk.
colors:
  rail: "#18120d"
  accent: "#725032"
  focus: "#5b7a94"
  navigation-hover: "#4b3d2d"
  navigation-current: "#574938"
  navigation-text: "#d6cfc7"
  white: "#fff"
  workspace: "#f8f5f0"
  body-ink: "#231a14"
  ink: "#231a14"
  muted: "#756556"
  line: "#dfd3c4"
  control-line: "#d8d4cf"
  input-line: "#d5d1cc"
  button-hover: "#f2efed"
  button-active: "#ebe6e1"
  primary-hover: "#553e25"
  primary-active: "#3f2e1a"
  disabled-background: "#eee7dc"
  disabled-ink: "#726e68"
  disabled-line: "#e3e1de"
  status-neutral-background: "#f1f0ee"
  status-neutral-ink: "#635e57"
  concern-background: "#fbece7"
  concern-ink: "#973c28"
  pending-background: "#fbf1d9"
  pending-ink: "#846116"
  current-background: "#f1ede7"
  current-ink: "#65523c"
  activity-background: "#e9eff7"
  activity-ink: "#3e5e85"
  evidence-highlight: "#fcf0c9"
  evidence-highlight-ink: "#5c4a21"
  verification-ground: "#fbf9f5"
  upload-line: "#b68b4c"
  upload-drag: "#f1e6d2"
  verification-primary-hover: "#443126"
  verification-disabled-background: "#eee7dc"
  verification-disabled-ink: "#7b6f61"
  verification-disabled-line: "#ddd1c0"
  message-done-background: "#f1e7d2"
  message-done-ink: "#725032"
  message-working-background: "#e9f0f3"
  message-working-ink: "#446b7c"
  message-attention-background: "#f8edce"
  message-attention-ink: "#77521b"
  inline-evidence-background: "#f0e9dc"
  connection-online: "#5b7a94"
  connection-offline: "#b68b4c"
  reconciliation-background: "#fbf1dd"
  espresso: "#18120d"
  mahogany: "#231a14"
  gold: "#c89d5c"
  bronze: "#b68b4c"
  ivory: "#fbf9f5"
  parchment: "#f3ece0"
  blue: "#5b7a94"
typography:
  dossier-display:
    fontFamily: '"Source Serif 4", Georgia, serif'
    fontSize: "clamp(25px, 5.5vw, 84px)"
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 600
  metadata:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.6
  source:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 2
  verification-headline:
    fontFamily: '"Source Serif 4", Georgia, serif'
    fontSize: "clamp(31px, 3.1vw, 46px)"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  verification-introduction:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  upload-title:
    fontFamily: '"Source Serif 4", Georgia, serif'
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  verification-message:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  verification-message-detail:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
  verification-result-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  badge: "4px"
  field: "5px"
  control: "6px"
  surface: "7px"
  dialog: "10px"
  upload: "3px"
  reconciliation: "8px"
  pill: "100px"
spacing:
  xs: "4px"
  sm: "8px"
  compact: "12px"
  md: "18px"
  lg: "24px"
  xl: "34px"
  verification-gap: "20px"
  verification-section: "32px"
  verification-header-space: "43px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.white}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled-background}"
    textColor: "{colors.disabled-ink}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.button-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "#5a4e40"
    padding: "5px 0 5px 12px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 11px"
  navigation:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.navigation-text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  badge:
    backgroundColor: "{colors.status-neutral-background}"
    textColor: "{colors.status-neutral-ink}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
  surface:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.surface}"
  evidence-panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.control}"
  finding:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "17px 16px 13px"
  verification-primary:
    backgroundColor: "{colors.mahogany}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.pill}"
    padding: "9px 24px"
    height: "46px"
  verification-primary-hover:
    backgroundColor: "{colors.verification-primary-hover}"
  verification-primary-disabled:
    backgroundColor: "{colors.verification-disabled-background}"
    textColor: "{colors.verification-disabled-ink}"
  contract-upload:
    rounded: "{rounded.upload}"
    padding: "34px 30px 26px"
  dossier-entry:
    backgroundColor: "{colors.bronze}"
    textColor: "{colors.espresso}"
    rounded: "{rounded.pill}"
    padding: "15px 27px"
    height: "54px"
  capital-badge:
    backgroundColor: "{colors.mahogany}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
  verification-message-icon:
    rounded: "50%"
    size: "26px"
  inline-evidence:
    backgroundColor: "{colors.inline-evidence-background}"
    rounded: "{rounded.field}"
    padding: "15px 18px"
  source-dialog:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "26px"
---

# Design System: LoanWick

## Overview

**Creative North Star: "The Evidence Workspace"**

LoanWick pairs a ceremonial espresso dossier cover with a warm-ivory operating desk for non-technical loan officers. Source Serif 4 carries the cover statement and the desk headings; familiar system text carries instructions and verification updates. Antique gold supplies framing and emphasis, while restrained dusty blue marks focus and operational activity. The operating flow remains one reading column with a compact Menu, one illustrated upload target, factual updates, and expandable results.

Project-owned generated leather-folio and fictional engraved-banknote cutouts supply the material language: leather, security paper, fine gold rules, and parchment. Banknotes sit at soft focal depths in the margins; a small paper fan supports the folio inside the upload frame. Goldman Sachs remains a visual reference, without a borrowed bank logo or endorsement. Denser evidence, borrower, and reviewer surfaces remain compatibility routes. This documents implemented styling, not live PDF/DOCX integration or whole-product accessibility conformance.

**Key Characteristics:**
- A dark espresso cover and light ivory desk share antique-gold framing and dusty-blue focus.
- Monumental serif cover type settles into readable serif desk headings and system-text updates.
- One compact Menu and a single reading column for upload, messages, and inline evidence.
- Generated leather and engraved-paper cutouts carry provenance and remain decorative.

## Colors

Warm neutral surfaces and espresso actions frame the contract; gold and dusty blue identify operational states without implying a lending decision.

### Primary
- **Espresso** supplies the cover and dark ink; **Mahogany** supplies the operating action and selected-loan pill. **Espresso Rail** retains the navigation anchor on compatibility routes.
- **Antique Gold** emphasizes the cover statement and frame; **Bronze** supplies its entry action, upload borders, and completed stage marks. **Parchment** supports the material palette.
- **Contract Brown** remains the shared secondary-workspace action and link accent. Verification-specific hover and disabled variants retain clear feedback.
- **Upload Drag** is the deeper parchment fill used when a file crosses the upload target.

### Secondary
- **Dusty Blue Focus** supplies keyboard outlines and the primary connected indicator.
- **Source Highlight** remains a pale yellow mark around actual cited source text.

### Tertiary
- **Concern Clay** identifies high-priority, contradicted, or failed states on secondary routes.
- **Pending Ochre** identifies pending, stale, unknown, and review-needed states.
- **Current Warm Neutral** identifies current, answered, resolved, passed, and released-demo states.
- **Activity Blue** identifies sent, running, and reviewing states.
- **Message Done** pairs gold-tinted fill with brown icons; **Message Working** uses dusty blue; **Message Attention** uses ochre. These local message-state tints remain separate from secondary badges.
- **Connection Offline** supports the written connection label; **Reconciliation Background** distinguishes uncertain upload feedback.

### Neutral
- **Ivory** supplies the primary desk and light header; the cover reverses to Espresso. The upload uses a warm parchment gradient rather than white. The retained secondary workspace uses its existing warm ground, white fields, panels, and connection containers.
- **Inline Evidence Background** softly groups excerpts without shadow.
- **Body Ink** and **Ink** are dark warm text; **Muted** supports metadata. Fine Line, Control Line, and Input Line boundaries distinguish containers and editable controls.
- Disabled background, ink, and line colors keep unavailable actions distinct across interaction states.

**The Literal Status Rule.** Pair semantic color with a written status; a concern is an item for human investigation, never a visual fraud verdict.

## Typography

**Display Font:** Bundled Source Serif 4 Regular with Georgia and serif fallbacks for the dossier statement and operating-desk headings. The local `src/assets/source-serif4-regular.ttf` uses `font-display: swap`; its OFL license is retained in `src/assets/SourceSerif4-OFL.txt`. Source: [Google Fonts Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4).
**Body Font:** Native system stack with Segoe UI and sans-serif fallbacks.
**Label/Mono Font:** The same system stack for labels; native monospace with SFMono-Regular and Consolas fallbacks for source text.

**Character:** Large serif type gives the cover its ceremonial scale; the same face keeps desk headings connected to that world. Familiar system text keeps instructions and operational updates readable. Dense secondary evidence retains its compact analytical type.

### Hierarchy
- **Dossier display:** The fluid serif display role carries the two-line cover statement; the second line is Antique Gold. Below the primary mobile breakpoint it uses (clamp(22px, 6.15vw, 37px)) with line height (1.25).
- **Verification headline:** The fluid serif headline is centered above the desk, with the size, weight, line height, and tracking defined in frontmatter. Mobile fixes its size to (32px).
- **Upload title:** A smaller serif action heading; mobile reduces it to (22px).
- **Verification introduction:** Supporting copy uses the frontmatter role; mobile reduces it to (14px).
- **Verification message:** Operational text at (16px), line height (1.6), with (12px) details at (1.65) and a (68ch) cap. Mobile messages become (16px), with (13px) details.
- **Verification result:** (19px) outcome heading, (14px) concern summaries, and (13px) proportional-font excerpts. Primary excerpts preserve whitespace; secondary source readers retain monospace.
- **Secondary headline:** The page heading; it reduces at the two narrower responsive breakpoints, reaching (23px) on mobile.
- **Title:** Default section heading; evidence titles use (18px), while compact panel headings use (14px).
- **Body:** Base reading text; dense staff explanations use (11–13px) and line lengths around (70–74ch). Borrower messages use (16px), reducing to (15px) on mobile, with (1.8) line height.
- **Label:** Mixed-case field labels. Control text uses (13px) and weight (600); mobile panel labels increase to (13px).
- **Metadata:** Filenames, versions, status, and timestamps use the small text role. Do not promote this dense staff role to borrower form input text.
- **Source:** Monospaced source excerpts preserve whitespace and wrap long values; mobile excerpts increase to (12px).

**The Comparable Numbers Rule.** Use tabular numerals for amounts, case metadata, facts, and revision summaries.

## Layout

The primary verification surface has a shared (80px) header with (64px) horizontal padding and a fine gold lower rule. It is Espresso on the cover and Ivory on the desk. The selected loan and execution mode remain visible in the surface context; the native Menu holds loan selection and session actions. The primary flow has no tabs or case-history links.

The cover occupies at least the remaining viewport height and keeps its display type centered within an (1100px) maximum content width. Double hairlines and narrow vertical edge labels frame it. Its five numbered intake milestones describe the workflow; they are an orientation ruler, not live progress. Cover composition, copy, and entry behavior are scoped in `.impeccable/surfaces/apps-web-src-app-tsx.md`.

The centered operating desk has a maximum outer width of (788px), including (24px) side padding, yielding (740px) of reading width. It uses (43px) top padding, a centered title, and one upload frame. A dark selected-loan pill overlaps that frame. The sample action stays separate below it. Four dynamic stages sit above the footer. After submission the large upload gives way to a compact file summary and the message stream; results and native concern disclosures remain in the same reading column.

At (1050px), header gutters reduce to (48px), cover gutters to (66px), and desk width is bounded by the viewport minus (84px). At (600px), the header is (68px) high with (20px) gutters. The desk outer width becomes the viewport minus (26px), with padding (33px 17px 22px). Edge labels narrow, the cover milestones wrap, the selected-loan pill can wrap, and the stage labels stack beneath their numbers. Decorative desk-margin banknotes are hidden. The upload uses (38px 17px 25px) padding. Menu selection uses (16px) text; operating actions retain at least (46px) height. Long filenames and source fingerprints wrap. The footer wraps naturally.

The following density and breakpoints apply to the retained secondary workspace, not the primary verification route:

The desktop shell has a fixed rail (216px), a flexible content frame, a session header with a minimum height of (70px), and a persistent synthetic-data strip. Main content has a maximum width of (1760px) and padding of (28px 34px 22px). Spacing uses small, repeated steps rather than oversized blank sections.

At full desktop width the findings list is (277px), with a flexible evidence workspace and a (25px) gap. The evidence workspace holds two equal panels with a (17px) gap. Other staff views use a two-column (1.15fr / 1fr) grid with a (24px) gap. The borrower page is capped at (780px).

At (1250px), the rail narrows to (180px), the findings column to (235px), page gutters to (24px), and the evidence gap to (12px). At (1050px), the rail narrows again to (165px), findings to (210px), and evidence and general two-column views stack. At (700px), navigation becomes a compact top row, the frame fills the viewport, main gutters become (18px), and findings join the single-column layout. Tables and tabs retain horizontal overflow rather than compressing their content. Mobile panel inputs use (16px) text and borrower buttons have a minimum height of (44px); the main borrower submission spans its form width.

## Elevation & Depth

Depth follows the material. The upload frame has a soft paper lift, the selected-loan pill a small contact shadow, and the cover entry action a diffuse gold glow. Blurred engraved-paper margins sit behind the reading column. Ordinary evidence panels and findings stay flat; focus remains an outline. The source dialog retains its stronger modal depth.

### Shadow Vocabulary
- **Parchment upload:** (`0 18px 48px #231a1410, 0 4px 12px #231a1408`) lifts the single intake frame.
- **Selected-loan pill:** (`0 6px 14px #18120d12`) separates context from the frame it overlaps.
- **Cover entry:** (`0 10px 38px #c89d5c26`), strengthening on hover to (`0 12px 40px #c89d5c38`).
- **Officer Menu:** (`0 18px 40px #18120d14`) separates the open disclosure from its header.
- **Source dialog:** (`0 15px 65px #3c2f1f30`) separates the modal source reader from the workspace, with a dark translucent backdrop (`#2b221970`).

**The Flat Evidence Rule.** Keep ordinary evidence surfaces shadow-free; material depth belongs to intake and overlays, not to every result.

## Shapes

The primary intake frame is nearly square, with double hairlines and short corner ticks. Its selected-loan badge and primary actions are deliberately pill-shaped. Shared secondary controls retain their gently squared corners: badges, fields, evidence panels, outer surfaces, and dialog follow the existing radius scale. Fine borders carry structure. Circular connection indicators, message-state icons, and the secondary avatar remain local forms.

Source marks follow wrapped text using cloned box decoration. Icons are inline, stroked SVGs with rounded caps and joins; most are (16–20px), with decorative SVGs hidden from assistive technology.

## Components

### Buttons

Compact and explicit, with icon and text arranged inline.
- **Primary verification:** Mahogany with Ivory text, a pill radius, a minimum (46px) height, and (24px) inline padding; hover deepens the warm brown and active returns to Espresso. Disabled colors remain explicit.
- **Dossier entry:** Bronze with Espresso text, a gold boundary, a minimum (54px) height, and a diffuse gold glow; hover uses Antique Gold. Mobile reduces height to (50px) and inline padding to (22px).
- **Primary secondary-workspace:** Contract Brown with white text; standard padding and control radius are defined in frontmatter. Hover and active darken it.
- **Secondary:** White, Ink, and a thin control border. Hover tints the fill and strengthens the border; active uses a deeper warm neutral.
- **Text:** Transparent, compact, and used for low-emphasis navigation such as “View checks.”
- **Focus:** A global (3px) Dusty Blue Focus outline with (3px) offset.
- **Disabled:** Solid muted colors and a not-allowed cursor, without opacity reduction. Disabled primary controls retain their disabled palette on hover and active.
- **Motion:** Background and border color transition over (160ms ease-out); reduced-motion preference removes transition duration and animation.

### Contract-folio illustration

Use the bundled transparent `src/assets/contract-folio.webp` (about 36KB), generated for LoanWick. Its leather, ivory pages, gold clip, and dusty-blue tab supply the central document-handling cue. The desk composition uses a (240px × 164px) contain box, reducing to (204px × 142px) on mobile. Two rotated copies of the engraved-paper asset form a small fan behind the folio. The whole composition is hidden from assistive technology because the neighboring text names the action. Preserve transparency and the recorded material shading.

### Engraved-paper margins

The bundled transparent `src/assets/engraved-banknote.webp` is fictional ornamental financial paper with no denomination, readable text, national currency, or bank logo. Six repeated copies at different rotations, opacity, and blur depths populate each surface's margins; masks protect the reading column. Slow (24s/29s ease-in-out) drift runs only when motion is permitted. The desk enters over (420ms), and reduced-motion preference removes every decorative animation and transition. Mobile retains quiet cover decoration and hides the desk-margin copies. This artwork never supplies source evidence or indicates approval.

Generation prompts are retained under `.impeccable/assets/`; each shipping WebP has adjacent prompt/date provenance. The font license remains alongside the bundled font.

### Contract upload and file summary

One parchment-gradient target has a solid Bronze boundary, inset hairline, small corner ticks, and a selected-loan pill crossing its top edge. The generated folio and security-paper fan sit above the serif action title and format/size hint. Padding and radius are defined in frontmatter; the full gradient and material shadows live in the sidecar. Drag-over deepens the parchment and strengthens the border; focus within also strengthens the border while the visible action retains its focus outline. File selection and submitted-file summaries wrap long names. The large target gives way to the summary and activity after submission. The sample remains a separate text action with a written sample-data label; its existing synthetic stage sequence is unchanged.

### Verification activity and results

A flat ordered list uses circular (26px) icon fields; done, working, and attention states pair a check, clock, or alert with written messages. Working steps pulse gently when motion is permitted. Supporting text is quieter and bounded in length. The stream is a polite accessible log with progressive stage updates. The result uses a small brown heading, written qualification, native expandable plain-language concern summaries, and pale, gently squared record blocks that translate raw JSON fields and JSONPath locators into non-technical labels, values, business names, and document sections. It stays in the same reading column.

The four-stage ruler shows reading pages, equipment claims, borrower limits, and evidence summary. It follows the existing synthetic stage events during a sample. Live operation highlights only confirmed extraction and completion states; generic running events do not fabricate intermediate substages. Labels and `aria-current="step"` accompany the colored marks.

Disconnected fixture mode uses a bordered white connection container and a Retry action. Authorized live credential fields are shown only when the adapter supports connecting. Unconfirmed intake remains explicit attention feedback; preliminary file checks do not imply upload, extraction, approval, or successful verification.

### Chips

Status badges are compact rectangles with text, a small radius, and no border. They are informational rather than filters or buttons. Semantic background and ink travel together; neutral is the fallback for unmapped states.

### Cards / Containers

Secondary white surfaces have a fine Line border and no ordinary shadow. General panels use a surface radius, header padding of (19px 22px), and body padding of (22px). Mobile headers use (17px) padding and bodies use (18px). Evidence panels use the control radius and clip their contents within the boundary.

### Inputs / Fields

Native fields are white with Ink text, a thin Input Line border, and a field radius. They have a minimum height of (40px), use the global focus outline, and retain visible labels. Textareas resize vertically. Disabled fields use a pale fill and muted text. Errors appear in separate written alert feedback, rather than relying on a border color alone. Mobile panel fields increase their font size to preserve usable native editing.

### Navigation

The primary header pairs the wordmark and session indicator with one native Menu disclosure. Its bordered trigger gains a warm fill while open; the Ivory panel is (304px) wide at most, anchored to the right with a Bronze boundary, (8px) radius, and (20px) padding. Loan selection and session actions live inside. The page has no rail, tabs, or extra-page links. Secondary rail navigation pairs SVG icons and (13px) text. Links use soft warm-gray text at rest, white text on hover/current state, and distinct brown background tones. Mobile navigation retains accessible names while showing icons. Case tabs are flat, horizontally scrollable buttons; the selected tab has a brown text treatment and bottom rule. They support arrow keys, Home, and End.

### Findings and paired evidence

A finding is a full-width outlined button with a title, source count, identifier, and written status. Selection changes its border and pale fill. Its evidence uses adjacent source panels containing application context, filename, document version, exact marked excerpt, and locator. “Open source document” occupies a full-width panel footer. The excerpt is evidence, not generated decorative copy.

### Source dialog

The native dialog has an accessible title, a visible close control, a bounded viewport width and height, and monospaced source content. Its shadow and backdrop separate the modal reader from the operating surface. A source-access failure is displayed as written feedback.

## Do's and Don'ts

### Do:
- **Do** preserve the single-column operating hierarchy and keep dense case navigation secondary.
- **Do** keep ornamental engraved paper outside the reading column and distinguish decorative imagery from source evidence.
- **Do** preserve the espresso navigation anchor on compatibility routes and warm light surfaces throughout.
- **Do** keep filenames, versions, locators, and highlights beside the source text they describe.
- **Do** pair status colors with literal text and retain visible keyboard focus.
- **Do** use tabular numerals for comparable money and revision values.
- **Do** keep mobile borrower fields legible and submission controls easy to reach.
- **Do** display fixture, connection, synthetic-data, and failure feedback honestly.
- **Do** keep current-stage messages and expandable results aligned to the primary reading column.

### Don't:
- **Don't** add ornamental dashboard metrics or competing illustration styles to the operating workspace.
- **Don't** use a concern color or label to imply a confirmed fraud verdict.
- **Don't** add shadows to ordinary evidence panels; keep pill shapes scoped to the primary intake actions and selected-loan badge.
- **Don't** make disabled primary actions look enabled when hovered or pressed.
- **Don't** present fixture behavior as proof of live integration.
- **Don't** style preliminary file checks or a completed synthetic sample as approval of an uploaded contract.
