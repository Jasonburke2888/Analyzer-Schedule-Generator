# 1830 Estimate Import Workflow (V3.1)

Standalone **import test proof** on `import.html`: Excel workbook → template detect → Standard Import Rows → Import Review. Project **1830** is the reference sample — not hard-coded in parser logic.

**V2.8 schedule app (`index.html` + `js/app.js`) is unchanged.**

## How to open import.html

```bash
cd Analyzer-Schedule-Generator
python3 -m http.server 8080
```

Open:

- Local: [http://localhost:8080/import.html](http://localhost:8080/import.html)
- GitHub Pages: `https://jasonburke2888.github.io/Analyzer-Schedule-Generator/import.html`

Requires network for SheetJS CDN on first load.

## Expected import flow

1. Open **import.html** (standalone test page — not linked from V2.8 toolbar).
2. Optionally enter **Project ID** (auto-detected from filename/cover sheet, e.g. `1830`).
3. Optionally select an Excel estimate (`.xlsx` / `.xls`).
4. Click **Run Import** — or **Load Sample Fixture** to force `data/fixtures/1830-pse-sample.xlsx`.
5. If no file is selected, **Run Import** uses the sample fixture automatically.
6. Page shows:
   - **Template Detection** JSON (template id, confidence, matched sheets)
   - **Import Summary** stats (total rows, **unmapped count**, template, project ID)
   - **Standard Import Rows** review table
7. Optionally **Download Import JSON** for handoff.
8. **Schedule activities are not generated** at this step.

### Sample fixture

Generate or refresh the test workbook:

```bash
pip install openpyxl   # once
python3 scripts/generate-pse-fixture.py
```

Output: `data/fixtures/1830-pse-sample.xlsx` (4 sample rows, project ID 1830 on cover sheet).

## Error messages

| Code | Meaning |
|------|---------|
| `WORKBOOK_READ` | Workbook cannot be read — invalid file, corrupt Excel, or fixture missing |
| `TEMPLATE_NOT_DETECTED` | Template not detected — layout does not match a registered parser |
| `NO_ROWS` | No import rows found — headers/data not recognized on data sheets |
| `PARSER_FAILED` | Parser failed — unexpected error during row extraction |

Errors display as `[CODE] message` in the status line. Detection JSON may still appear for template/row failures.

## Pipeline

```
Excel file (File API or fixture fetch)
    → SheetJS read (excel-reader.js)
    → Template detect (template-detector.js)
    → Eichleay PSE v1 parser (eichleay-pse-old-parser.js)
    → Standard Import Batch (standard-import-schema.js)
    → Import Review (import-review.js) — store only, no schedule merge
```

## Script load order (import.html)

```html
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script src="./app/shared/standard-import-schema.js"></script>
<script src="./app/shared/excel-reader.js"></script>
<script src="./app/estimate-import/template-manager.js"></script>
<script src="./app/estimate-import/template-detector.js"></script>
<script src="./app/estimate-import/eichleay-pse-old-parser.js"></script>
<script src="./app/estimate-import/import-review.js"></script>
<script src="./app/estimate-import/import-wizard.js"></script>
```

## Standard import row fields

| Field | Source |
|-------|--------|
| `projectId` | User input, filename, or cover sheet |
| `sourceFile` | Uploaded file name |
| `templateName` | e.g. `eichleay-pse-old` |
| `templateVersion` | e.g. `1` |
| `sheetName` | Excel sheet tab |
| `rowNumber` | 1-based row in sheet |
| `discipline` | Column or carried forward |
| `estimateDeliverable` | Estimate deliverable column |
| `deliverable` | Same as estimateDeliverable (compat) |
| `activityName` | From column or `Develop - {deliverable}` |
| `qty`, hour columns, `notes` | Mapped columns |
| `mappingStatus` | Always `unmapped` on import |

## Parser assumptions (Eichleay PSE v1)

- Data sheets have a header row within the first 40 rows with **Deliverable** (or similar) and at least one **hour** column.
- Column headers match aliases in `eichleay-pse-old-parser.js` `COLUMN_ALIASES` (e.g. `Engineer Hrs`, `Designer Hrs`, `Total Hrs`).
- Cover/summary/instruction sheets are skipped.
- Subtotal/total lines are skipped.
- Blank discipline cells inherit the previous row’s discipline.
- Project ID is guessed from filename pattern (e.g. `1830`) or cover sheet `Project ID` label — not filtered to 1830 only.

## Current limitations

| Limitation | Notes |
|------------|-------|
| Separate page only | No import button on V2.8 schedule toolbar |
| Browser-only Excel read | SheetJS CDN; no server-side parse |
| One template parser | `eichleay-pse-old` v1 only |
| All rows start `unmapped` | No ActivityLibrary mapping yet |
| No schedule merge | Resource Loader not invoked from import page |
| No project file embed | Import JSON is separate from V2.8 project JSON |

## Next step: mapping rows to ActivityLibrary

1. **Mapping Review UI** — map `estimateDeliverable` → ActivityLibrary / schedule deliverable.
2. Persist mappings in V3 DB (`ActivityMappings` collection).
3. After approval, pass mapped rows to **Resource Loader** → schedule activity candidates.
4. Optional: merge approved candidates into V2.8 grid (future integration).

## When templates change

1. Add a new parser file (e.g. `eichleay-pse-v2-parser.js`) with its own `COLUMN_ALIASES`.
2. Register detection rules in `template-detector.js`.
3. Register parser via `TemplateManager.registerTemplateParser`.
4. Document column map here.

Do **not** embed project-specific row filters (1830-only rows, etc.).

## Related

- [estimate-import-engine.md](./estimate-import-engine.md)
- [v3-database-schema.md](./v3-database-schema.md)
- [developer-status-dashboard.md](./developer-status-dashboard.md)
- Schedule app: [index.html](../index.html)
