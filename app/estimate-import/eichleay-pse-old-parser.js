/**
 * Eichleay PSE (legacy) estimate template parser — v1
 *
 * Parses Excel workbooks matching the legacy Project Services Estimate layout.
 * Project 1830 is the reference sample; rules are version-scoped, not project-scoped.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var Schema = NS.StandardImportSchema;
  var TemplateManager = NS.TemplateManager;
  var ExcelReader = NS.ExcelReader;

  if (!Schema || !TemplateManager || !ExcelReader) {
    throw new Error('standard-import-schema, template-manager, and excel-reader must load first.');
  }

  var TEMPLATE_ID = 'eichleay-pse-old';
  var TEMPLATE_LABEL = 'Eichleay PSE (Legacy)';
  var TEMPLATE_VERSION = '1';

  var SKIP_SHEET = /^(cover|summary|instructions|lookup|index|contents|revision|log|sheet1)$/i;

  /** Version 1 column header aliases — update when Excel layout changes (add v2 parser file). */
  var COLUMN_ALIASES = {
    discipline: ['discipline', 'disc', 'engineering discipline', 'eng discipline'],
    estimateDeliverable: [
      'deliverable', 'estimate deliverable', 'pse deliverable', 'task', 'scope item',
      'deliverable / task', 'work item',
    ],
    activityName: ['activity', 'activity name', 'activity description', 'description', 'line item'],
    qty: ['qty', 'quantity', '#', 'count'],
    engineerHours: ['engineer', 'engr hrs', 'engineer hrs', 'engineering hrs', 'eng hrs', 'engineer hours', 'engr hours'],
    designerHours: ['designer', 'design hrs', 'designer hrs', 'dsgn hrs', 'design hours'],
    checkerHours: ['checker', 'check hrs', 'checker hrs', 'review hrs', 'check hours'],
    pmHours: ['pm hrs', 'pm hours', 'project management', 'pm', 'proj mgmt'],
    totalHours: ['total hrs', 'total hours', 'total', 'hours total', 'total manhours'],
    notes: ['notes', 'comments', 'remarks', 'note'],
  };

  function resolveWorkbook(input) {
    if (input.workbook) return Promise.resolve(input.workbook);
    if (input.file instanceof File) {
      return ExcelReader.readWorkbookFromFile(input.file).then(function (payload) {
        input.sourceFile = input.sourceFile || payload.fileName;
        return payload.workbook;
      });
    }
    if (input.file && (input.file instanceof ArrayBuffer || input.file.byteLength != null)) {
      return Promise.resolve(ExcelReader.readWorkbookFromArrayBuffer(input.file));
    }
    return Promise.reject(new Error('Eichleay PSE parser requires input.file (File or ArrayBuffer) or input.workbook.'));
  }

  function findHeaderOnSheet(rows) {
    var detector = NS.TemplateDetector;
    if (detector && detector.findHeaderRow) {
      return detector.findHeaderRow(rows, COLUMN_ALIASES);
    }
    return { rowIndex: -1, map: {}, score: 0 };
  }

  function deriveActivityName(deliverable, activityName, discipline) {
    if (activityName) return activityName;
    if (deliverable) return 'Develop - ' + deliverable;
    if (discipline) return 'Develop - ' + discipline + ' Item';
    return '';
  }

  function rowHasData(fields) {
    return !!(fields.discipline || fields.estimateDeliverable || fields.activityName
      || fields.engineerHours || fields.designerHours || fields.checkerHours
      || fields.pmHours || fields.totalHours);
  }

  function parseSheetRows(options) {
    var rows = options.rows;
    var sheetName = options.sheetName;
    var projectId = options.projectId;
    var sourceFile = options.sourceFile;
    var header = findHeaderOnSheet(rows);
    if (header.rowIndex < 0) return [];

    var map = header.map;
    var out = [];
    var carryDiscipline = '';

    for (var r = header.rowIndex + 1; r < rows.length; r++) {
      var raw = rows[r] || [];
      var discipline = map.discipline != null
        ? ExcelReader.cellText(raw[map.discipline])
        : carryDiscipline;
      if (discipline) carryDiscipline = discipline;

      var estimateDeliverable = map.estimateDeliverable != null
        ? ExcelReader.cellText(raw[map.estimateDeliverable]) : '';
      var activityName = map.activityName != null
        ? ExcelReader.cellText(raw[map.activityName]) : '';
      var qty = map.qty != null ? ExcelReader.cellNumber(raw[map.qty]) : 0;
      var engineerHours = map.engineerHours != null ? ExcelReader.cellNumber(raw[map.engineerHours]) : 0;
      var designerHours = map.designerHours != null ? ExcelReader.cellNumber(raw[map.designerHours]) : 0;
      var checkerHours = map.checkerHours != null ? ExcelReader.cellNumber(raw[map.checkerHours]) : 0;
      var pmHours = map.pmHours != null ? ExcelReader.cellNumber(raw[map.pmHours]) : 0;
      var totalHours = map.totalHours != null ? ExcelReader.cellNumber(raw[map.totalHours]) : 0;
      var notes = map.notes != null ? ExcelReader.cellText(raw[map.notes]) : '';

      var fields = {
        discipline: discipline,
        estimateDeliverable: estimateDeliverable,
        activityName: deriveActivityName(estimateDeliverable, activityName, discipline),
        qty: qty,
        engineerHours: engineerHours,
        designerHours: designerHours,
        checkerHours: checkerHours,
        pmHours: pmHours,
        totalHours: totalHours,
        notes: notes,
      };

      if (!rowHasData(fields)) continue;

      var lowerDeliverable = estimateDeliverable.toLowerCase();
      if (/^total|^subtotal|^grand total/.test(lowerDeliverable)) continue;

      out.push(Schema.createStandardImportRow({
        projectId: projectId,
        sourceFile: sourceFile,
        templateName: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
        sheetName: sheetName,
        rowNumber: r + 1,
        discipline: fields.discipline,
        estimateDeliverable: fields.estimateDeliverable,
        deliverable: fields.estimateDeliverable,
        activityName: fields.activityName,
        qty: fields.qty,
        engineerHours: fields.engineerHours,
        designerHours: fields.designerHours,
        checkerHours: fields.checkerHours,
        pmHours: fields.pmHours,
        totalHours: fields.totalHours,
        notes: fields.notes,
        mappingStatus: Schema.MAPPING_STATUS.UNMAPPED,
      }));
    }
    return out;
  }

  /**
   * @param {import('./template-manager.js').ParseEstimateInput} input
   * @returns {Promise<import('../shared/standard-import-schema.js').StandardImportBatch>}
   */
  function parseEichleayPseOld(input) {
    input = input || {};
    return resolveWorkbook(input).then(function (workbook) {
      var sourceFile = input.sourceFile || '';
      var projectId = input.projectId || ExcelReader.guessProjectIdFromFileName(sourceFile);
      if (!projectId) {
        var detector = NS.TemplateDetector;
        if (detector) {
          projectId = detector.guessProjectIdFromWorkbook(workbook, sourceFile);
        }
      }

      var sheetNames = workbook.SheetNames || [];
      var detectionSheets = input.options && input.options.sheetMatches;
      var targets = [];

      if (detectionSheets && detectionSheets.length) {
        detectionSheets.forEach(function (m) { targets.push(m.sheetName); });
      } else {
        sheetNames.forEach(function (name) {
          if (!SKIP_SHEET.test(name.trim())) targets.push(name);
        });
      }

      var allRows = [];
      targets.forEach(function (sheetName) {
        var rows = ExcelReader.sheetToRows(workbook, sheetName);
        var parsed = parseSheetRows({
          rows: rows,
          sheetName: sheetName,
          projectId: projectId,
          sourceFile: sourceFile,
        });
        allRows = allRows.concat(parsed);
      });

      if (!allRows.length && input.options && input.options.includeStubSample) {
        allRows.push(Schema.createStandardImportRow({
          projectId: projectId,
          sourceFile: sourceFile,
          templateName: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
          sheetName: '',
          rowNumber: 0,
          discipline: 'Project Services',
          estimateDeliverable: 'Project Services Estimate (PSE)',
          deliverable: 'Project Services Estimate (PSE)',
          activityName: 'Develop - Project Services Estimate (PSE)',
          qty: 1,
          engineerHours: 8,
          designerHours: 4,
          checkerHours: 2,
          pmHours: 1,
          totalHours: 15,
          notes: 'Stub row — no parseable data sheets found',
          mappingStatus: Schema.MAPPING_STATUS.UNMAPPED,
        }));
      }

      return Schema.createStandardImportBatch({
        projectId: projectId,
        sourceFile: sourceFile,
        templateName: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
      }, allRows);
    });
  }

  TemplateManager.registerTemplateParser({
    id: TEMPLATE_ID,
    label: TEMPLATE_LABEL,
    description: 'Legacy Eichleay Project Services Estimate (PSE) Excel layout — v1 column rules.',
    version: TEMPLATE_VERSION,
    parse: parseEichleayPseOld,
  });

  NS.EichleayPseOldParser = {
    TEMPLATE_ID: TEMPLATE_ID,
    TEMPLATE_LABEL: TEMPLATE_LABEL,
    TEMPLATE_VERSION: TEMPLATE_VERSION,
    COLUMN_ALIASES: COLUMN_ALIASES,
    parse: parseEichleayPseOld,
    parseSheetRows: parseSheetRows,
  };
})(typeof window !== 'undefined' ? window : global);
