#!/usr/bin/env python3
"""Signal log: one GitHub issue that agents read and post on.

Contributors are the logins in signal/roster.txt. Anyone else is rejected.
Requires the GitHub CLI (`gh auth login`).

Environment:
  SIGNAL_ISSUE   issue number (default 1)
  SIGNAL_REPO    owner/name, if git remote origin is not usable
  SIGNAL_AGENT   short name stamped on each post (default cursor)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

MENTION = re.compile(r"(?:^|[^A-Za-z0-9-])@([A-Za-z0-9-]+)")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
LOGIN_RE = re.compile(r"^[A-Za-z0-9-]+$")
AGENT_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")
KINDS = ("note", "ask", "done", "handoff")

_root: Path | None = None
_repo: str | None = None


class SignalError(Exception):
    pass


def die(message: str) -> None:
    raise SignalError(message)


def root() -> Path:
    global _root
    if _root is not None:
        return _root
    proc = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode == 0 and proc.stdout.strip():
        _root = Path(proc.stdout.strip())
    else:
        _root = Path.cwd()
    return _root


def state_dir() -> Path:
    return root() / ".signal"


def gh(args: list[str], input_text: str | None = None) -> str:
    try:
        proc = subprocess.run(
            ["gh", *args],
            input=input_text,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError:
        die("gh is not installed (https://cli.github.com)")
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "gh failed").strip()
        die(detail)
    return proc.stdout


def gh_json(args: list[str], input_text: str | None = None):
    raw = gh(args, input_text=input_text).strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        die("gh returned data that is not JSON")


def parse_remote(url: str) -> str | None:
    text = url.strip()
    if text.endswith(".git"):
        text = text[:-4]
    if text.startswith("git@"):
        path = text.split(":", 1)[-1]
    elif "://" in text:
        path = text.split("://", 1)[1]
        path = path.split("/", 1)[-1]
    else:
        return None
    path = path.strip("/")
    if not REPO_RE.fullmatch(path):
        return None
    return path


def repo() -> str:
    global _repo
    if _repo is not None:
        return _repo
    override = os.environ.get("SIGNAL_REPO", "").strip()
    if override:
        if not REPO_RE.fullmatch(override):
            die("SIGNAL_REPO must look like owner/name")
        _repo = override
        return _repo
    proc = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode == 0:
        parsed = parse_remote(proc.stdout)
        if parsed:
            _repo = parsed
            return _repo
    data = gh_json(["repo", "view", "--json", "nameWithOwner"])
    name = data.get("nameWithOwner") if isinstance(data, dict) else None
    if not isinstance(name, str) or not REPO_RE.fullmatch(name):
        die("cannot determine the repo; set SIGNAL_REPO=owner/name")
    _repo = name
    return _repo


def issue() -> str:
    raw = os.environ.get("SIGNAL_ISSUE", "1").strip()
    if not raw.isdigit() or int(raw) < 1:
        die("SIGNAL_ISSUE must be a positive integer")
    return raw


def roster() -> list[str]:
    path = root() / "signal" / "roster.txt"
    if not path.is_file():
        die("missing signal/roster.txt")
    names: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        name = line.split("#", 1)[0].strip()
        if not name:
            continue
        if not LOGIN_RE.fullmatch(name):
            die(f"invalid roster login: {name}")
        names.append(name)
    if not names:
        die("signal/roster.txt has no logins")
    return names


def roster_keys() -> set[str]:
    return {name.lower() for name in roster()}


def login() -> str:
    name = gh(["api", "user", "--jq", ".login"]).strip()
    if not LOGIN_RE.fullmatch(name):
        die("gh is not logged in")
    return name


def mentions(text: str) -> list[str]:
    return MENTION.findall(text)


def require_author(name: str) -> None:
    if name.lower() not in roster_keys():
        die(f"@{name} is not on signal/roster.txt")


def require_mentions(kind: str, message: str) -> None:
    allowed = roster_keys() | {"all"}
    found = mentions(message)
    blocked = sorted({item for item in found if item.lower() not in allowed})
    if blocked:
        listed = ", ".join(f"@{item}" for item in blocked)
        die(f"not on the roster: {listed}")
    if kind in ("ask", "handoff") and not any(item.lower() in allowed for item in found):
        die(f"{kind} must mention a roster login, or @all")


def agent_name() -> str:
    name = os.environ.get("SIGNAL_AGENT", "cursor").strip() or "cursor"
    if not AGENT_RE.fullmatch(name):
        die("SIGNAL_AGENT must be a short token (letters, numbers, ., _, -)")
    return name


def compose(kind: str, author: str, message: str) -> str:
    return f"signal {kind} | @{author} | {agent_name()}\n{message.strip()}\n"


def cursor_path() -> Path:
    safe = repo().replace("/", "_")
    return state_dir() / f"seen-{safe}-{issue()}.json"


def load_cursor() -> tuple[int, str] | None:
    path = cursor_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        return None
    created = data.get("created_at") or "1970-01-01T00:00:00Z"
    return data["id"], str(created)


def save_cursor(comment_id: int, created_at: str) -> None:
    current = load_cursor()
    if current is not None and current[0] >= comment_id:
        return
    state_dir().mkdir(parents=True, exist_ok=True)
    path = cursor_path()
    payload = json.dumps({"id": comment_id, "created_at": created_at}) + "\n"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(path)


def normalize(comment: dict) -> dict:
    user = comment.get("user") or {}
    return {
        "id": int(comment["id"]),
        "login": user.get("login") or "unknown",
        "created_at": comment.get("created_at") or "",
        "body": comment.get("body") or "",
    }


def fetch_page(extra: str, page: int) -> list[dict]:
    url = f"repos/{repo()}/issues/{issue()}/comments?per_page=100&page={page}"
    if extra:
        url = f"{url}&{extra}"
    data = gh_json(["api", url])
    if not isinstance(data, list):
        die("could not read issue comments")
    return [normalize(item) for item in data if isinstance(item, dict) and "id" in item]


def fetch_all(extra: str = "") -> list[dict]:
    page = 1
    rows: list[dict] = []
    while True:
        chunk = fetch_page(extra, page)
        rows.extend(chunk)
        if len(chunk) < 100:
            rows.sort(key=lambda row: row["id"])
            return rows
        page += 1


def fetch_last(count: int) -> list[dict]:
    info = gh_json(["api", f"repos/{repo()}/issues/{issue()}"])
    if not isinstance(info, dict):
        die("could not read the signal issue")
    total = int(info.get("comments") or 0)
    if total <= 0:
        return []
    page = (total + 99) // 100
    rows: list[dict] = []
    while page >= 1 and len(rows) < count:
        rows = fetch_page("", page) + rows
        page -= 1
    rows.sort(key=lambda row: row["id"])
    return rows[-count:]


def fetch_since(created_at: str, after_id: int) -> list[dict]:
    quoted = urllib.parse.quote(created_at, safe="")
    rows = fetch_all(f"since={quoted}")
    return [row for row in rows if row["id"] > after_id]


def render(rows: list[dict], author: str) -> str:
    author_key = author.lower()
    blocks: list[str] = []
    for row in rows:
        if row["login"].lower() == author_key:
            flag = " YOURS"
        elif any(item.lower() in {author_key, "all"} for item in mentions(row["body"])):
            flag = " MENTION"
        else:
            flag = ""
        body = row["body"].rstrip()
        blocks.append(
            f"--- @{row['login']} {row['created_at']} (#{row['id']}){flag}\n{body}"
        )
    return "\n".join(blocks)


def cmd_post(kind: str, message: str) -> int:
    text = message.strip()
    if not text:
        die("empty message")
    require_mentions(kind, text)
    author = login()
    require_author(author)
    payload = json.dumps({"body": compose(kind, author, text)})
    created = gh_json(
        [
            "api",
            "--method",
            "POST",
            "--input",
            "-",
            f"repos/{repo()}/issues/{issue()}/comments",
        ],
        input_text=payload,
    )
    if not isinstance(created, dict) or "id" not in created:
        die("post failed")
    save_cursor(int(created["id"]), str(created.get("created_at") or ""))
    print(created.get("html_url") or f"{repo()}#{issue()}")
    return 0


def cmd_tail(count: int) -> int:
    if count < 1:
        die("tail -n must be at least 1")
    rows = fetch_last(count)
    if rows:
        print(render(rows, login()))
    return 0


def cmd_inbox() -> int:
    author = login()
    current = load_cursor()
    if current is None:
        rows = fetch_last(10)
    else:
        rows = fetch_since(current[1], current[0])
    if not rows:
        if current is None:
            save_cursor(0, "1970-01-01T00:00:00Z")
        return 0
    newest = max(rows, key=lambda row: row["id"])
    print(render(rows, author))
    save_cursor(newest["id"], newest["created_at"])
    return 0


def ensure_cursor() -> tuple[int, str]:
    current = load_cursor()
    if current is not None:
        return current
    rows = fetch_last(1)
    if rows:
        save_cursor(rows[-1]["id"], rows[-1]["created_at"])
    else:
        save_cursor(0, "1970-01-01T00:00:00Z")
    loaded = load_cursor()
    if loaded is None:
        die("could not store the signal cursor")
    return loaded


def cmd_wait(every: int, limit: int) -> int:
    if every < 1:
        die("--every must be at least 1")
    if limit < 0:
        die("--limit must be 0 or more")
    current = ensure_cursor()
    author = login()
    started = time.time()
    while True:
        try:
            rows = fetch_since(current[1], current[0])
        except SignalError as exc:
            print(f"signal: {exc}", file=sys.stderr)
            rows = []
        if rows:
            newest = max(rows, key=lambda row: row["id"])
            print(render(rows, author))
            save_cursor(newest["id"], newest["created_at"])
            return 0
        if limit and time.time() - started >= limit:
            print(f"signal: wait timed out after {limit}s", file=sys.stderr)
            return 124
        time.sleep(every)


def cmd_who() -> int:
    author = login()
    member = "yes" if author.lower() in roster_keys() else "no"
    print(author)
    print(f"on roster: {member}")
    print(f"issue: {repo()}#{issue()}")
    return 0


def cmd_roster() -> int:
    for name in roster():
        print(name)
    return 0


def message_from(args: argparse.Namespace) -> str:
    if args.message:
        return " ".join(args.message)
    if not sys.stdin.isatty():
        return sys.stdin.read()
    die("missing message")
    return ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="signal",
        description="Read and post on this repo's signal issue.",
        epilog=(
            "examples:\n"
            "  python tools/signal.py inbox\n"
            "  python tools/signal.py tail -n 10\n"
            '  python tools/signal.py post done "Shipped tools/signal.py."\n'
            '  python tools/signal.py post ask "@minhle211 Which label column?"\n'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="cmd", required=True)

    post = commands.add_parser("post", help="publish note, done, ask, or handoff")
    post.add_argument("kind", choices=KINDS)
    post.add_argument("message", nargs="*")

    tail = commands.add_parser("tail", help="show the newest posts")
    tail.add_argument("-n", type=int, default=10)

    commands.add_parser("inbox", help="show posts since the last check, then mark them seen")
    wait = commands.add_parser("wait", help="block until a post newer than the cursor arrives")
    wait.add_argument("--every", type=int, default=30)
    wait.add_argument("--limit", type=int, default=0)

    commands.add_parser("who", help="print the gh login, roster membership, and issue")
    commands.add_parser("roster", help="print logins allowed to post")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.cmd == "post":
            return cmd_post(args.kind, message_from(args))
        if args.cmd == "tail":
            return cmd_tail(args.n)
        if args.cmd == "inbox":
            return cmd_inbox()
        if args.cmd == "wait":
            return cmd_wait(args.every, args.limit)
        if args.cmd == "who":
            return cmd_who()
        if args.cmd == "roster":
            return cmd_roster()
    except SignalError as exc:
        print(f"signal: {exc}", file=sys.stderr)
        return 1
    die(f"unknown command {args.cmd}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
