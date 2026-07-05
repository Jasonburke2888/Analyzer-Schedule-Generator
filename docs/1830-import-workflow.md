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
  → Civil Str Extractor → Estimate Line Items (Milestone 3A)
```

The schedule builder will consume Estimate Line Items in a later milestone.

## Estimate Line Item

Each **Estimate Line Item** is one labor-bearing row from the estimate.

| Field | Description |
|-------|-------------|
| Discipline | `Civil/Structural` for Civil Str extraction |
| Estimate Section | Orange section header / work package above the row |
| Deliverable | **Verbatim** from estimate — never renamed |
| Qty | Quantity when present |
| Unit | Unit of measure when present |
| Engineer Hours | `ENGR HRS` column |
| Designer Hours | `DESIGN HRS` column |
| HVE Hours | `HVE ENGR HRS` + `HVE DESIGN HRS` |
| Total Hours | `TOTAL` column |
| Notes | Estimate notes when present |
| Validation Status | `valid` or `needs_review` |
| Review Reason | Set when validation fails (e.g. labor mismatch, missing deliverable) |

**Not included:** activity names, mapping status, schedule merge, resource loading.

## Extraction rules — Civil Str only (Milestone 3A)

**Worksheet:** `Civil Str` only. PM Est, Summary, and other discipline tabs are not parsed.

**Estimate Body Start (no fixed row numbers):**

Scan from the top of the sheet for the **first row** that contains all of these headers in the same row:

- `NO.`
- `DESCRIPTION`
- `UNIT`
- `QTY`
- `ENGR HOURS PER UNIT`
- `TOTAL`

Extraction begins on the row **after** that header. Everything above is ignored (scope of work, project metadata, start/finish dates, duration, blank setup rows).

**Skip rows (below the body header):**

- Summary / calculation rows: Project Control, Procurement, Construction Support, Life Science, Avg Rate, Weeks, % of ENG, TIC % / TOT, FTEs, ratios, subtotals

**Section headers (Work Package / Section):**

- Orange-filled rows (when styles are available) or label-only rows with no labor hours
- Examples: Project Investigations, Studies / Calculations, General / Building Drawings
- Section name is stored in `estimateSection` for rows below it

**Line item creation:**

- Only when `TOTAL` hours &gt; 0
- Rows with `TOTAL` = 0 are ignored
- Deliverable text preserved exactly as written (from `DESCRIPTION`)
- Labor: `engineerHours` = ENGR HRS, `designerHours` = DESIGN HRS, `hveHours` = HVE ENGR HRS + HVE DESIGN HRS, `totalHours` = TOTAL

**Console log (import page):**

- `Civil Str estimate body starts at row X`
- `Ignored setup rows: N`
- `Line items extracted: N`

**QA warning (non-blocking):**

A normal discipline tab usually produces **5–20** estimate line items. If extraction yields **more than 25**, the import page logs and displays:

`Too many Civil/Structural line items — parser may be reading summary/setup rows.`

Import is not blocked — this is a QA hint only.

**Validation:**

| Condition | validationStatus | reviewReason |
|-----------|------------------|--------------|
| ENGR + DESIGN + HVE ≠ TOTAL | `needs_review` | Labor total mismatch |
| Blank deliverable and TOTAL &gt; 0 | `needs_review` | Missing deliverable |
| Otherwise | `valid` | (empty) |

**Import page behavior:**

- Select **Civil Str** worksheet → show Civil/Structural line items only
- Other worksheets → line items panel cleared (no PM Est items shown)

## Extraction rules (PM Est — deferred)

PM Est parsing is implemented in `eichleay-pm-est-extractor.js` but **not wired** on the import page for Milestone 3A.

## Sample fixture

```bash
pip install openpyxl
python3 scripts/generate-pse-fixture.py
```

The fixture includes a **Civil Str** sheet with section headers and sample labor rows.

## Script load order (import.html)

```html
<script src="./app/shared/excel-reader.js"></script>
<script src="./app/shared/estimate-line-item-schema.js"></script>
<script src="./app/estimate-import/workbook-reader.js"></script>
<script src="./app/estimate-import/eichleay-template-detector.js"></script>
<script src="./app/estimate-import/eichleay-pm-est-extractor.js"></script>
<script src="./app/estimate-import/eichleay-civil-str-extractor.js"></script>
<script src="./app/estimate-import/workbook-reader-ui.js"></script>
```

## Next step

Additional discipline extractors (Process, Pipe Eng, etc.) and schedule builder consumption (future milestones).

## Related

- [estimate-import-engine.md](./estimate-import-engine.md)
- Schedule app: [index.html](../index.html)
