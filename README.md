# FEL-3 Analyzer Schedule Template Builder

Interactive schedule builder for discipline leads — rebuilt from `reference/FEL3_Analyzer_Template_Builder_v2.html` as a clean multi-file app with the focus bug fixed.

## Project structure

```
Analyzer-Schedule-Generator/
  index.html
  css/styles.css
  js/app.js
  data/activities.csv      ← 108 FEL-3 activities from reference template
  reference/               ← original single-file HTML (design reference only)
  README.md
```

## Run locally (optional — for developers only)

Coworkers should use the **GitHub Pages URL** (see below), not a local server.

To test changes on your machine:

```bash
cd Analyzer-Schedule-Generator
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

## Workflow

1. **Filter** by Discipline, Deliverable, Include (Yes/No), or Status.
2. **Include** — check the Include checkbox for activities in scope (unchecked rows appear dimmed).
3. **Customize** — edit Activity ID, names, durations, hours, owner, status, and lead notes. Final columns update live without losing keyboard focus.
4. **Add Activity** — inserts a new row at the top.
5. **Delete Selected** — check rows in the left Select column, then delete.
6. **Save** — writes to browser `localStorage` (also auto-saves on blur/change).
7. **Export Included to CSV** — downloads only checked Include rows with final name/duration/hours.
8. **Reset** — reloads `data/activities.csv` and clears saved edits.

## Replace template data

Edit `data/activities.csv`. Columns:

| Column | Maps to |
|--------|---------|
| `include` | yes/no (default yes) |
| `discipline` | Discipline |
| `deliverable` | Deliverable |
| `activity_id` | Activity ID |
| `activity_type` | Type |
| `activity_name` | Base Activity Name |
| `custom_activity_name` | Custom Activity Name |
| `original_duration` | Base Dur |
| `custom_duration` | Custom Dur |
| `budgeted_hours` | Base Hrs |
| `custom_hours` | Custom Hrs |
| `owner` | Owner / Lead |
| `status` | Status |
| `lead_notes` | Lead Notes |

Click **Reset** after updating the CSV.

## Focus bug fix

The reference HTML called `render()` on every `input` event, rebuilding the entire table and destroying the focused element. This app:

- Rebuilds rows only on **add**, **delete**, or **reset**
- Updates computed Final columns via `updateRowComputed()` during typing
- Applies filters with CSS (`row-hidden`) instead of DOM rebuild

## Publish with GitHub Pages

The app is a static site: `index.html`, relative `css/styles.css`, `js/app.js`, and `data/activities.csv`. No build step and **no Python server** for coworkers — share the Pages link only.

### One-time repo setup

1. Push this repository to GitHub (include the `Analyzer-Schedule-Generator/` folder and `.github/workflows/deploy-analyzer-schedule-pages.yml`).
2. In the repo on GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
4. Push to `main` or run the workflow manually (**Actions → Deploy Analyzer Schedule to GitHub Pages → Run workflow**).
5. When the workflow finishes, Pages shows the live URL, typically:
   - `https://<username>.github.io/<repo-name>/`

### What gets deployed

The workflow uploads **only** the contents of `Analyzer-Schedule-Generator/` as the site root, so these relative paths resolve correctly on Pages:

| File | URL path |
|------|----------|
| `index.html` | `/` |
| `css/styles.css` | `/css/styles.css` |
| `js/app.js` | `/js/app.js` |
| `data/activities.csv` | `/data/activities.csv` |

The `.nojekyll` file prevents Jekyll from ignoring `data/` or other static assets.

### Share with discipline leads

Send the GitHub Pages URL. They open it in a browser, edit activities, and use **Export Included to CSV**. Edits persist in **localStorage** in that browser.

### Updating the live site

Push changes under `Analyzer-Schedule-Generator/` to `main`. The deploy workflow runs automatically and updates Pages within a few minutes.

### Note on opening `index.html` from disk

Double-clicking `index.html` (`file://`) will **not** load the CSV — browsers block `fetch` for local files. Use the GitHub Pages URL (or a local server only while developing).
