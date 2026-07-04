# 1830 Estimate Import Workflow (V3)

Standalone **import test page** at `import.html`. Project **1830** is the reference sample — not hard-coded in detection logic.

**V2.8 schedule app (`index.html` + `js/app.js`) is unchanged.**

## How to open import.html

```bash
cd Analyzer-Schedule-Generator
python3 -m http.server 8080
```

Open [http://localhost:8080/import.html](http://localhost:8080/import.html)

Requires network for SheetJS CDN on first load.

## Sprint flow

### Sprint 1 — Workbook Reader ✓

1. **Choose Excel File** — any engineering estimate workbook
2. **Workbook** panel — file name, sheet count
3. **Worksheets** — select a tab
4. **Detected Column Headers** — heuristic header row
5. **Preview** — first 25 rows

No parsing. No schedule merge.

### Sprint 2 — Eichleay Template Detection ✓

After a workbook opens, **Template Detection** runs automatically using `eichleay-template-detector.js`.

**Detection rules:**

| Signal | Rule |
|--------|------|
| Expected sheets | PM Est, Summary, Process, Pipe Eng, Pipe Des, Elect, I&C, Sched, Staff Plan, Dates (flexible name match) |
| PM Est | Sheet contains FEL phase columns (FEL-1 … FEL-4) |
| Discipline sheets | Process / Pipe Eng / I&C etc. contain engineering + design hour column structure |

**Output:**

```json
{
  "templateName": "Eichleay PSE",
  "templateVersion": "old",
  "confidenceScore": 72,
  "matchedSignals": ["Sheet: PM Est (\"PM Est\")", "PM Est: FEL phase columns detected", "..."],
  "missingSignals": ["Sheet: Pipe Des", "..."],
  "isMatch": true
}
```

- `templateName` is set only when `confidenceScore >= 55`
- **No hour parsing**, **no activities**, **no mapping** in Sprint 2

### Sprint 3+ (planned)

- Parse hours from discipline sheets
- Mapping Review → ActivityLibrary
- Resource Loader → schedule candidates

## Sample fixture

```bash
pip install openpyxl   # once
python3 scripts/generate-pse-fixture.py
```

`data/fixtures/1830-pse-sample.xlsx` includes Eichleay-style sheet names (PM Est with FEL columns, Process, Pipe Eng, I&C, etc.) for local detection testing.

## Script load order (import.html)

```html
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script src="./app/shared/standard-import-schema.js"></script>
<script src="./app/shared/excel-reader.js"></script>
<script src="./app/estimate-import/workbook-reader.js"></script>
<script src="./app/estimate-import/eichleay-template-detector.js"></script>
<script src="./app/estimate-import/workbook-reader-ui.js"></script>
```

Parser modules (`template-manager`, `eichleay-pse-old-parser`, `import-review`) remain loaded for future sprints but are **not invoked** on the import page yet.

## Current limitations

| Limitation | Notes |
|------------|-------|
| Detection only | No row parsing or hour extraction |
| Eichleay PSE only | Other templates need new detector modules |
| Separate page | `index.html` schedule builder untouched |
| Heuristic headers | Sprint 1 header detect ≠ final column map |

## Related

- [estimate-import-engine.md](./estimate-import-engine.md)
- [v3-database-schema.md](./v3-database-schema.md)
- Schedule app: [index.html](../index.html)
