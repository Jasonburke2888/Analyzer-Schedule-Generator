# FEL-3 Analyzer Schedule Template Builder (v2.7)

Interactive schedule builder for discipline leads — plain HTML, CSS, and vanilla JavaScript. Deployed via GitHub Pages.

## Run locally

```bash
cd Analyzer-Schedule-Generator
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

## GitHub Pages (static deployment)

No build step required. Push to `main`; GitHub Actions deploys:

- [index.html](index.html) — main entry (relative `./css/styles.css`, `./js/app.js`, `data/activities.csv`)
- [standalone.html](standalone.html) — single-file offline bundle (double-click or email)

Live URL: [https://jasonburke2888.github.io/Analyzer-Schedule-Generator/](https://jasonburke2888.github.io/Analyzer-Schedule-Generator/)

Regenerate standalone after edits:

```bash
node scripts/build-standalone.js
```

## v2.7 highlights

- **Schedule-builder focus** — two compact toolbar rows; project admin (New/Clone/Delete) in Manage Lists → Projects only
- **Row 1** — Project, Project ID, Client, Stage, PM, Zoom (100–175%, default 125%), Undo, Redo, Save
- **Row 2** — filters, Add/Duplicate/Delete/Export/Manage Lists, inline summary on the right
- **Grid zoom** — scales row height, fonts, and inputs in Activity Builder only; persisted to localStorage
- **Wider Activity Name** column; narrower Status, Lead, Notes, and duration columns
- **Duplicate Activity** — copies selected row(s) with next Activity ID
- Frozen header + sticky columns (Include, Activity ID, Discipline) with subtle shadow

## v2.6 highlights

- **Maximized Activity Builder** — ~75–80% viewport; two compact toolbar rows only; KPI cards replaced with inline summary
- **Row 1** — project controls, New/Clone/Delete Project, Undo/Redo, Save, Add/Delete, Export, Manage Lists
- **Row 2** — filters (left) + inline summary: Activities | Hours | Disciplines | Hold (right)
- **Undo/Redo** — 50-level stack for grid edits; ⌘Z / ⌘⇧Z; buttons disable when unavailable
- Reset to Template moved to Manage Lists → Projects tab

## v2.5 highlights

- **Activity naming model:** Base Activity Name stays stored but hidden; grid shows Action → Deliverable → read-only **Activity Name** (`Action - Deliverable`)
- Deliverable derived from Base Activity Name on load when the name contains `Action - …`
- Export uses Activity Name (not Base Activity Name); filters use Discipline, Action, Deliverable, Include, Status

## v2.4 highlights

- Activity Builder uses **62%+ viewport height**; shorter header, KPIs, and toolbar
- **Frozen columns:** Include, Activity ID, Discipline on horizontal scroll
- Tighter column defaults; zebra row shading; **Discipline Lead** column uses PM list
- Template status defaults to **Not Started** (not Complete)

## v2.3 highlights

- **Two-row toolbar** — project setup row + filters/actions row
- **PM** dropdown (was Lead), editable in Manage Lists
- **Project ID** dropdown with add/select, export prefix unchanged
- **Action** dropdown (was Type) + Action filter; Activity Name = `Action - Deliverable` (read-only)
- **Filtered KPIs** and **export** respect active filters (included + visible only)
- **Resizable columns** with widths saved to `localStorage`
- **Multi-project:** New / Clone / Delete project (toolbar + Manage Lists → Projects); each project keeps its own activities and setup

## Manage Lists tabs

Projects · Project IDs · Disciplines · Deliverables · Actions · PMs

## Publish with GitHub Pages

Push to `main` on [Jasonburke2888/Analyzer-Schedule-Generator](https://github.com/Jasonburke2888/Analyzer-Schedule-Generator).  
**Settings → Pages → Source:** GitHub Actions (`.github/workflows/deploy-pages.yml`)

Live URL: `https://jasonburke2888.github.io/Analyzer-Schedule-Generator/`

## Technical notes

- Storage key: `fel3-analyzer-schedule-generator-v4` (reads legacy v3)
- No full table re-render on keystroke
