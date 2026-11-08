---
name: LoanWick
description: A concise evidence workspace for human loan investigation.
colors:
  rail: "#123c3b"
  accent: "#11695d"
  focus: "#138574"
  navigation-hover: "#1f4b47"
  navigation-current: "#2a5750"
  navigation-text: "#c0d6cd"
  white: "#fff"
  workspace: "#f3f6f5"
  body-ink: "#233a39"
  ink: "#223b39"
  muted: "#52665c"
  line: "#dce4e1"
  control-line: "#cbd8d3"
  input-line: "#c8d5cf"
  button-hover: "#eaf2ee"
  button-active: "#dcebe4"
  primary-hover: "#0e554b"
  primary-active: "#093f38"
  disabled-background: "#edf1ef"
  disabled-ink: "#647268"
  disabled-line: "#dce3df"
  status-neutral-background: "#edf1ed"
  status-neutral-ink: "#526358"
  concern-background: "#fbece7"
  concern-ink: "#973c28"
  pending-background: "#fbf1d9"
  pending-ink: "#846116"
  current-background: "#e3f1e6"
  current-ink: "#286548"
  activity-background: "#e9eff7"
  activity-ink: "#3e5e85"
  evidence-highlight: "#fcf0c9"
  evidence-highlight-ink: "#5c4a21"
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
rounded:
  badge: "4px"
  field: "5px"
  control: "6px"
  surface: "7px"
  dialog: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  compact: "12px"
  md: "18px"
  lg: "24px"
  xl: "34px"
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
    textColor: "#345a48"
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
  source-dialog:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "26px"
---

# Design System: LoanWick

## Overview

**Creative North Star: "The Evidence Workspace"**

LoanWick is a concise, straightforward operating interface. Light evidence panels sit within cool neutral work areas; a deep teal rail provides a stable navigation anchor. Compact system typography keeps document comparisons and human actions legible without adding a promotional layer.

The signature is paired real-source highlights with filenames, document versions, and locators kept close to the excerpts. Desktop staff can compare records side by side, while the borrower gets a single-column request and response view. This records the implemented fixture interface; live integration remains explicitly unverified.

**Key Characteristics:**
- Light, flat evidence surfaces and a deep teal navigation rail.
- Compact system text with tabular money and revision values.
- Paired source excerpts, literal status labels, and visible next actions.
- Desktop staff density and native mobile borrower controls.

## Colors

Muted greens and cool neutrals frame the evidence; warm highlights and restrained semantic colors identify information requiring attention.

### Primary
- **Deep Teal Rail** anchors application navigation; its lighter hover and current tones distinguish navigation state.
- **Action Teal** identifies primary actions and links; darker hover and pressed tones provide feedback.
- **Focus Teal** makes keyboard focus visible across controls and links.

### Secondary
- **Source Highlight** pairs a pale yellow fill with dark brown text only around the actual cited source text.

### Tertiary
- **Concern Clay** identifies high-priority, contradicted, or failed states.
- **Pending Ochre** identifies pending, stale, unknown, and review-needed states.
- **Current Green** identifies current, answered, resolved, passed, and released-demo states.
- **Activity Blue** identifies sent, running, and reviewing states.

### Neutral
- **Cool Workspace** supplies the page ground; **White** supplies panels, fields, and the session header.
- **Body Ink** is the global text color; **Ink** is used by controls and the source dialog. **Muted** supports metadata without replacing main content.
- **Line**, **Control Line**, and **Input Line** distinguish panel boundaries and editable controls.
- **Disabled Background**, **Disabled Ink**, and **Disabled Line** keep unavailable primary actions visibly distinct across hover and active states.

**The Literal Status Rule.** Pair semantic color with a written status; a concern is an item for human investigation, never a visual fraud verdict.

## Typography

**Body Font:** Native system stack with Segoe UI and sans-serif fallbacks.
**Label/Mono Font:** The same system stack for labels; native monospace with SFMono-Regular and Consolas fallbacks for source text.

**Character:** Compact, familiar, and analytical. There is no decorative display role; the confirmed system typography serves operational headings and content.

### Hierarchy
- **Headline:** The page heading; it reduces at the two narrower responsive breakpoints, reaching (23px) on mobile.
- **Title:** Default section heading; evidence titles use (18px), while compact panel headings use (14px).
- **Body:** Base reading text; dense staff explanations use (11–13px) and line lengths around (70–74ch). Borrower messages use (16px), reducing to (15px) on mobile, with (1.8) line height.
- **Label:** Mixed-case field labels. Control text uses (13px) and weight (600); mobile panel labels increase to (13px).
- **Metadata:** Filenames, versions, status, and timestamps use the small text role. Do not promote this dense staff role to borrower form input text.
- **Source:** Monospaced source excerpts preserve whitespace and wrap long values; mobile excerpts increase to (12px).

**The Comparable Numbers Rule.** Use tabular numerals for amounts, case metadata, facts, and revision summaries.

## Layout

The desktop shell has a fixed rail (216px), a flexible content frame, a session header with a minimum height of (70px), and a persistent synthetic-data strip. Main content has a maximum width of (1760px) and padding of (28px 34px 22px). Spacing uses small, repeated steps rather than oversized blank sections.

At full desktop width the findings list is (277px), with a flexible evidence workspace and a (25px) gap. The evidence workspace holds two equal panels with a (17px) gap. Other staff views use a two-column (1.15fr / 1fr) grid with a (24px) gap. The borrower page is capped at (780px).

At (1250px), the rail narrows to (180px), the findings column to (235px), page gutters to (24px), and the evidence gap to (12px). At (1050px), the rail narrows again to (165px), findings to (210px), and evidence and general two-column views stack. At (700px), navigation becomes a compact top row, the frame fills the viewport, main gutters become (18px), and findings join the single-column layout. Tables and tabs retain horizontal overflow rather than compressing their content. Mobile panel inputs use (16px) text and borrower buttons have a minimum height of (44px); the main borrower submission spans its form width.

## Elevation & Depth

Ordinary panels, findings, and controls are flat. Cool page ground, white containers, fine borders, and lightly tinted selected or response surfaces establish separation. Shadows are reserved for the source dialog; focus is an outline rather than elevation.

### Shadow Vocabulary
- **Source dialog:** (`0 15px 65px #123c3b30`) separates the modal source reader from the workspace, with a dark translucent backdrop (`#102b2870`).

**The Flat Evidence Rule.** Keep ordinary evidence surfaces shadow-free; preserve modal depth for the source reader.

## Shapes

Corners are gently squared. Badges use the smallest radius, fields slightly more, controls and evidence panels share a moderate radius, and outer surfaces and the source dialog are slightly softer. Thin solid borders carry structure. Small circular connection indicators and the avatar are local exceptions; do not turn general controls into pills.

Source marks follow wrapped text using cloned box decoration. Icons are inline, stroked SVGs with rounded caps and joins; most are (16–20px), with decorative SVGs hidden from assistive technology.

## Components

### Buttons

Compact and explicit, with icon and text arranged inline.
- **Primary:** Action Teal with white text; standard padding and control radius are defined in frontmatter. Hover and active darken it.
- **Secondary:** White, Ink, and a thin control border. Hover tints the fill and strengthens the border; active uses a deeper pale green.
- **Text:** Transparent, compact, and used for low-emphasis navigation such as “View checks.”
- **Focus:** A global (3px) Focus Teal outline with (3px) offset.
- **Disabled:** Solid muted colors and a not-allowed cursor, without opacity reduction. Disabled primary controls retain their disabled palette on hover and active.
- **Motion:** Background and border color transition over (160ms ease-out); reduced-motion preference removes transition duration and animation.

### Chips

Status badges are compact rectangles with text, a small radius, and no border. They are informational rather than filters or buttons. Semantic background and ink travel together; neutral is the fallback for unmapped states.

### Cards / Containers

White surfaces have a fine Line border and no ordinary shadow. General panels use a surface radius, header padding of (19px 22px), and body padding of (22px). Mobile headers use (17px) padding and bodies use (18px). Evidence panels use the control radius and clip their contents within the boundary.

### Inputs / Fields

Native fields are white with Ink text, a thin Input Line border, and a field radius. They have a minimum height of (40px), use the global focus outline, and retain visible labels. Textareas resize vertically. Disabled fields use a pale fill and muted text. Errors appear in separate written alert feedback, rather than relying on a border color alone. Mobile panel fields increase their font size to preserve usable native editing.

### Navigation

The rail pairs SVG icons and (13px) text. Links use soft green-gray text at rest, white text on hover/current state, and distinct teal background tones. Mobile navigation retains accessible names while showing icons. Case tabs are flat, horizontally scrollable buttons; the selected tab has a green text treatment and bottom rule. They support arrow keys, Home, and End.

### Findings and paired evidence

A finding is a full-width outlined button with a title, source count, identifier, and written status. Selection changes its border and pale fill. Its evidence uses adjacent source panels containing application context, filename, document version, exact marked excerpt, and locator. “Open source document” occupies a full-width panel footer. The excerpt is evidence, not generated decorative copy.

### Source dialog

The native dialog has an accessible title, a visible close control, a bounded viewport width and height, and monospaced source content. Its shadow and backdrop are the only substantial elevation. A source-access failure is displayed as written feedback.

## Do's and Don'ts

### Do:
- **Do** preserve the deep teal navigation anchor and light evidence surfaces.
- **Do** keep filenames, versions, locators, and highlights beside the source text they describe.
- **Do** pair status colors with literal text and retain visible keyboard focus.
- **Do** use tabular numerals for comparable money and revision values.
- **Do** keep mobile borrower fields legible and submission controls easy to reach.
- **Do** display fixture, connection, synthetic-data, and failure feedback honestly.

### Don't:
- **Don't** add decorative imagery or ornamental dashboard metrics to the operating workspace.
- **Don't** use a concern color or label to imply a confirmed fraud verdict.
- **Don't** add shadows to ordinary evidence panels or replace rectangular controls with pills.
- **Don't** make disabled primary actions look enabled when hovered or pressed.
- **Don't** present fixture behavior as proof of live integration.
