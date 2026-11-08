---
name: LoanWick
description: A simple contract-verification flow with evidence available on demand.
colors:
  rail: "#392b23"
  accent: "#725032"
  focus: "#426b80"
  navigation-hover: "#4b3d2d"
  navigation-current: "#574938"
  navigation-text: "#d6cfc7"
  white: "#fff"
  workspace: "#f8f5f0"
  body-ink: "#342a23"
  ink: "#342a23"
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
  verification-ground: "#f8f5f0"
  upload-line: "#c9b796"
  upload-drag: "#f7efdf"
  verification-primary-hover: "#593c25"
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
  connection-online: "#426b80"
  connection-offline: "#916d32"
  reconciliation-background: "#fbf1dd"
typography:
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
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  verification-introduction:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
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
  upload: "12px"
  reconciliation: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  compact: "12px"
  md: "18px"
  lg: "24px"
  xl: "34px"
  verification-gap: "20px"
  verification-section: "32px"
  verification-header-space: "48px"
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
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "9px 19px"
    height: "44px"
  verification-primary-hover:
    backgroundColor: "{colors.verification-primary-hover}"
  verification-primary-disabled:
    backgroundColor: "{colors.verification-disabled-background}"
    textColor: "{colors.verification-disabled-ink}"
  contract-upload:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.upload}"
    padding: "24px 24px 30px"
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

LoanWick is a welcoming institutional interface for non-technical loan officers. Espresso brown, antique gold, ivory, and restrained dusty blue replace the earlier green palette across the application. A calm Source Serif 4 heading sits above familiar system text and generous message sizing. The primary officer screen is one page: a compact Menu, one illustrated upload target, actual verification updates, and expandable results.

The project-owned generated leather contract-folio cutout supplies a familiar document-handling cue. Goldman Sachs is a visual reference, not the product brand or an endorsement; no borrowed bank logo is used. Denser evidence, borrower, and reviewer surfaces remain compatibility routes and share the warm palette without dictating the primary screen's hierarchy. This documents implemented styling, not live PDF/DOCX integration or whole-product accessibility conformance.

**Key Characteristics:**
- Espresso actions and text, ivory ground, gold-toned boundaries, and dusty-blue focus.
- A restrained serif page heading above plain-language system-text updates.
- One compact Menu and a single reading column for upload, messages, and inline evidence.
- One generated transparent contract-folio illustration with recorded provenance.

## Colors

Warm neutral surfaces and espresso actions frame the contract; gold and dusty blue identify operational states without implying a lending decision.

### Primary
- **Espresso Rail** anchors the wordmark and retained secondary navigation.
- **Contract Brown** identifies primary actions and links; deeper hover and pressed shades provide feedback.
- **Gold Boundary** defines the upload target and Menu panel; **Upload Drag** supplies a warmer drag-over fill.
- Verification-specific hover and disabled variants preserve clear action hierarchy.

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
- **Ivory Ground** supplies primary and secondary backgrounds; white supplies headers, fields, upload, and connection containers.
- **Inline Evidence Background** softly groups excerpts without shadow.
- **Body Ink** and **Ink** are dark warm text; **Muted** supports metadata. Fine Line, Control Line, and Input Line boundaries distinguish containers and editable controls.
- Disabled background, ink, and line colors keep unavailable actions distinct across interaction states.

**The Literal Status Rule.** Pair semantic color with a written status; a concern is an item for human investigation, never a visual fraud verdict.

## Typography

**Display Font:** Bundled Source Serif 4 Regular with Georgia and serif fallbacks, limited to the primary page heading. The local `src/assets/source-serif4-regular.ttf` uses `font-display: swap`; its OFL license is retained in `src/assets/SourceSerif4-OFL.txt`. Source: [Google Fonts Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4).
**Body Font:** Native system stack with Segoe UI and sans-serif fallbacks.
**Label/Mono Font:** The same system stack for labels; native monospace with SFMono-Regular and Consolas fallbacks for source text.

**Character:** A calm serif heading establishes the banking tone; familiar system text keeps instructions and operational updates easy to read. Dense secondary evidence retains its compact analytical type.

### Hierarchy
- **Verification headline:** Source Serif 4 at (38px), weight (400), line height (1.2), and tracking (-0.025em); it becomes (31px) at the primary mobile breakpoint.
- **Verification introduction:** Supporting copy at (16px), with line height (1.6) on mobile.
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

The primary verification screen uses an (80px) white header with a fine lower rule. Header content aligns within an approximately (1120px) frame. The centered main box has a maximum outer width of (804px), including (24px) side padding, yielding (756px) of reading width. Desktop top padding is (48px). Title, case context, upload, activity, results, and footer share that single alignment. A plain selected-loan line supplies context. The native Menu in the header contains loan selection and session actions; the primary flow has no tabs, case-history links, or secondary-page navigation.

After submission the large upload target is replaced by a compact file summary and the activity list. Message rows have a (12px) icon/text gap and (24px) vertical gap. Result sections follow a divider; native details expand each concern and its cited excerpts inline. This is progressive disclosure, not a grid of dashboard panels.

At the primary breakpoint of (600px), the header becomes (68px) high with (18px) gutters and main padding becomes (30px 20px 26px). Upload padding becomes (20px 18px 24px). The Menu keeps a (44px) trigger and a viewport-bounded panel; its select uses (16px) text. The visual header role label is hidden at this size while the Menu retains the written session context. Primary actions retain a minimum (44px) height. Filenames, messages, and fingerprint details wrap rather than force horizontal scrolling. The footer wraps naturally.

The following density and breakpoints apply to the retained secondary workspace, not the primary verification route:

The desktop shell has a fixed rail (216px), a flexible content frame, a session header with a minimum height of (70px), and a persistent synthetic-data strip. Main content has a maximum width of (1760px) and padding of (28px 34px 22px). Spacing uses small, repeated steps rather than oversized blank sections.

At full desktop width the findings list is (277px), with a flexible evidence workspace and a (25px) gap. The evidence workspace holds two equal panels with a (17px) gap. Other staff views use a two-column (1.15fr / 1fr) grid with a (24px) gap. The borrower page is capped at (780px).

At (1250px), the rail narrows to (180px), the findings column to (235px), page gutters to (24px), and the evidence gap to (12px). At (1050px), the rail narrows again to (165px), findings to (210px), and evidence and general two-column views stack. At (700px), navigation becomes a compact top row, the frame fills the viewport, main gutters become (18px), and findings join the single-column layout. Tables and tabs retain horizontal overflow rather than compressing their content. Mobile panel inputs use (16px) text and borrower buttons have a minimum height of (44px); the main borrower submission spans its form width.

## Elevation & Depth

Ordinary panels, findings, and controls are flat. Cool page ground, white containers, fine borders, and lightly tinted selected or response surfaces establish separation. Shadows are reserved for the source dialog; focus is an outline rather than elevation.

### Shadow Vocabulary
- **Source dialog:** (`0 15px 65px #3c2f1f30`) separates the modal source reader from the workspace, with a dark translucent backdrop (`#2b221970`).

**The Flat Evidence Rule.** Keep ordinary evidence surfaces shadow-free; preserve modal depth for the source reader.

## Shapes

Corners are gently squared. Badges use the smallest radius, fields slightly more, controls and evidence panels share a moderate radius, and outer surfaces and the source dialog are slightly softer. Thin solid borders carry structure. Small circular connection indicators, message-state icons, and the secondary avatar are local exceptions; do not turn general controls into pills.

Source marks follow wrapped text using cloned box decoration. Icons are inline, stroked SVGs with rounded caps and joins; most are (16–20px), with decorative SVGs hidden from assistive technology.

## Components

### Buttons

Compact and explicit, with icon and text arranged inline.
- **Primary verification:** Contract Brown with white text, a minimum (44px) height, and (19px) inline padding; its hover and disabled variants use the verification-specific palette.
- **Primary secondary-workspace:** Contract Brown with white text; standard padding and control radius are defined in frontmatter. Hover and active darken it.
- **Secondary:** White, Ink, and a thin control border. Hover tints the fill and strengthens the border; active uses a deeper warm neutral.
- **Text:** Transparent, compact, and used for low-emphasis navigation such as “View checks.”
- **Focus:** A global (3px) Dusty Blue Focus outline with (3px) offset.
- **Disabled:** Solid muted colors and a not-allowed cursor, without opacity reduction. Disabled primary controls retain their disabled palette on hover and active.
- **Motion:** Background and border color transition over (160ms ease-out); reduced-motion preference removes transition duration and animation.

### Contract-folio illustration

Use the bundled transparent `src/assets/contract-folio.webp` (about 36KB), generated for LoanWick. Its espresso leather, ivory pages, antique-gold clip, and small dusty-blue tab support document handling. It occupies a (192px × 128px) contain box on desktop and (174px × 116px) on mobile, with empty alt text because the neighboring heading names the action. Preserve transparency and restrained material shading; it is a single visual cue, not evidence or an approval symbol. The exact generation prompt is recorded in `.impeccable/assets/contract-folio.prompt.txt`, with asset provenance alongside the WebP. Do not introduce a bank logo, seal, currency, or endorsement claim.

### Contract upload and file summary

One broad white target has a fine dashed Gold Boundary and the upload radius. The generated folio illustration, short format/size hint, and brown action establish its hierarchy. Desktop target padding is (24px 24px 30px). Drag-over uses the pale Upload Drag fill and accent border; focus within strengthens the boundary while the visible action retains the global focus outline. File selection and submitted-file summary wrap long names. The large target gives way to the summary and activity after submission. The sample is a separate, low-emphasis text action with a written sample-data label. It completes from actual synchronous deterministic checks; do not fabricate timer-driven progress to lengthen it.

### Verification activity and results

A flat ordered list uses circular (26px) icon fields; done, working, and attention states pair a check, clock, or alert with written messages. Supporting text is quieter and bounded in length. The stream is a polite accessible log, with real operational summaries rather than decorative progress percentages. The result uses a small brown heading, written qualification, native expandable concern summaries, and pale, gently squared excerpt blocks with filename, version, and locator. It stays in the same reading column.

Disconnected fixture mode uses a bordered white connection container and a Retry action. Authorized live credential fields are shown only when the adapter supports connecting. Unconfirmed intake remains explicit attention feedback; preliminary file checks do not imply upload, extraction, approval, or successful verification.

### Chips

Status badges are compact rectangles with text, a small radius, and no border. They are informational rather than filters or buttons. Semantic background and ink travel together; neutral is the fallback for unmapped states.

### Cards / Containers

Secondary white surfaces have a fine Line border and no ordinary shadow. General panels use a surface radius, header padding of (19px 22px), and body padding of (22px). Mobile headers use (17px) padding and bodies use (18px). Evidence panels use the control radius and clip their contents within the boundary.

### Inputs / Fields

Native fields are white with Ink text, a thin Input Line border, and a field radius. They have a minimum height of (40px), use the global focus outline, and retain visible labels. Textareas resize vertically. Disabled fields use a pale fill and muted text. Errors appear in separate written alert feedback, rather than relying on a border color alone. Mobile panel fields increase their font size to preserve usable native editing.

### Navigation

The primary header pairs the wordmark and session indicator with one native Menu disclosure. Its bordered trigger gains a warm fill while open; the white panel is (304px) wide at most, anchored to the right with a fine gold boundary, (12px) radius, and (20px) padding. Loan selection and session actions live inside. The page has no rail, tabs, or extra-page links. Secondary rail navigation pairs SVG icons and (13px) text. Links use soft warm-gray text at rest, white text on hover/current state, and distinct brown background tones. Mobile navigation retains accessible names while showing icons. Case tabs are flat, horizontally scrollable buttons; the selected tab has a brown text treatment and bottom rule. They support arrow keys, Home, and End.

### Findings and paired evidence

A finding is a full-width outlined button with a title, source count, identifier, and written status. Selection changes its border and pale fill. Its evidence uses adjacent source panels containing application context, filename, document version, exact marked excerpt, and locator. “Open source document” occupies a full-width panel footer. The excerpt is evidence, not generated decorative copy.

### Source dialog

The native dialog has an accessible title, a visible close control, a bounded viewport width and height, and monospaced source content. Its shadow and backdrop are the only substantial elevation. A source-access failure is displayed as written feedback.

## Do's and Don'ts

### Do:
- **Do** preserve the quiet single-column verification hierarchy and keep dense case navigation secondary.
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
- **Don't** add shadows to ordinary evidence panels or replace rectangular controls with pills.
- **Don't** make disabled primary actions look enabled when hovered or pressed.
- **Don't** present fixture behavior as proof of live integration.
- **Don't** style preliminary file checks or a completed synthetic sample as approval of an uploaded contract.
