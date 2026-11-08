# Join the shared cloud database

Everyone uses one SpacetimeDB database: **`loanwick-hackutd26-dev`** at **`https://maincloud.spacetimedb.com`**.
You create your own identity on your own computer and send the owner only its **public ID**. Nobody sends or receives tokens.

## Teammates: one command

Install [Node.js 24](https://nodejs.org) and Git, then run:

```sh
git clone https://github.com/minhle211/LoanWick-HackUTD26.git
cd LoanWick-HackUTD26
npm run join:cloud -- --name <your-first-name> --roles <roles>
```

| Who | `--roles` |
| --- | --- |
| Frontend (Jason) | `officer,reviewer,borrower` |
| NVIDIA worker (Minh) | `worker` |
| Everyone else | `officer,reviewer` |

The command installs the database client, creates one identity per role, saves each token in
`~/.loanwick/loanwick-hackutd26-dev/<name>/` (outside the repository, never printed), and prints lines like:

```
LOANWICK-JOIN db=loanwick-hackutd26-dev name=jason role=officer user=officer-jason id=c200…
```

**Send those lines to the owner.** They contain no secrets. Never send anything from the `.loanwick` folder.

When the owner confirms, **run the same command again.** It shows each role as `ASSIGNED` and what you can see:
staff roles see the eight synthetic cases, borrowers see only their own applications, workers see only queued jobs, and
private tables are blocked for everyone.

On Windows, if PowerShell blocks `npm`, use `npm.cmd` instead.

### Then use it

- **Web app (officer / reviewer / borrower):** the join command already wrote `apps/web/.env.live` with the cloud address.
  Run `npm ci`, then `npm run dev:web:live`, open http://127.0.0.1:5174, and copy a role's token to the clipboard with
  `npm run join:cloud -- --name <name> --roles <roles> --copy-token officer`. Paste it into **Individual session token**.
- **NVIDIA worker:** after `ASSIGNED`, the command prints the three settings the worker needs:
  `LOANWICK_DB_URI`, `LOANWICK_DB_NAME`, and `LOANWICK_WORKER_TOKEN_FILE` (a path, never the token itself). The job
  contract is in [spacetimedb/DEPLOYMENT.md](../spacetimedb/DEPLOYMENT.md#nemotron-worker-person-3).

| You see | Meaning |
| --- | --- |
| `waiting for the owner to assign this role` | Send the LOANWICK-JOIN lines, or the owner has not applied them yet. |
| `MISMATCH` | That identity was registered with a different role. Tell the owner. |
| Borrower: `own cases: none yet` | Expected. Seeded cases belong to the demo borrowers; an officer can create an application for your user ID. |
| Lost or leaked token | Delete that `.token` file, rerun the command (it creates a new identity), and ask the owner to deactivate the old one. |

## Owner: one command

Paste everyone's messages into one text file (extra chat text is fine), then preview the identity-to-role mapping:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File spacetimedb\qa\grant-requests.ps1 -RequestFile requests.txt
```

Invalid, duplicate, or reserved entries are marked `REJECTED`, and a file containing anything token-shaped is refused.
When the mapping is right, add `-Apply`. It registers each valid request with your own CLI login (never shared) and
then lists the registered users. Revoke one person with `spacetimedb\qa\assign-role.ps1 ... -Deactivate`.
