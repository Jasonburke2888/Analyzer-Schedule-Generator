/**
 * Eichleay PM Est Extractor
 *
 * Extracts Estimate Line Items from the PM Est sheet only.
 * Estimate is source of truth — no activities, no deliverable renaming.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var LineItemSchema = NS.EstimateLineItemSchema;
  var ExcelReader = NS.ExcelReader;
  var WorkbookReader = NS.WorkbookReader;
  var EichleayDetector = NS.EichleayTemplateDetector;

  if (!LineItemSchema || !ExcelReader) {
    throw new Error('estimate-line-item-schema.js and excel-reader.js must load first.');
  }

  var VS = LineItemSchema.VALIDATION_STATUS;
  var SHEET_PATTERNS = [/^pm\s*est$/i, /\bpm\s*est\b/i];
  var HEADER_SCAN = 30;
  var TEMPLATE_NAME = EichleayDetector ? EichleayDetector.TEMPLATE_NAME : 'Eichleay PSE';
  var TEMPLATE_VERSION = EichleayDetector ? EichleayDetector.TEMPLATE_VERSION : 'old';

  function normalizeHeader(value) {
    return ExcelReader.cellText(value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function findPmEstSheetName(sheetNames) {
    for (var i = 0; i < sheetNames.length; i++) {
      var name = sheetNames[i];
      for (var p = 0; p < SHEET_PATTERNS.length; p++) {
        if (SHEET_PATTERNS[p].test(name.trim())) return name;
      }
    }
    return null;
  }

  function getRows(session, sheetName) {
    if (WorkbookReader && WorkbookReader.getSheetRows) {
      return WorkbookReader.getSheetRows(session, sheetName);
    }
    return ExcelReader.sheetToRows(session.workbook, sheetName);
  }

  function isBlankRow(row) {
    return !(row || []).some(function (cell) {
      return ExcelReader.cellText(cell) !== '' || (typeof cell === 'number' && cell !== 0);
    });
  }

  function isTotalOrHeaderRow(label) {
    var lower = (label || '').toLowerCase().trim();
    if (!lower) return true;
    return /^(total|subtotal|grand total|sum|header|deliverable|description|notes)$/i.test(lower);
  }

  function mapPmEstColumns(headerRow) {
    var map = {
      deliverable: -1,
      discipline: -1,
      section: -1,
      qty: -1,
      unit: -1,
      engineer: -1,
      designer: -1,
      hve: -1,
      total: -1,
      notes: -1,
      felPhases: [],
    };

    (headerRow || []).forEach(function (cell, index) {
      var h = normalizeHeader(cell);
      if (!h) return;
      if (map.deliverable < 0 && /deliverable|description|task|scope|line item/.test(h)) {
        map.deliverable = index;
      } else if (map.discipline < 0 && /^discipline$|^disc$/.test(h)) {
        map.discipline = index;
      } else if (map.section < 0 && /section|category|group|phase type|estimate section/.test(h)) {
        map.section = index;
      } else if (map.qty < 0 && /^qty$|^quantity$|^#/.test(h)) {
        map.qty = index;
      } else if (map.unit < 0 && /^unit$|^uom$/.test(h)) {
        map.unit = index;
      } else if (map.engineer < 0 && /engineer|engr|\beng\b/.test(h) && (/hrs|hours|hour/.test(h) || h.indexOf('hr') >= 0)) {
        map.engineer = index;
      } else if (map.designer < 0 && /designer|dsgn|design/.test(h) && (/hrs|hours|hour/.test(h) || h.indexOf('hr') >= 0)) {
        map.designer = index;
      } else if (map.hve < 0 && /\bhve\b|checker|check hrs|review hrs|verification/.test(h)) {
        map.hve = index;
      } else if (map.total < 0 && /^total|total hrs|total hours|hours total/.test(h)) {
        map.total = index;
      } else if (map.notes < 0 && /notes|comments|remarks/.test(h)) {
        map.notes = index;
      } else if (/fel\s*[- ]?\s*[1-4]/i.test(h) || /^fel[1-4]$/i.test(h.replace(/\s/g, ''))) {
        map.felPhases.push({ index: index, label: ExcelReader.cellText(cell) });
      }
    });

    if (map.deliverable < 0) map.deliverable = 0;
    return map;
  }

  function findHeaderRowIndex(rows) {
    var best = { rowIndex: -1, map: null, score: 0 };
    for (var r = 0; r < Math.min(rows.length, HEADER_SCAN); r++) {
      var row = rows[r] || [];
      var map = mapPmEstColumns(row);
      var score = 0;
      if (map.deliverable >= 0) score += 2;
      if (map.felPhases.length) score += map.felPhases.length;
      if (map.engineer >= 0) score += 1;
      if (map.designer >= 0) score += 1;
      if (map.hve >= 0) score += 1;
      if (map.total >= 0) score += 1;
      if (score > best.score) best = { rowIndex: r, map: map, score: score };
    }
    return best;
  }

  function readNumber(row, colIndex) {
    if (colIndex < 0 || !row) return null;
    var val = row[colIndex];
    if (val === '' || val == null) return null;
    var n = ExcelReader.cellNumber(val);
    return Number.isFinite(n) ? n : null;
  }

  function readText(row, colIndex) {
    if (colIndex < 0 || !row) return '';
    return ExcelReader.cellText(row[colIndex]);
  }

  function resolveEstimateSection(sheetName, sectionCol, felValues) {
    if (sectionCol) return sectionCol;
    if (felValues.length === 1) return felValues[0].label;
    return sheetName;
  }

  function buildValidationStatus(flags) {
    return flags.length ? VS.NEEDS_REVIEW : VS.VALID;
  }

  /**
   * @param {object} session
   * @param {{ templateName?: string, templateVersion?: string }} [meta]
   */
  function extractPmEstLineItems(session, meta) {
    meta = meta || {};
    if (!session || !session.workbook) {
      throw new Error('No workbook session available for extraction.');
    }

    var sheetName = findPmEstSheetName(session.sheetNames || []);
    if (!sheetName) throw new Error('PM Est sheet not found in workbook.');

    var rows = getRows(session, sheetName);
    var header = findHeaderRowIndex(rows);
    if (header.rowIndex < 0 || !header.map) {
      throw new Error('Could not identify PM Est header row.');
    }

    var colMap = header.map;
    var sourceFile = session.fileName || '';
    var templateName = meta.templateName || TEMPLATE_NAME;
    var templateVersion = meta.templateVersion || TEMPLATE_VERSION;
    var lineItems = [];
    var needsReviewCount = 0;

    for (var r = header.rowIndex + 1; r < rows.length; r++) {
      var raw = rows[r] || [];
      if (isBlankRow(raw)) continue;

      var deliverable = readText(raw, colMap.deliverable);
      if (!deliverable || isTotalOrHeaderRow(deliverable)) continue;

      var discipline = readText(raw, colMap.discipline);
      var sectionCol = readText(raw, colMap.section);
      var qty = readNumber(raw, colMap.qty);
      var unit = readText(raw, colMap.unit);
      var engineerHours = readNumber(raw, colMap.engineer);
      var designerHours = readNumber(raw, colMap.designer);
      var hveHours = readNumber(raw, colMap.hve);
      var explicitTotal = readNumber(raw, colMap.total);
      var notes = readText(raw, colMap.notes);

      var felValues = [];
      colMap.felPhases.forEach(function (phase) {
        var hrs = readNumber(raw, phase.index);
        if (hrs != null && hrs > 0) felValues.push({ label: phase.label, hours: hrs });
      });

      var totalHours = explicitTotal != null ? explicitTotal : null;
      if (totalHours == null && felValues.length) {
        totalHours = felValues.reduce(function (sum, item) { return sum + item.hours; }, 0);
      }
      if (totalHours == null && (engineerHours != null || designerHours != null || hveHours != null)) {
        totalHours = (engineerHours || 0) + (designerHours || 0) + (hveHours || 0);
      }

      var validationFlags = [];
      if (!discipline) validationFlags.push('discipline missing');
      if (totalHours == null || totalHours <= 0) validationFlags.push('hours not identified');
      if (felValues.length > 1) validationFlags.push('multiple FEL columns — verify total');

      var itemNotes = notes;
      if (felValues.length && !colMap.engineer && !colMap.total) {
        var felDetail = felValues.map(function (f) { return f.label + ': ' + f.hours; }).join('; ');
        itemNotes = itemNotes ? itemNotes + ' | ' + felDetail : felDetail;
      }

      var validationStatus = buildValidationStatus(validationFlags);
      if (validationStatus === VS.NEEDS_REVIEW) needsReviewCount += 1;

      lineItems.push(LineItemSchema.createEstimateLineItem({
        discipline: discipline,
        estimateSection: resolveEstimateSection(sheetName, sectionCol, felValues),
        deliverable: deliverable,
        qty: qty != null ? qty : 0,
        unit: unit,
        engineerHours: engineerHours != null ? engineerHours : 0,
        designerHours: designerHours != null ? designerHours : 0,
        hveHours: hveHours != null ? hveHours : 0,
        totalHours: totalHours != null ? totalHours : 0,
        notes: itemNotes,
        validationStatus: validationStatus,
      }));
    }

    var batch = LineItemSchema.createEstimateLineItemBatch({
      sourceFile: sourceFile,
      templateName: templateName,
      templateVersion: templateVersion,
      sheetName: sheetName,
    }, lineItems);

    return {
      batch: batch,
      items: lineItems,
      sheetName: sheetName,
      rowCount: lineItems.length,
      needsReviewCount: needsReviewCount,
    };
  }

  NS.EichleayPmEstExtractor = {
    SHEET_PATTERNS: SHEET_PATTERNS,
    extractPmEstLineItems: extractPmEstLineItems,
    extractPmEstRows: extractPmEstLineItems,
    findPmEstSheetName: findPmEstSheetName,
    mapPmEstColumns: mapPmEstColumns,
  };
})(typeof window !== 'undefined' ? window : global);
