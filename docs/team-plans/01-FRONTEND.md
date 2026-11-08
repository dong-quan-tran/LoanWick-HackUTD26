# Person 1: Frontend and user workflow

## Your outcome

Build the React interface for an officer, a borrower, and a reviewer to complete the commercial-loan investigation demo. A user must be able to see the exact evidence behind a concern, exchange clarification, and understand why simulated release is blocked or allowed.

Read 00-START-HERE.md for contracts and permissions. The repository is initially unscaffolded; this is an implementation plan, not a description of existing screens.

## Ownership

- Own apps/web/, its frontend adapters, components, routes, styles, and UI/browser tests.
- Coordinate package additions and root tooling with Person 4.
- Receive generated database bindings from Person 2. Never manually edit generated bindings.
- Do not implement business policy solely in the browser, call NVIDIA from the browser, or import worker internals.

Suggested structure:

```text
apps/web/src/
  app/                 routes, identity/session, layout
  components/          shared tables, status labels, dialogs
  features/portfolio/
  features/case-workspace/
  features/borrower/
  features/review/
  lib/spacetime/       connection and domain adapter
  lib/formatting/
  generated/          Person 2's generated output
```

## Dependencies and parallel start

Need from Person 4: validated sample CaseView/BorrowerCaseView, enums, stable fixture IDs, money/time helpers, operation errors.

Need from Person 2: connection instructions, identity setup, generated bindings, safe projections, operation results, readiness reasons, and subscription lifecycle examples for the pinned SDK.

Need from Person 3: real tool-event payloads, live/fixture metadata, supported upload transport and extraction errors.

Start with an explicitly selected development fixture adapter implementing the same interface as the real adapter. Keep fixture objects out of components. Switch the core workflow to real subscriptions at checkpoint A. A real connection failure must display an error, never silently activate fixtures.

## Step 1: Foundation and adapter

1. Coordinate React/Vite/TypeScript setup with Person 4 and use one styling approach.
2. Build a layout showing connection state, authenticated role, synthetic-data notice, and live/fixture execution label.
3. Add routes for portfolio, staff case workspace, and borrower case.
4. Implement adapter methods for case subscriptions and authorized actions listed in the shared contract.
5. Normalize SDK IDs in this adapter. Unsubscribe on route/session changes and clear sensitive cached data on logout.
6. Implement pending, disconnected, empty, forbidden, failed, and retry states before polishing.
7. Use seeded identities from Person 2; selecting a visual role must never grant a server role.

Deliverable: a case renders from the shared type through the fixture adapter, then the same case renders through a real authorized database subscription.

## Step 2: Portfolio and case evidence

Portfolio columns: business, requested amount/currency, application stage, open finding count, last investigation state. Add simple stage/status filters and row navigation.

Case header: business, amount, stage, investigation action, and server readiness summary.

Case sections, in priority order:

1. Findings with severity, state, explanation, uncertainty, and suggested next step.
2. Evidence viewer showing original excerpt, filename, version, and actual page/row/field locator.
3. Application/collateral summary.
4. Related-case table showing the exact supported relationship reason to authorized staff.
5. Tool activity showing actual tool names, safe results, duration, and run status.
6. Clarification history, required checks, and audit timeline.

Clicking evidence must open the correct stored source/version. Use side-by-side excerpts for the duplicate-equipment scenario. Do not add invented confidence percentages, fabricated tool activity, or a graph before the core flow works.

Deliverable: officer clicks Investigate, sees a real job progress, and opens both evidence excerpts behind the equipment conflict.

## Step 3: Clarification round trip

Officer flow:

1. Open a finding and its draft clarification.
2. Edit the borrower-safe message and requested document type.
3. Preview exactly what the borrower will receive.
4. Send through the officer-authorized operation and show confirmed sent state.
5. Show borrower response and uploaded document extraction state.
6. Resolve/escalate/reopen with required rationale; reflect server-confirmed state.

Borrower flow:

1. Load only the server's borrower projection for the authenticated borrower.
2. Show own application and sent requests; do not load internal data then hide it with CSS.
3. Submit a message and, when supported, a JSON/CSV response document.
4. Show uploading, extraction pending, unsupported file, failed, and submitted states.
5. Acknowledge receipt without claiming the finding is automatically resolved.

Document byte upload belongs to Person 3's authenticated transport. Person 2 must authorize document attachment and request ownership. If uploads are not ready, integrate an explicitly labeled synthetic-document selection flow agreed with the team; do not imply a real upload occurred.

Deliverable: separate officer and borrower sessions complete one request/response, then the officer records a reasoned resolution.

## Step 4: Review and simulated release

1. Render server-required checks with current and reviewed revisions.
2. Reviewer can record a check with rationale and actual evidence references.
3. Display a synthetic payment-instruction change action for the authorized reviewer.
4. After payment changes, update the stale check and blocking reasons from server state.
5. Disable release when readiness forbids it, but still handle server rejection if conditions change between rendering and click.
6. Send an idempotency key per release attempt; reuse it on retry after uncertain network results.
7. Show the immutable release ID and: SIMULATED RELEASE - NO MONEY MOVED.
8. Prevent double submission while pending and display an existing release after reload.

Deliverable: changing payment details visibly makes payment verification stale, release fails server-side, and fresh verification permits one simulated release.

## Step 5: Validation and polish

Own meaningful browser coverage for:

- Case navigation -> investigation -> stored finding -> matching evidence source.
- Officer sends request -> borrower responds -> officer resolves with rationale.
- Payment update -> stale review -> blocked release -> reverify -> one release.
- Borrower UI receives only its permitted projection and handles forbidden routes. Person 2 separately proves actual server access control.
- Connection/model/extraction failures remain visible; no fake success or indefinite spinner.

Use labels in addition to color, keyboard-operable controls, readable contrast, and clear mutation feedback. Person 4 coordinates which browser cases become the shared end-to-end suite so tests are not duplicated.

## Acceptance checklist

- [ ] Portfolio and case use real authorized data at checkpoint A.
- [ ] Evidence excerpts and document versions match stored records.
- [ ] Real job/tool activity and execution mode are visible.
- [ ] Borrower sees only own safe data and can answer an open request.
- [ ] Human finding decisions require rationale.
- [ ] Required checks, stale revisions, and release blocking reasons come from server state.
- [ ] Double clicks/retries do not create duplicate simulated releases.
- [ ] Loading, errors, disconnection, and unsupported uploads are covered.
- [ ] No worker secrets or private storage paths reach the browser.
- [ ] Setup instructions and actual browser test results are handed off.

## Send back at each checkpoint

Changed paths; routes available; adapter methods implemented/missing; exact startup and test commands; test results; screenshots if useful; required backend/worker changes; next integration step.
