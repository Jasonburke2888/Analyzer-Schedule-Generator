# Developer Status Dashboard

One-command project summary for pasting into ChatGPT (or any AI assistant) — no screenshots needed.

## Run

From the repository root:

```bash
python3 scripts/project_status.py
```

**Output:** [PROJECT_STATUS.md](./PROJECT_STATUS.md) (regenerated each run)

The script also prints the output path to the terminal.

## What it includes

1. Project name and UTC timestamp  
2. Git branch, last commit (hash + message)  
3. Git status and uncommitted files  
4. Folder tree summary (depth 3, skips `.git`)  
5. Important modules (`js/app.js`, `app/*`, `docs/*`, deploy workflow)  
6. TODO / FIXME scan across `.js`, `.py`, `.html`, `.css`, `.md`, `.yml`, `.csv`  
7. V3 architecture summary when `app/` exists  
8. Ready-to-copy ChatGPT handoff block  

## Typical workflow

1. Make local changes (or none — useful before starting a task too).  
2. Run `python3 scripts/project_status.py`.  
3. Open `docs/PROJECT_STATUS.md`.  
4. Copy section **7. Copy/paste for ChatGPT** (or the whole file).  
5. Paste into ChatGPT and add your question.

## Example handoff prompt

After pasting the generated block, append:

```text
Help me implement [feature X] without breaking V2.8 Save Project, Load Project, or CSV export.
```

## Notes

- Requires `git` on PATH for branch/commit/status sections.  
- Does **not** modify `index.html`, `js/app.js`, or GitHub Pages behavior.  
- `PROJECT_STATUS.md` is generated — commit it optionally, or add to `.gitignore` if you prefer local-only.  
- Re-run after commits or before starting a new AI session for an accurate snapshot.

## Related

- [estimate-import-engine.md](./estimate-import-engine.md) — V3 import pipeline  
- [v3-database-schema.md](./v3-database-schema.md) — V3 in-memory DB  
- [README.md](../README.md) — run locally, deploy, project JSON format
