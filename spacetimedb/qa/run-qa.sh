#!/usr/bin/env bash
# Independent QA for ONE exact commit. Usage: bash spacetimedb/qa/run-qa.sh <commit-sha> [v2|v1]
# - Exports the commit with `git archive` (never the working tree) into $QA_OUT (default: a temp folder).
# - Publishes only to NEW databases on a LOOPBACK SpacetimeDB 2.14.0 server ($LOANWICK_DB_URL, default http://127.0.0.1:4310).
#   Start one with: spacetime start --listen-addr 127.0.0.1:4310 --in-memory --non-interactive
# - Mints a throwaway owner identity per run; tokens stay inside the run folder and are never printed.
# - F4 policy: v2 (default) = current successful investigation + cross-case ownership hold; v1 = legacy.
# Env: LOANWICK_SPACETIME_CLI (default: spacetime), LOANWICK_DB_URL, QA_OUT.
set -uo pipefail
SHA_IN="${1:?usage: run-qa.sh <commit-sha> [v2|v1]}"
F4_POLICY="${2:-v2}"
CLI="${LOANWICK_SPACETIME_CLI:-spacetime}"
ENDPOINT="${LOANWICK_DB_URL:-http://127.0.0.1:4310}"
case "$ENDPOINT" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "ABORT: LOANWICK_DB_URL must be a loopback http URL"; exit 2 ;; esac
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(git -C "$QA_DIR" rev-parse --show-toplevel)"
SHA="$(git -C "$REPO" rev-parse --verify "$SHA_IN^{commit}")" || { echo "ABORT: unknown commit $SHA_IN"; exit 2; }
SHORT="${SHA:0:7}"
OUT="${QA_OUT:-$(mktemp -d)}/qa-$SHORT-$(date +%H%M%S)"; LOG="$OUT/logs"; mkdir -p "$LOG"
echo "QA commit: $SHA"
git -C "$REPO" ls-remote origin 2>/dev/null | grep -q "^$SHA" && echo "Pushed: yes" || echo "Pushed: NO (local-only commit)"

git -C "$REPO" archive "$SHA" spacetimedb | tar -x -C "$OUT"
MOD="$OUT/spacetimedb"; cd "$MOD"
npm ci --no-audit --no-fund > "$LOG/npm-ci.log" 2>&1 || { echo "FAIL: npm ci (see $LOG/npm-ci.log)"; exit 1; }

declare -A RESULT
npm run -s typecheck > "$LOG/typecheck.log" 2>&1 && RESULT[typecheck]=PASS || RESULT[typecheck]=FAIL
mkdir -p "$OUT/regen"
"$CLI" generate --lang typescript --module-path . --out-dir "$OUT/regen" --yes > "$LOG/generate.log" 2>&1
if diff -r --strip-trailing-cr bindings "$OUT/regen" > "$LOG/bindings.diff" 2>&1; then RESULT[bindings]="PASS (regenerated == committed)"
else RESULT[bindings]="FAIL (see bindings.diff)"; fi
if [ -f scripts/local.ts ]; then
  LOANWICK_SPACETIME_CLI="$CLI" LOANWICK_DB_URL="$ENDPOINT" npm run -s test:local > "$LOG/codex-test-local.log" 2>&1
  RESULT[integration]="$(grep -E 'ℹ (pass|fail)' "$LOG/codex-test-local.log" | tr '\n' ' ')"
fi

# QA suites come from the checkout running this script, so they can be applied to older or newer commits.
mkdir -p qa && cp "$QA_DIR"/qa-harness.ts "$QA_DIR"/qa-repro.test.ts "$QA_DIR"/qa-regression.test.ts "$QA_DIR"/qa-b2.test.ts qa/
ROOT="$OUT/owner-root"; mkdir -p "$ROOT"
OWNER_JSON="$(curl -s -X POST "$ENDPOINT/v1/identity")"
export LOANWICK_ADMIN_TOKEN="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).token)' "$OWNER_JSON")"
unset OWNER_JSON
"$CLI" --root-dir "$ROOT" login --token "$LOANWICK_ADMIN_TOKEN" > /dev/null 2>&1
export LOANWICK_DB_URL="$ENDPOINT" QA_F4_POLICY="$F4_POLICY"
for suite in repro regression b2; do
  DB="qa-$suite-$SHORT-$(date +%H%M%S)"
  "$CLI" --root-dir "$ROOT" publish "$DB" --server "$ENDPOINT" --module-path . --yes=skip-login > "$LOG/publish-$suite.log" 2>&1 \
    || { RESULT[$suite]="FAIL: publish"; continue; }
  LOANWICK_DB_NAME="$DB" npx tsx --test "qa/qa-$suite.test.ts" > "$LOG/qa-$suite.log" 2>&1
  RESULT[$suite]="$(grep -E 'ℹ (pass|fail)' "$LOG/qa-$suite.log" | tr '\n' ' ') db=$DB"
done
unset LOANWICK_ADMIN_TOKEN

echo; echo "===== QA SUMMARY $SHORT (F4 policy: $F4_POLICY) ====="
for k in typecheck bindings integration repro regression b2; do printf '%-12s %s\n' "$k" "${RESULT[$k]:-n/a}"; done
echo "--- QA test results"; grep -hE '^\s*(✔|✖) (F[0-9]|R[0-9]|B2-)' "$LOG"/qa-*.log
echo "--- Observations"; grep -h '^OBS' "$LOG"/qa-*.log
echo "Logs: $LOG"
