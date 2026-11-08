# LoanWick

LoanWick is a hackathon prototype for evidence-backed commercial-loan investigation and human clarification. All included applications and documents are synthetic. No money moves.

This branch includes Person 4's shared foundation and Person 1's frontend: TypeScript contracts/runtime schemas, deterministic checks, eight canonical applications, source-backed evidence, and a complete synthetic officer/borrower/reviewer demo. The live adapter has also passed a browser workflow against a disposable real database with separate authorized role sessions and Person 4's deterministic test bridge. Connected NVIDIA investigation, document intake, and original-source downloads remain pending.

## Frontend

Run `npm ci`, then `npm run dev:web`, and open http://127.0.0.1:5173. The officer opens a simplified PDF/DOCX contract-upload screen with pipeline progress messages. Try the clearly labeled sample to run actual deterministic fixture checks. PDF/DOCX server intake remains unavailable until a compatible worker is connected; selected files are not silently treated as verified. The officer workflow stays on one page with a compact menu, brown/gold styling, generated contract artwork, and plain-language updates. Older case/borrower/reviewer routes remain compatible without adding navigation tabs to the primary flow. Read the [frontend handoff](docs/FRONTEND.md) for the exact sequence, test commands, live connection setup, and remaining integration gates.

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

The frontend startup commands are documented above. Worker/database startup remains owned by those components. Database identity bootstrap, private file storage, and model-provider secrets belong to those components; do not put worker secrets into VITE_* variables. Fixture identities are labels only and do not grant a real role.

Shared checks run on pull requests and main pushes using Node 24 on Windows and Linux. Source JSON uses LF line endings so document hashes stay stable across platforms. CI covers these shared packages, not the unfinished database/browser/model integration.
