# FEL-3 Analyzer Schedule Template Builder (v2.2)

Interactive schedule builder for discipline leads — plain HTML, CSS, and vanilla JavaScript. Deployed via GitHub Pages; no Python server required for coworkers.

## Project structure

```
Analyzer-Schedule-Generator/
  index.html
  css/styles.css
  js/app.js
  data/activities.csv
  README.md
```

## Run locally (developers)

```bash
cd Analyzer-Schedule-Generator
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

## v2.2 features

### Compact toolbar

Project Setup, filters, and action buttons share one compact toolbar (two field rows + action row). Reduced padding and vertical spacing so more of the screen is available for the activity grid.

### Delete password

**Delete Selected** opens a password prompt (masked input). Wrong password cancels; correct password deletes the selected rows. Password is not shown anywhere in the static UI.

### New Activity ID

**Add Activity** assigns the next numeric Activity ID as **highest existing ID + 10** (e.g. highest `32070` → new `32080`). No `NEW_` prefix.

### Editable grid

All activity fields remain user-editable: Include, Discipline, Deliverable, Activity Owner, Type, base/custom/final name, duration/hours, status, notes — plus row select and delete with password.

## v2.1 features (retained)

### Project Setup

| Field | Control |
|-------|---------|
| Project Name | Dropdown (+ Add Project...) |
| Project ID | Text — used to prefix Activity IDs on export |
| Client | Text |
| FEL Stage | FEL-1, FEL-2, FEL-3, **FEL-4**, **Construction** |
| Discipline Lead | Dropdown (Unassigned, Joe Smith, Other + custom) |

### Activity grid

- **Activity ID** — shows suffix only in grid (`31010`); export adds `ProjectID_` prefix (`1517_31010`)
- **Discipline / Deliverable** — wide dropdowns with + Add options
- **Activity Owner** — customizable dropdown (+ Add Activity Owner...)
- Custom Activity Name, Duration, Hours — focus-safe editing

### Manage Lists (5 tabs)

Projects · Disciplines · Deliverables · **Discipline Leads** · **Activity Owners**

Each tab: Add, Edit (rename), Delete. Renaming disciplines/deliverables/owners updates matching activity rows.

### CSV export (included rows)

Project Name, Project ID, Client, FEL Stage, **Discipline Lead**, **Activity ID** (with prefix), Activity Name, Discipline, Deliverable, Activity Type, Original Duration, Budgeted Hours, **Activity Owner**, Lead Status, Lead Notes

**Reset** reloads activities from CSV; keeps project setup and custom lists.

## Publish with GitHub Pages

This repository **is** the site root (not a subfolder in another repo).

1. Push to `main` on `https://github.com/Jasonburke2888/Analyzer-Schedule-Generator`
2. **Settings → Pages → Source:** GitHub Actions (workflow: `.github/workflows/deploy-pages.yml`)
3. Share: `https://jasonburke2888.github.io/Analyzer-Schedule-Generator/`

## Technical notes

- Storage key: `fel3-analyzer-schedule-generator-v3`
- No full table re-render on keystroke
- Relative paths: `css/styles.css`, `js/app.js`, `data/activities.csv`
