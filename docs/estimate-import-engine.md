# Estimate Import Engine (V3.0 Skeleton)

Architecture for importing Excel / PSE estimate data into the Analyzer Schedule Generator without replacing the existing V2.8 schedule workflow.

## Pipeline

```
Estimate Excel
    → Template Parser (template-manager + format-specific parser)
    → Standard Import Rows (standard-import-schema)
    → Mapping Review (import-review)
    → Resource Loader (resource-loader)
    → Schedule Activities (js/app.js — future integration)
    → P6 Export (existing CSV / future P6 path)
```

## Module map

| Path | Role |
|------|------|
| `app/shared/standard-import-schema.js` | Canonical row/batch shape, validation, factories |
| `app/estimate-import/template-manager.js` | Register and dispatch template parsers |
| `app/estimate-import/eichleay-pse-old-parser.js` | Stub parser for legacy Eichleay PSE Excel |
| `app/estimate-import/import-review.js` | Review state, row updates, readiness for loader |
| `app/resource-loader/resource-loader.js` | Standard rows → schedule activity candidates |
| `app/database/schema.js` | V3 logical table definitions and record factories |
| `app/database/project-db.js` | In-memory store + import→schedule DB helpers |

See also [v3-database-schema.md](./v3-database-schema.md).

## Standard import row

Every parser must output rows in this shape:

```json
{
  "projectId": "",
  "sourceFile": "",
  "templateName": "",
  "discipline": "",
  "deliverable": "",
  "activityName": "",
  "qty": 0,
  "engineerHours": 0,
  "designerHours": 0,
  "checkerHours": 0,
  "pmHours": 0,
  "totalHours": 0,
  "notes": "",
  "mappingStatus": "unmapped"
}
```

`mappingStatus` values: `unmapped`, `partial`, `mapped`, `skipped`, `error`.

Batch wrapper (`createStandardImportBatch`):

```json
{
  "format": "analyzer-schedule-standard-import",
  "schemaVersion": 1,
  "importedAt": "ISO-8601",
  "projectId": "",
  "sourceFile": "",
  "templateName": "",
  "rows": []
}
```

## Loading order (when integrated)

```html
<script src="./app/shared/standard-import-schema.js"></script>
<script src="./app/estimate-import/template-manager.js"></script>
<script src="./app/estimate-import/eichleay-pse-old-parser.js"></script>
<script src="./app/estimate-import/import-review.js"></script>
<script src="./app/resource-loader/resource-loader.js"></script>
<script src="./js/app.js"></script>
```

**V3.0:** These scripts are **not** linked from `index.html` yet. The live app (`index.html` + `js/app.js`) is unchanged.

## Stub usage (browser console)

After loading scripts in order:

```javascript
AnalyzerSchedule.TemplateManager.parseWithTemplate('eichleay-pse-old', {
  projectId: '1517',
  sourceFile: 'sample.xlsx',
  options: { includeStubSample: true },
}).then(function (batch) {
  var review = AnalyzerSchedule.ImportReview.createReviewState(batch);
  var ready = AnalyzerSchedule.ImportReview.getRowsReadyForLoader(review);
  return AnalyzerSchedule.ResourceLoader.loadResourcesFromImportRows(ready, { requireMapped: false });
});
```

## V3.0 scope (this release)

- [x] Standard schema and validation
- [x] Template registry and stub Eichleay PSE parser
- [x] Import review helpers (no UI)
- [x] Resource loader → activity **candidates** (no merge into grid)
- [ ] Excel binary parsing (SheetJS or server-side — TBD)
- [ ] Mapping Review UI
- [ ] Apply candidates to `js/app.js` activities
- [ ] P6-specific export from imported resources

## SharePoint / project files

Portable project JSON (V2.8) remains the schedule system of record. Future estimate imports will produce a separate import batch JSON (or embedded section in project file) that Resource Loader merges after Mapping Review approval.

## Related

- Schedule app entry: `index.html`, `js/app.js`
- Template seed data: `data/activities.csv`
- Offline bundle: `standalone.html` (regenerate with `node scripts/build-standalone.js`)
