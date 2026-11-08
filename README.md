# LoanWick

LoanWick is a hackathon prototype for evidence-backed commercial-loan investigation and human clarification. All included applications and documents are synthetic. No money moves.

This branch implements Person 4's shared foundation: TypeScript contracts/runtime schemas, pure deterministic checks, eight application fixtures, source-backed evidence, sample frontend projections, regression tests, and a fixture evaluator. The database, web app, live model worker, and their integration are separate teammates' work and are not implemented or verified here.

## Local setup

Use Node.js 22.12+ (validated locally on 24.9.0) and npm. From the repository root:

```sh
npm ci
npm run check
```

PowerShell users can use `npm.cmd` if local execution policy blocks npm.ps1.

| Command | Behavior |
| --- | --- |
| npm run build | Build shared contracts and pure analysis to package-local dist/ |
| npm run typecheck | Build packages and type-check tests/configuration |
| npm test | Build and run Vitest regression/fixture checks |
| npm run evaluate | Compare deterministic outputs with independent expected fixtures and verify source hashes/excerpts |
| npm run fixtures:views | Regenerate explicitly synthetic staff/borrower view samples |
| npm run check | Typecheck, tests, and evaluation |

Run build before importing the packages from Node. Package dist files are generated and ignored; do not edit or commit them. Dependency versions are pinned in package-lock.json. No credentials or SpacetimeDB installation are required for these shared checks.

## Shared package entry points

```ts
import { InvestigationSnapshotSchema, validateCheckResults } from '@loanwick/contracts';
import { checkCollateralConflicts, checkGroupThreshold } from '@loanwick/analysis';

const snapshot = InvestigationSnapshotSchema.parse(untrustedInput);
const results = validateCheckResults(snapshot, [
  ...checkCollateralConflicts(snapshot),
  ...checkGroupThreshold(snapshot),
]);
```

Use `@loanwick/contracts/domain` for SDK-independent types/constants without loading Zod. The analysis package uses that entry point and contains no Node, network, model, database, or clock access. Validate untrusted input at the worker/API boundary. Person 2 must separately prove compatibility with the actual SpacetimeDB runtime before importing shared helpers into its server module.

## Handoff and current status

- [Shared contracts and integration decisions](docs/CONTRACTS.md)
- [Person-specific implementation handoff](docs/INTEGRATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Evaluation scope and results](docs/EVALUATION.md)
- [Demo sequence and outstanding integrations](docs/DEMO.md)
- [Limitations](docs/LIMITATIONS.md)
- [Original four-person assignments](docs/team-plans/00-START-HERE.md)

No web/worker/database startup commands are advertised until their owners implement and verify them. Database identity bootstrap, private file storage, and NVIDIA secrets belong to those components; do not put worker secrets into VITE_* variables. Fixture identities are labels only and do not grant a real role.
