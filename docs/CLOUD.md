# Shared cloud database and GitHub workflow

Everyone works from GitHub `main` and one shared SpacetimeDB Maincloud database. Local databases are for automated tests only.

## The shared database

| Item | Value |
| --- | --- |
| Endpoint | `https://maincloud.spacetimedb.com` |
| Database | `loanwick-hackutd26-dev` |
| Database identity | `c2008a3b59563e96de0dab889d18d98d061bc3a9958c4a38168d91a5e2b79df5` |
| Deployed backend | `09288ebcad82fbb5c8fb867281794082ed924131` (published 2026-11-08) |
| Seeded data | `demo-org`, synthetic `demo-case-1` … `demo-case-8` |
| Owner | the repository owner's SpacetimeDB account (sole admin; the only person who can publish or grant roles) |

### Deployed version vs `main`

`main` at `d99a7cb` has the **same schema, reducers, views, and generated bindings** as the deployed `09288eb`. Clients built from
`main` are fully compatible. The only backend difference is the demo seed (`spacetimedb/src/admin.ts`, `demo-fixtures.ts`):
the cloud copy predates the source-backed ownership evidence (`demo-ownership-evidence-1/2`) and the Cedar group
amount/currency evidence. A republish cannot add that to existing cases, so the judge-demo dataset needs an approved fresh
database (see [spacetimedb/DEPLOYMENT.md](../spacetimedb/DEPLOYMENT.md)). The `Backend QA` workflow reports schema drift
between a pull request and the deployed database on every PR.

## Getting the code

```sh
git clone https://github.com/minhle211/LoanWick-HackUTD26.git
cd LoanWick-HackUTD26
npm ci
npm ci --prefix spacetimedb
```

Work on a branch named `<issue#>-<slug>` and open a pull request into `main` (see [AGENTS.md](../AGENTS.md)). CI must pass before merge.

## Generated bindings

`spacetimedb/bindings/` is generated from `spacetimedb/src/` and `apps/web/src/generated/` must be an identical copy.
Never hand-edit either. After any change to the module interface:

```sh
spacetime generate --lang typescript --module-path spacetimedb --out-dir spacetimedb/bindings --yes
rm -rf apps/web/src/generated && cp -r spacetimedb/bindings apps/web/src/generated
```

The `Backend QA` workflow fails a pull request when either copy is stale.

## Your identity (one-time, per role)

Use the one-command flow in [ONBOARDING.md](ONBOARDING.md):
`npm run join:cloud -- --name <name> --roles <roles>` creates one identity per role, keeps the tokens in
`~/.loanwick/loanwick-hackutd26-dev/<name>/`, and prints `LOANWICK-JOIN` lines with public identities to send the owner.
Rerunning it reports each role's access. The owner previews and applies requests with `spacetimedb/qa/grant-requests.ps1`.
Never share tokens, and never ask for the owner's login.

Under the hood it uses `spacetimedb/qa/whoami.ts` (create or reuse an identity) and `spacetimedb/qa/access-check.ts`
(role, visible data, private tables blocked). One identity holds exactly one role. The seeded borrower cases belong to the demo users `borrower-a` and `borrower-b`; to test
as a borrower with your own identity, have an officer create a new application for your borrower user ID.

### Owner: granting a role without sharing credentials

The owner runs this with their own CLI login (Windows PowerShell). Batch: paste every teammate's messages into a file and run
`spacetimedb\qa\grant-requests.ps1 -RequestFile requests.txt` (preview), then add `-Apply`. Single identity:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\assign-role.ps1 -Identity <64-hex> -UserId officer-jason -Role officer -DisplayName "Jason (officer)"
```

Both validate input, refuse anything that looks like a token, and call `assign_demo_user` on the shared database.
Add `-Deactivate` to `assign-role.ps1` to revoke. Git Bash equivalent:
`spacetime call --server maincloud loanwick-hackutd26-dev assign_demo_user '"0x<hex>"' '"officer-jason"' '"demo-org"' '"officer"' '"Jason"' true`.

## Frontend configuration

```sh
npm run join:cloud -- --name <name> --roles officer   # writes apps/web/.env.live (or: cp apps/web/.env.example apps/web/.env.live)
npm run dev:web:live                                  # http://127.0.0.1:5174
```

Paste one role token into the connection form at runtime. Never put a token in any `VITE_*` variable or `.env` file; Vite
embeds `VITE_*` values into the bundle. `.env.*` files are git-ignored.

## Worker configuration (pending integration)

The NVIDIA worker (`apps/worker`) does not yet contain a SpacetimeDB client. When it is added it should use:

| Variable | Value |
| --- | --- |
| `LOANWICK_DB_URI` | `https://maincloud.spacetimedb.com` |
| `LOANWICK_DB_NAME` | `loanwick-hackutd26-dev` |
| `LOANWICK_WORKER_TOKEN_FILE` | path to the worker identity's token file outside the repository |

and follow the worker contract in [spacetimedb/DEPLOYMENT.md](../spacetimedb/DEPLOYMENT.md#nemotron-worker-person-3):
subscribe, claim, renew, record tool events, complete, then wait for `worker_job_outcomes`.

## Publishing a new backend version

Publishing is manual and owner-only. Nothing in CI publishes to Maincloud.

1. A pull request touching `spacetimedb/` passes `Backend QA` (typecheck, bindings drift, integration and QA suites) and is merged.
2. The owner approves a specific merged commit SHA and checks the `Backend QA` drift report:
   - *no schema change*: republish to `loanwick-hackutd26-dev` (hot swap, data kept);
   - *schema change*: publish to a new database name, bootstrap it, and update this document and `apps/web/.env.example`.
3. The owner follows [spacetimedb/DEPLOYMENT.md](../spacetimedb/DEPLOYMENT.md#deploying-a-new-version) and updates the
   **Deployed backend** row above in the same pull request as any client configuration change.

## Security rules

- Tokens are bearer credentials. Keep them in `~/.loanwick/`; never commit, paste in chat, log, or put them in URLs.
- Only the owner's CLI login can publish or assign roles. It is never shared, copied, or stored in CI.
- All data is synthetic. Never load real borrower or payment data.
