# Connect to the shared cloud database (10 minutes)

Everyone on the team uses the same SpacetimeDB database: **`loanwick-hackutd26-dev`** at **`https://maincloud.spacetimedb.com`**.
You create your own login identity, send the owner its **public ID**, and the owner gives it a role. You never send or
receive a token.

## 1. Get the code

Install Node.js 24 and Git, then:

```sh
git clone https://github.com/minhle211/LoanWick-HackUTD26.git
cd LoanWick-HackUTD26
npm ci
npm ci --prefix spacetimedb
```

On Windows PowerShell, if `npm` or `npx` is blocked by execution policy, use `npm.cmd` / `npx.cmd` instead.

## 2. Make a private folder for your token

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.loanwick"
```

macOS / Linux / Git Bash:

```sh
mkdir -p "$HOME/.loanwick"
```

This folder is outside the repository. Never copy its files into the repo, chat, or email.

## 3. Create your identity

Run this from the repository folder. Use one file name per role you need (for example `officer.token`, `reviewer.token`,
`borrower.token`, `worker.token`):

```sh
npx --prefix spacetimedb tsx spacetimedb/qa/whoami.ts https://maincloud.spacetimedb.com loanwick-hackutd26-dev $HOME/.loanwick/officer.token
```

It prints one line like:

```
{"identity":"c200a1b2...64 characters...","tokenSaved":true,"myUser":null}
```

`myUser: null` is expected: you have no role yet. Your token was saved to the file and is **not** shown.

## 4. Send the owner your public identity

Copy only the `identity` value and send a message like:

```
Name: Jason
Role: officer
User ID: officer-jason
Identity: c200a1b2...(the 64-character identity)
```

- Roles: `officer`, `reviewer`, `borrower`, `worker`. One identity = one role; repeat step 3 for each role you need.
- User ID: lowercase letters, digits, and dashes, unique on the team (for example `reviewer-jason`, `worker-minh`).
- **Never send the `.token` file or its contents.** The identity is public; the token is your password.

## 5. Confirm your role

After the owner says it is done, run the same command from step 3 again. It now prints your role:

```
{"identity":"c200a1b2...","tokenSaved":false,"myUser":{"id":"officer-jason","organizationId":"demo-org","role":"officer",...}}
```

## 6. Use it

**Frontend (web app)**

```sh
cp apps/web/.env.example apps/web/.env.live     # PowerShell: Copy-Item apps\web\.env.example apps\web\.env.live
npm run dev:web:live                            # open http://127.0.0.1:5174
```

The endpoint and database are pre-filled. For the token field, copy your token to the clipboard without printing it:

```powershell
Get-Content "$HOME\.loanwick\officer.token" -Raw | Set-Clipboard
```

(macOS: `pbcopy < ~/.loanwick/officer.token`.) Paste it into **Individual session token** and connect. Staff see the eight
synthetic cases `demo-case-1` … `demo-case-8`.

**NVIDIA worker**

Use a `worker` identity. The worker reads its token from a file path, never from the repository or a `VITE_*` variable:
`LOANWICK_DB_URI=https://maincloud.spacetimedb.com`, `LOANWICK_DB_NAME=loanwick-hackutd26-dev`,
`LOANWICK_WORKER_TOKEN_FILE=$HOME/.loanwick/worker.token`. The job contract is in
[spacetimedb/DEPLOYMENT.md](../spacetimedb/DEPLOYMENT.md#nemotron-worker-person-3).

## Troubleshooting

| Message | Meaning |
| --- | --- |
| `myUser: null` / "This identity has no permitted application role" | The owner has not assigned this identity yet, or you used a different token file. |
| `ENOENT` when saving the token | Step 2 was skipped; create the `.loanwick` folder. |
| Borrower sees no cases | Seeded cases belong to the demo borrowers. Ask an officer to create an application for your borrower user ID. |
| Lost or leaked token | Create a new identity (new file name) and ask the owner to deactivate the old one. |

## For the owner

Grant each request with your own CLI login (never share it):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\assign-role.ps1 -Identity <identity> -UserId officer-jason -Role officer -DisplayName "Jason (officer)"
```

Revoke with the same command plus `-Deactivate`. More detail: [docs/CLOUD.md](CLOUD.md).
