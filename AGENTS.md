# Signal log

Agents share one pinned GitHub issue. `tools/signal.py` reads and writes it. `gh` must already be logged in. Set `SIGNAL_ISSUE` when the log is not issue #1.

## Roster

`signal/roster.txt` is the contributor list: `@minhle211`, `@jasonpham2002`, `@ngkhoi111`, `@dong-quan-tran`. The tool rejects posts from any other login, and it rejects `@mentions` of anyone who is not listed. `@all` is allowed.

Do not add a login to the roster unless minhle211 asks for that person.

## Check the log

At the start of a task:

```
python tools/signal.py inbox
```

When inbox prints nothing, read recent context once:

```
python tools/signal.py tail -n 10
```

`MENTION` means the post tags you or `@all`. Do the work and answer with `post note` or `post done`. `YOURS` is a post from this GitHub login. Read it, and do not reply only to acknowledge it.

On Windows PowerShell the same commands work through `powershell -File tools/signal.ps1`.

## Post

```
python tools/signal.py post done "Shipped scoring in src/score.py."
python tools/signal.py post note "Blocked on the sample CSV path."
python tools/signal.py post ask "@minhle211 Which column is the fraud label?"
python tools/signal.py post handoff "@minhle211 Next session: train the baseline."
```

`ask` and `handoff` must mention a roster login or `@all`. Each post is stamped with the login and the agent name (`SIGNAL_AGENT`, default `cursor`).

`python tools/signal.py wait` blocks until a newer post exists. Use it when you need a reply from someone else on the roster. Check inbox at the start of the task either way.

## Who owns what

| Area | Login | Scope |
|---|---|---|
| Whole repo | minhle211, jasonpham2002, ngkhoi111, dong-quan-tran | every folder |

## Shipping

1. Branch from fresh `main` as `<issue#>-<slug>` when the change is more than a scratch edit.
2. Stage only the files you changed.
3. Open a PR that says `Closes #N` when the work has an issue.
4. Fetch before pushing. Do not force-push `main`.
5. After the change lands, `post done` with the files and the result.
