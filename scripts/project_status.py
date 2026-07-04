#!/usr/bin/env python3
"""
Generate docs/PROJECT_STATUS.md — Developer Status Dashboard for ChatGPT handoff.

Usage (from repo root):
  python3 scripts/project_status.py
"""

from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PROJECT_NAME = "FEL-3 Analyzer Schedule Generator"
OUTPUT_REL = Path("docs/PROJECT_STATUS.md")

SKIP_DIRS = {
    ".git",
    ".cursor",
    "node_modules",
    "__pycache__",
    ".DS_Store",
}

CODE_GLOBS = ("*.js", "*.py", "*.html", "*.css", "*.md", "*.yml", "*.csv")
TODO_PATTERN = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b", re.IGNORECASE)

SKIP_TODO_FILES = {
    "scripts/project_status.py",
    "docs/PROJECT_STATUS.md",
    "docs/developer-status-dashboard.md",
}


def is_todo_comment(line: str) -> bool:
    if not TODO_PATTERN.search(line):
        return False
    stripped = line.lstrip()
    return (
        stripped.startswith("//")
        or stripped.startswith("#")
        or stripped.startswith("*")
        or stripped.startswith("/*")
        or "<!--" in stripped
    )

IMPORTANT_PATHS = [
    "js/app.js",
    "index.html",
    "standalone.html",
    "css/styles.css",
    "data/activities.csv",
    "app/estimate-import/",
    "app/database/",
    "app/resource-loader/",
    "app/shared/",
    "docs/",
    "app/shared/standard-import-schema.js",
    "app/estimate-import/template-manager.js",
    "app/estimate-import/eichleay-pse-old-parser.js",
    "app/estimate-import/import-review.js",
    "app/resource-loader/resource-loader.js",
    "app/database/schema.js",
    "app/database/project-db.js",
    "docs/estimate-import-engine.md",
    "docs/v3-database-schema.md",
    "docs/developer-status-dashboard.md",
    "scripts/build-standalone.js",
    "scripts/project_status.py",
    ".github/workflows/deploy-pages.yml",
]


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def run_git(args: list[str], root: Path) -> str:
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()
    except FileNotFoundError:
        return ""


def folder_tree_summary(root: Path, max_depth: int = 3) -> list[str]:
    lines: list[str] = []

    def walk(dir_path: Path, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(
                dir_path.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except PermissionError:
            return
        for entry in entries:
            if entry.name in SKIP_DIRS:
                continue
            if entry.is_dir():
                lines.append(f"{prefix}{entry.name}/")
                walk(entry, prefix + "  ", depth + 1)
            elif depth <= max_depth:
                lines.append(f"{prefix}{entry.name}")

    lines.append(f"{root.name}/")
    walk(root, "  ", 1)
    return lines


def scan_todos(root: Path) -> list[str]:
    findings: list[str] = []
    for pattern in CODE_GLOBS:
        for path in root.rglob(pattern):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            rel = path.relative_to(root).as_posix()
            if rel in SKIP_TODO_FILES:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if is_todo_comment(line):
                    snippet = line.strip()[:100]
                    findings.append(f"- `{rel}:{i}` — {snippet}")
    return sorted(findings)


def module_status(root: Path, rel: str) -> str:
    path = root / rel
    if path.is_file():
        size = path.stat().st_size
        return f"✓ `{rel}` ({size:,} bytes)"
    if path.is_dir():
        count = sum(1 for _ in path.rglob("*") if _.is_file())
        return f"✓ `{rel}/` ({count} files)"
    return f"✗ `{rel}` (missing)"


def v3_architecture_summary(root: Path) -> list[str]:
    app_dir = root / "app"
    if not app_dir.is_dir():
        return ["_No `app/` folder — V3 modules not present._"]

    sections = [
        "### V3 Estimate Import Engine",
        "- `app/shared/standard-import-schema.js` — standard import row/batch schema",
        "- `app/estimate-import/template-manager.js` — parser registry",
        "- `app/estimate-import/eichleay-pse-old-parser.js` — stub Eichleay PSE parser",
        "- `app/estimate-import/import-review.js` — mapping review helpers",
        "- `app/resource-loader/resource-loader.js` — import rows → activity candidates",
        "",
        "### V3 Database (in-memory skeleton)",
        "- `app/database/schema.js` — logical table definitions",
        "- `app/database/project-db.js` — createProject, addImportedEstimateRows, mapping, generate",
        "",
        "**Pipeline:** Estimate Excel → Template Parser → ImportedEstimateRows → ActivityMappings → ScheduleActivities → ResourceAssignments → P6 Export",
        "",
        "**Integration status:** V3 modules are **not** linked from `index.html`. V2.8 schedule (`js/app.js`) is the live app.",
    ]
    return sections


def chatgpt_block(
    branch: str,
    commit_hash: str,
    commit_msg: str,
    status_short: str,
    todo_count: int,
    has_v3: bool,
) -> str:
    v3_line = "V3 estimate-import + database skeleton present under `app/` (not wired to UI)." if has_v3 else "No V3 `app/` modules."
    status_line = (status_short or "unknown").split("\n")[0].strip()
    return f"""```markdown
## Context handoff — {PROJECT_NAME}

**Branch:** {branch or "unknown"}
**Last commit:** {commit_hash or "unknown"} — {commit_msg or "n/a"}
**Working tree:** {status_line}
**TODO/FIXME in repo:** {todo_count}

**Live app:** V2.8 plain HTML/CSS/JS — `index.html` + `js/app.js`
- Save/Load Project JSON, CSV export, GitHub Pages deploy
- localStorage = autosave cache only

**Architecture:** {v3_line}

**Ask:** [Describe your task here]
```"""


def build_report(root: Path) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    branch = run_git(["branch", "--show-current"], root) or "unknown"
    commit_hash = run_git(["rev-parse", "--short", "HEAD"], root) or "unknown"
    commit_msg = run_git(["log", "-1", "--format=%s"], root) or "unknown"
    status_porcelain = run_git(["status", "--porcelain"], root)
    status_short = run_git(["status", "-sb"], root) or "unknown"

    uncommitted = []
    if status_porcelain:
        for line in status_porcelain.splitlines():
            uncommitted.append(f"- `{line}`")
    else:
        uncommitted.append("- _Clean working tree (no uncommitted changes)._")

    tree_lines = folder_tree_summary(root)
    module_lines = [module_status(root, p) for p in IMPORTANT_PATHS]
    todos = scan_todos(root)
    has_v3 = (root / "app").is_dir()
    v3_lines = v3_architecture_summary(root)
    paste_block = chatgpt_block(
        branch, commit_hash, commit_msg, status_short, len(todos), has_v3
    )

    lines = [
        "# Project Status Dashboard",
        "",
        f"> Auto-generated by `scripts/project_status.py` — **do not edit manually**",
        f"> Regenerate: `python3 scripts/project_status.py`",
        "",
        "---",
        "",
        "## 1. Project",
        "",
        f"- **Name:** {PROJECT_NAME}",
        f"- **Generated:** {now}",
        f"- **Repository root:** `{root}`",
        "",
        "## 2. Git",
        "",
        f"- **Branch:** `{branch}`",
        f"- **Last commit:** `{commit_hash}` — {commit_msg}",
        f"- **Status:** `{status_short}`",
        "",
        "### Uncommitted files",
        "",
        *uncommitted,
        "",
        "## 3. Folder tree (summary)",
        "",
        "```",
        *tree_lines,
        "```",
        "",
        "## 4. Important modules",
        "",
        *module_lines,
        "",
        "## 5. TODO / FIXME scan",
        "",
    ]

    if todos:
        lines.extend(todos)
    else:
        lines.append("_No TODO/FIXME comments found in scanned files._")

    lines.extend(["", "## 6. V3 architecture", ""])
    lines.extend(v3_lines)

    lines.extend([
        "",
        "## 7. Copy/paste for ChatGPT",
        "",
        "Copy the block below into a new chat:",
        "",
        paste_block,
        "",
        "---",
        "",
        "See [developer-status-dashboard.md](./developer-status-dashboard.md) for usage.",
        "",
    ])

    return "\n".join(lines)


def main() -> int:
    root = repo_root()
    out_path = root / OUTPUT_REL
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report = build_report(root)
    out_path.write_text(report, encoding="utf-8")
    print(f"Wrote {out_path.relative_to(root)}")
    print(f"Run: python3 scripts/project_status.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
