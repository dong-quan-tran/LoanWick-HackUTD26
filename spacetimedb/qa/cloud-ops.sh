#!/usr/bin/env bash
# Owner-run bootstrap and verification for a deployed LoanWick database.
# Usage: bash spacetimedb/qa/cloud-ops.sh <db-name> <step>...
#   mint      one identity per role, created by connecting WITHOUT a token. Tokens are saved as <role>.token in
#             $SESSIONS_DIR (default ~/.loanwick/<db-name>, outside the repo) and never printed; identities.json
#             holds only PUBLIC identities.
#   ps1       write bootstrap-roles.ps1 / retire-qa.ps1 (public identities only) for Windows PowerShell owners.
#   assign    OWNER ONLY: `spacetime call assign_demo_user` for every role (uses the CLI's own login).
#   seed      OWNER ONLY: `spacetime call seed_demo` for demo-org.
#   verify    each role reconnects with its own token and prints my_user.
#   smoke     qa/qa-cloud.test.ts: read-only on demo-org, writes only to the isolated qa-cloud org.
#   retire-qa OWNER ONLY: deactivate the qa-cloud identities.
# Never publishes, never deletes, never uses --delete-data.
# Env: LOANWICK_SPACETIME_CLI (default spacetime), LOANWICK_SERVER (default maincloud),
#      LOANWICK_ENDPOINT (default https://maincloud.spacetimedb.com), SESSIONS_DIR.
set -euo pipefail
DB="${1:?db name}"; shift
CLI="${LOANWICK_SPACETIME_CLI:-spacetime}"
SERVER="${LOANWICK_SERVER:-maincloud}"
ENDPOINT="${LOANWICK_ENDPOINT:-https://maincloud.spacetimedb.com}"
MOD="$(cd "$(dirname "$0")/.." && pwd)"
SESSIONS_DIR="${SESSIONS_DIR:-$HOME/.loanwick/$DB}"
mkdir -p "$SESSIONS_DIR"
ROLES=(officer:demo-org:officer reviewer:demo-org:reviewer worker:demo-org:worker borrower-a:demo-org:borrower borrower-b:demo-org:borrower
  qa-officer:qa-cloud:officer qa-reviewer:qa-cloud:reviewer qa-worker:qa-cloud:worker qa-borrower:qa-cloud:borrower)
call() { "$CLI" call --server "$SERVER" "$DB" "$@" 2>&1 | grep -vE "UNSTABLE|^$" || true; }
hex() { node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]])' "$SESSIONS_DIR/identities.json" "$1"; }
whoami() { (cd "$MOD" && npx tsx qa/whoami.ts "$ENDPOINT" "$DB" "$SESSIONS_DIR/$1.token" 2>&1 | tail -1); }
assign_all() { # $1 = filter (all|qa), $2 = active
  for r in "${ROLES[@]}"; do IFS=: read -r id org role <<< "$r"
    [ "$1" = qa ] && [[ "$id" != qa-* ]] && continue
    echo "assign $id ($role@$org active=$2)"; call assign_demo_user "\"0x$(hex "$id")\"" "\"$id\"" "\"$org\"" "\"$role\"" "\"$id\"" "$2"; done; }

for step in "$@"; do
  echo "== $step ($SERVER/$DB)"
  case "$step" in
    mint)
      [ -f "$SESSIONS_DIR/identities.json" ] || echo '{}' > "$SESSIONS_DIR/identities.json"
      for r in "${ROLES[@]}"; do id="${r%%:*}"; line="$(whoami "$id")"
        node -e 'const fs=require("fs");const [p,r,l]=process.argv.slice(1);const d=JSON.parse(fs.readFileSync(p,"utf8"));d[r]=JSON.parse(l).identity;fs.writeFileSync(p,JSON.stringify(d,null,1));console.log(r,d[r])' \
          "$SESSIONS_DIR/identities.json" "$id" "$line"; done ;;
    ps1)
      node - "$SESSIONS_DIR" "$CLI" "$DB" "$SERVER" "${ROLES[@]}" <<'EOF'
const fs = require('fs'), path = require('path')
const [dir, cli, db, server, ...roles] = process.argv.slice(2)
const ids = JSON.parse(fs.readFileSync(path.join(dir, 'identities.json'), 'utf8'))
const q = s => `"\\"${s}\\""`
const call = (...a) => `& '${cli}' --% call --server ${server} ${db} ${a.join(' ')}`
const out = (active, onlyQa) => ['# Owner bootstrap. PUBLIC identities only; no credentials. Never uses --delete-data.',
  ...roles.map(r => r.split(':')).filter(([id]) => !onlyQa || id.startsWith('qa-')).flatMap(([id, org, role]) => [
    `Write-Output 'assign ${id} (${role}@${org} active=${active})'`,
    call('assign_demo_user', q('0x' + ids[id]), q(id), q(org), q(role), q(id), String(active)), 'Write-Output "  exit $LASTEXITCODE"']),
  ...(onlyQa ? [] : ["Write-Output 'seed_demo demo-org'", call('seed_demo', q('demo-org'), q('borrower-a'), q('borrower-b')), 'Write-Output "  exit $LASTEXITCODE"']),
].join('\r\n') + '\r\n'
fs.writeFileSync(path.join(dir, 'bootstrap-roles.ps1'), out(true, false))
fs.writeFileSync(path.join(dir, 'retire-qa.ps1'), out(false, true))
console.log('wrote', path.join(dir, 'bootstrap-roles.ps1'), 'and retire-qa.ps1')
EOF
      ;;
    assign) assign_all all true ;;
    seed) call seed_demo '"demo-org"' '"borrower-a"' '"borrower-b"' ;;
    verify) for r in "${ROLES[@]}"; do whoami "${r%%:*}" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(s).myUser)))'; done ;;
    smoke) (cd "$MOD" && LOANWICK_DB_URL="$ENDPOINT" LOANWICK_DB_NAME="$DB" LOANWICK_SESSIONS_DIR="$SESSIONS_DIR" npx tsx --test qa/qa-cloud.test.ts 2>&1 \
             | grep -E "✔|✖|ℹ (pass|fail)|^OBS|Error") ;;
    retire-qa) assign_all qa false ;;
    *) echo "unknown step $step"; exit 2 ;;
  esac
done
echo "Sessions (tokens; keep private, never commit): $SESSIONS_DIR"
