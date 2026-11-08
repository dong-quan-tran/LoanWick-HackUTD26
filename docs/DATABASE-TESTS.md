# Analysis/database test results

Branch: `1-analysis-database-test`. Base database source: `0bc9396`. This branch adds the analysis adapter and fixes demo seed evidence. Main and the database owner's branch remain unchanged. No schema, reducer signature, or generated SDK binding was changed.

## Verified

- SpacetimeDB CLI/server/SDK 2.14.0, Node 24.9.0.
- Database suite: 12 passing tests; analysis bridge: 9 passing tests (counts include parent tests).
- Shared suite: 95 passing tests; typechecking and fixture evaluation pass.
- Both live suites run against disposable loopback-only in-memory databases. No model or payment API is called.
- Fresh seed produces the high ownership conflict and USD 1.15 million confirmed-group finding without test-only document uploads.
- All 17 seeded documents have matching canonical source hashes; all 23 seed evidence excerpts and line locations are checked against actual source text.
- Reruns reuse finding IDs, source changes reject stale completion, and shared offices produce no concern.

## Run all live checks

Use the official portable SpacetimeDB 2.14.0 tools and Node 24. Set `LOANWICK_SPACETIME_CLI` to the full CLI executable path. The runner finds `spacetimedb-standalone` beside it; set `LOANWICK_SPACETIME_SERVER` explicitly if stored elsewhere.

```sh
npm ci
npm ci --prefix spacetimedb
npm run test:database:local
npm run check
```

`test:database:local` selects a free loopback port, creates temporary EC P-256 signing keys, starts a hidden in-memory server, runs both live suites, and stops its server on success or failure. It never changes an existing local server. Session files remain ignored under `spacetimedb/.local/`; never commit or share them. Temporary tool/key/log folders are outside the repo.

For an already-running loopback server, use `npm run test:database` with `LOANWICK_DB_URL` and the CLI path. That command publishes/seeds a fresh database and runs only the bridge suite.

Shared checks run on Windows and Linux CI. A separate Linux CI job downloads the pinned official tools and runs both live suites using the same command.

## Seed sources and regeneration

Actual synthetic sources and their manifest live in `fixtures/database/`. Original business/case/document/evidence IDs remain stable. The two exclusive forklift claims now cite explicit ownership evidence extracted from their existing ownership statements. Both confirmed group entities cite their source-backed amount and currency fields. Source text is visibly synthetic and uses LF bytes for stable hashes.

Run `npm run fixtures:database` after editing sources to regenerate `spacetimedb/src/demo-fixtures.ts`. Run `npm run fixtures:database:check` to detect stale generated output without writing. This file is seed data, not generated SDK bindings. The seed imports constants only; Node crypto/filesystem calls do not run inside the database module.

Use a fresh seeded database for the new evidence. The seed does not overwrite old applications, human reviews, or superseded documents. Offline application JSON fixtures use different IDs and remain a separate regression set.

## Adapter boundary and remaining work

The adapter uses only authenticated worker projections. It converts bigint safely, normalizes SDK timestamps/field aliases, and accepts minimal analysis applications without inventing borrower metadata. Missing ownership support still stays unknown. Confirmed relationships cite their server projection rather than invented reviewer identities/timestamps.

Legacy collateral needs an explicit asset namespace. Finding keys are hashed to stable database-sized values; oversized text/evidence is rejected rather than truncated. Structured facts stay in analysis/tool output because database findings have no structured facts column.

The worker projection has no review history, so payment/readiness state remains authoritative on the server. Upload transport is being built by its owner; the current tests exercise database authorization/attachment operations, not HTTPS byte delivery. The frontend and AI worker are still being built and are not connected here.

This branch combines unmerged database work for validation. Keep the draft PR separate until the database owner is ready.
