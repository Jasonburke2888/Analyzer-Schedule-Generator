# 1830 Estimate Import Workflow (V3)

Standalone **import test page** at `import.html`. The **estimate workbook is the source of truth** — no schedule activities, no deliverable renaming.

**V2.8 schedule app (`index.html` + `js/app.js`) is unchanged.**

## How to open import.html

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080/import.html](http://localhost:8080/import.html)

## Pipeline

```
Excel workbook
  → Workbook Reader (preview)
  → Eichleay Template Detection
  → PM Est Extractor → Estimate Line Items
```

The schedule builder will consume Estimate Line Items in a later milestone.

## Estimate Line Item

Each **Estimate Line Item** is one labor-bearing row from the estimate.

| Field | Description |
|-------|-------------|
| Discipline | From estimate column (verbatim) |
| Estimate Section | Sheet name, section column, or FEL phase when unambiguous |
| Deliverable | **Verbatim** from estimate — never renamed |
| Qty | Quantity when present |
| Unit | Unit of measure when present |
| Engineer Hours | Engineer hours column |
| Designer Hours | Designer hours column |
| HVE Hours | HVE / checker / review hours when present |
| Total Hours | Total column or sum when confidently derived |
| Notes | Estimate notes + FEL detail when needed |
| Validation Status | `valid` or `needs_review` |

**Not included:** activity names, mapping status, schedule merge, resource loading.

## Extraction rules (PM Est only)

- **PM Est sheet only** — other tabs not parsed yet
- Skip blank rows and total/header rows
- Do not infer schedule logic or rename deliverables
- Uncertain values left blank; `validationStatus = needs_review`

## Sample fixture

```bash
pip install openpyxl
python3 scripts/generate-pse-fixture.py
```

## Script load order (import.html)

```html
<script src="./app/shared/excel-reader.js"></script>
<script src="./app/shared/estimate-line-item-schema.js"></script>
<script src="./app/estimate-import/workbook-reader.js"></script>
<script src="./app/estimate-import/eichleay-template-detector.js"></script>
<script src="./app/estimate-import/eichleay-pm-est-extractor.js"></script>
<script src="./app/estimate-import/workbook-reader-ui.js"></script>
```

## Next step

Schedule builder consumes validated Estimate Line Items (future milestone).

## Related

- [estimate-import-engine.md](./estimate-import-engine.md)
- Schedule app: [index.html](../index.html)
