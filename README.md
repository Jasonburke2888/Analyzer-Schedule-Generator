# FEL-3 Analyzer Schedule Template Builder (v2.3)

Interactive schedule builder for discipline leads — plain HTML, CSS, and vanilla JavaScript. Deployed via GitHub Pages.

## Run locally

```bash
cd Analyzer-Schedule-Generator
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

## v2.3 highlights

- **Two-row toolbar** — project setup row + filters/actions row
- **PM** dropdown (was Lead), editable in Manage Lists
- **Project ID** dropdown with add/select, export prefix unchanged
- **Action** dropdown (was Type) + Action filter; Final Activity Name = `Action - Deliverable` (read-only)
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
