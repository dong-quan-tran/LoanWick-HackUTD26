# Analysis/database test results

Branch: `1-analysis-database-test`. Database source tested: `0bc9396` from `1-loanwick-database`. Main and the database owner's branch were not changed. No generated binding or database source file was edited.

## Verified locally

- SpacetimeDB CLI/server/SDK 2.14.0, Node 24.9.0.
- Existing database suite: 12 passing tests (including its parent test).
- New analysis bridge suite: 8 passing tests (including its parent test).
- Shared regression suite: 92 passing tests; typechecking and fixture evaluation pass.
- All work used a loopback-only in-memory database with synthetic data. No model or payment API was called.

The bridge tests read an authenticated worker snapshot, run the actual shared functions, submit findings through the real reducer, and wait for the worker terminal outcome. They verify:

1. SDK bigint/time/field conversion without fabricated borrower metadata.
2. Missing ownership support stays unknown.
3. Explicit evidence yields a persisted high collateral conflict.
4. Reruns refresh the same finding ID.
5. A related-case edit makes completion fail with STALE_RESULTS, even though the reducer call resolves.
6. Missing quantitative group evidence fails explicitly; authorized evidence then enables the actual USD 1.15 million group finding.
7. Shared office addresses produce no finding.

## Run again

Install the official SpacetimeDB CLI and server 2.14.0. Start a disposable local server at `http://127.0.0.1:4310`. Then, from this branch's root:

```sh
npm ci
npm ci --prefix spacetimedb
npm --prefix spacetimedb run test:local
npm run test:database
npm run check
```

Set `LOANWICK_SPACETIME_CLI` to the CLI executable when outside PATH. Set `LOANWICK_DB_URL` only to another loopback HTTP origin. `test:database` typechecks its bridge, publishes/seeds a fresh database through the existing local demo tool, and runs the real bridge suite. Session files remain ignored under `spacetimedb/.local/`; never commit or share them.

For the portable Windows tools, the standalone server requires an EC P-256 signing key pair passed through `--jwt-priv-key-path` and `--jwt-pub-key-path`. We used temporary keys outside the repo, a hidden server, `--in-memory`, and a 256 MiB page pool. The server is stopped after validation.

## Integration changes

`packages/database-adapter` maps only the authenticated worker view. It does not read staff-only data to fill gaps. `AnalysisSnapshot` accepts the minimal application fields actually exposed to a worker; the original full `InvestigationSnapshot` remains compatible. Confirmed relationships identify the authorized server projection as their source instead of inventing reviewer identities/timestamps.

The adapter maps extracted -> succeeded, equipment_identifier -> identifier, SDK optional fields -> nullable fields, and bigint -> checked safe integer cents. Legacy database collateral uses an explicit caller-selected asset namespace because assetType is not stored yet. It preserves the actual cited evidence IDs. SHA-256 maps long logical finding keys to stable database-sized keys; text/evidence limits fail rather than silently truncate.

The worker view has no review history, so the adapter does not claim to check payment verification. Use authoritative server readiness/payment checks for that state. Structured finding facts are currently kept in analysis/tool output; the database finding row stores their evidence-backed explanation but has no structured facts column.

## Remaining seed differences

The database seed has ownership text/flags but no explicit ownership field linked to each collateral claim. Its confirmed group also lacks field-level amount/currency evidence. Our checks therefore return unknown or a missing-evidence error on those unmodified inputs. The bridge adds properly scoped documents through existing authorized reducers before testing positive outcomes; it never fabricates extracted fields.

Person 2 and Person 3 should align seed/extraction evidence with this format before the final demo. Existing seed IDs differ from the offline JSON fixtures; the bridge intentionally uses database seed IDs rather than claiming they are identical.

Full frontend and live model integration are still pending. This test branch includes the unmerged database work solely for validation; do not merge it into main before the database owner is ready.
