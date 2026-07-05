/**
 * Eichleay Civil Str Extractor — Milestone 3A
 *
 * Extracts Estimate Line Items from the Civil Str sheet only.
 * No PM Est, Summary, or other discipline tabs. No activities.
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
  var DISCIPLINE = 'Civil/Structural';
  var SHEET_PATTERNS = [/^civil\s*str$/i, /^civil\s*\/\s*str$/i];
  var HEADER_SCAN = 50;
  var LABOR_TOLERANCE = 0.01;
  var TEMPLATE_NAME = EichleayDetector ? EichleayDetector.TEMPLATE_NAME : 'Eichleay PSE';
  var TEMPLATE_VERSION = EichleayDetector ? EichleayDetector.TEMPLATE_VERSION : 'old';

  var SKIP_ROW_PATTERNS = [
    /^project control$/i,
    /^procurement$/i,
    /^construction support$/i,
    /^life science$/i,
    /^avg\.?\s*rate$/i,
    /^weeks$/i,
    /% of eng/i,
    /tic\s*%/i,
    /\btot\b/i,
    /^ftes?$/i,
    /ratio/i,
    /^subtotal$/i,
    /^sub\s*total$/i,
    /^total$/i,
    /^grand total$/i,
    /^sum$/i,
  ];

  var ORANGE_RGB = [
    'ffc000', 'ffa500', 'ed7d31', 'f79646', 'fabf8f', 'fcd5b4', 'ff9900', 'e97132',
  ];

  function normalizeHeader(value) {
    return ExcelReader.cellText(value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isCivilStrSheetName(sheetName) {
    var name = String(sheetName || '').trim();
    for (var i = 0; i < SHEET_PATTERNS.length; i++) {
      if (SHEET_PATTERNS[i].test(name)) return true;
    }
    return false;
  }

  function findCivilStrSheetName(sheetNames) {
    for (var i = 0; i < sheetNames.length; i++) {
      if (isCivilStrSheetName(sheetNames[i])) return sheetNames[i];
    }
    return null;
  }

  function getRows(session, sheetName) {
    if (WorkbookReader && WorkbookReader.getSheetRows) {
      return WorkbookReader.getSheetRows(session, sheetName);
    }
    return ExcelReader.sheetToRows(session.workbook, sheetName);
  }

  function getSheetCell(session, sheetName, rowIndex, colIndex) {
    if (!session || !session.workbook || colIndex < 0) return null;
    var sheet = session.workbook.Sheets[sheetName];
    if (!sheet || !global.XLSX) return null;
    var addr = global.XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
    return sheet[addr] || null;
  }

  function rgbFromFill(cell) {
    if (!cell || !cell.s) return '';
    var fill = cell.s.fill || cell.s.patternFill;
    if (!fill) return '';
    var color = fill.fgColor || fill.bgColor || fill.fgRgb || fill.bgRgb;
    if (!color) return '';
    if (color.rgb) return String(color.rgb).replace(/^ff/i, '').toLowerCase().slice(-6);
    if (color.theme != null) return '';
    return '';
  }

  function isOrangeFill(cell) {
    var rgb = rgbFromFill(cell);
    if (!rgb || rgb.length < 6) return false;
    for (var i = 0; i < ORANGE_RGB.length; i++) {
      if (rgb.indexOf(ORANGE_RGB[i]) >= 0 || ORANGE_RGB[i].indexOf(rgb) >= 0) return true;
    }
    var r = parseInt(rgb.slice(0, 2), 16);
    var g = parseInt(rgb.slice(2, 4), 16);
    var b = parseInt(rgb.slice(4, 6), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false;
    return r > 180 && g > 80 && g < 200 && b < 120;
  }

  function isBlankRow(row) {
    return !(row || []).some(function (cell) {
      return ExcelReader.cellText(cell) !== '' || (typeof cell === 'number' && cell !== 0);
    });
  }

  function isSkipRowLabel(label) {
    var text = ExcelReader.cellText(label);
    if (!text) return false;
    for (var i = 0; i < SKIP_ROW_PATTERNS.length; i++) {
      if (SKIP_ROW_PATTERNS[i].test(text)) return true;
    }
    return false;
  }

  function mapCivilStrColumns(headerRow) {
    var map = {
      deliverable: -1,
      qty: -1,
      unit: -1,
      engr: -1,
      design: -1,
      hveEngr: -1,
      hveDesign: -1,
      total: -1,
    };

    (headerRow || []).forEach(function (cell, index) {
      var h = normalizeHeader(cell);
      if (!h) return;
      if (map.deliverable < 0 && (
        /short form.*task description/.test(h)
        || /^task description$/.test(h)
        || /^deliverable$/.test(h)
        || /^description$/.test(h)
        || /work item/.test(h)
      )) {
        map.deliverable = index;
      } else if (map.qty < 0 && /^qty$|^quantity$|^#/.test(h)) {
        map.qty = index;
      } else if (map.unit < 0 && /^unit$|^uom$/.test(h)) {
        map.unit = index;
      } else if (map.engr < 0 && (/^engr hrs$/.test(h) || (/\bengr\b/.test(h) && /hrs|hours/.test(h) && h.indexOf('hve') < 0))) {
        map.engr = index;
      } else if (map.design < 0 && (/^design hrs$/.test(h) || (/\bdesign\b/.test(h) && /hrs|hours/.test(h) && h.indexOf('hve') < 0))) {
        map.design = index;
      } else if (map.hveEngr < 0 && /hve.*engr|engr.*hve/.test(h)) {
        map.hveEngr = index;
      } else if (map.hveDesign < 0 && /hve.*design|design.*hve/.test(h)) {
        map.hveDesign = index;
      } else if (map.total < 0 && (/^total$/.test(h) || /^total hrs$/.test(h) || /^total hours$/.test(h))) {
        map.total = index;
      }
    });

    if (map.deliverable < 0) {
      (headerRow || []).some(function (cell, index) {
        var h = normalizeHeader(cell);
        if (h && /description|deliverable|task/.test(h)) {
          map.deliverable = index;
          return true;
        }
        return false;
      });
    }
    if (map.deliverable < 0) map.deliverable = 0;
    return map;
  }

  function findHeaderRowIndex(rows) {
    var best = { rowIndex: -1, map: null, score: 0 };
    for (var r = 0; r < Math.min(rows.length, HEADER_SCAN); r++) {
      var row = rows[r] || [];
      var map = mapCivilStrColumns(row);
      var score = 0;
      if (map.engr >= 0) score += 3;
      if (map.design >= 0) score += 3;
      if (map.total >= 0) score += 4;
      if (map.hveEngr >= 0) score += 2;
      if (map.hveDesign >= 0) score += 2;
      if (map.deliverable >= 0) score += 2;
      if (score > best.score) best = { rowIndex: r, map: map, score: score };
    }
    if (best.score < 6) return { rowIndex: -1, map: null, score: 0 };
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

  function rowLaborSum(row, colMap) {
    return (readNumber(row, colMap.engr) || 0)
      + (readNumber(row, colMap.design) || 0)
      + (readNumber(row, colMap.hveEngr) || 0)
      + (readNumber(row, colMap.hveDesign) || 0);
  }

  function isSectionHeaderRow(session, sheetName, rowIndex, raw, colMap, deliverable) {
    if (!deliverable || isSkipRowLabel(deliverable)) return false;

    var deliverableCell = getSheetCell(session, sheetName, rowIndex, colMap.deliverable);
    if (deliverableCell && isOrangeFill(deliverableCell)) return true;

    var totalHours = readNumber(raw, colMap.total);
    if (totalHours != null && totalHours > 0) return false;
    if (rowLaborSum(raw, colMap) > 0) return false;

    var qty = readNumber(raw, colMap.qty);
    if (qty != null && qty > 0) return false;

    return true;
  }

  function buildValidation(deliverable, engineerHours, designerHours, hveHours, totalHours) {
    var reviewReason = '';
    var validationStatus = VS.VALID;
    var sum = engineerHours + designerHours + hveHours;

    if (Math.abs(sum - totalHours) > LABOR_TOLERANCE) {
      validationStatus = VS.NEEDS_REVIEW;
      reviewReason = 'Labor total mismatch';
    }
    if (!deliverable && totalHours > 0) {
      validationStatus = VS.NEEDS_REVIEW;
      reviewReason = reviewReason ? reviewReason + '; Missing deliverable' : 'Missing deliverable';
    }

    return { validationStatus: validationStatus, reviewReason: reviewReason };
  }

  /**
   * @param {object} session
   * @param {{ sheetName?: string, templateName?: string, templateVersion?: string }} [meta]
   */
  function extractCivilStrLineItems(session, meta) {
    meta = meta || {};
    if (!session || !session.workbook) {
      throw new Error('No workbook session available for extraction.');
    }

    var sheetName = meta.sheetName || findCivilStrSheetName(session.sheetNames || []);
    if (!sheetName) throw new Error('Civil Str sheet not found in workbook.');
    if (!isCivilStrSheetName(sheetName)) {
      throw new Error('Extraction limited to Civil Str worksheet.');
    }

    var rows = getRows(session, sheetName);
    var header = findHeaderRowIndex(rows);
    if (header.rowIndex < 0 || !header.map) {
      throw new Error('Could not identify Civil Str header row (ENGR HRS / DESIGN HRS / TOTAL).');
    }

    var colMap = header.map;
    var sourceFile = session.fileName || '';
    var templateName = meta.templateName || TEMPLATE_NAME;
    var templateVersion = meta.templateVersion || TEMPLATE_VERSION;
    var lineItems = [];
    var needsReviewCount = 0;
    var currentSection = '';

    for (var r = header.rowIndex + 1; r < rows.length; r++) {
      var raw = rows[r] || [];
      if (isBlankRow(raw)) continue;

      var deliverable = readText(raw, colMap.deliverable);
      if (isSkipRowLabel(deliverable)) continue;

      if (isSectionHeaderRow(session, sheetName, r, raw, colMap, deliverable)) {
        currentSection = deliverable;
        continue;
      }

      var totalHours = readNumber(raw, colMap.total);
      if (totalHours == null || totalHours <= 0) continue;

      var engineerHours = readNumber(raw, colMap.engr) || 0;
      var designerHours = readNumber(raw, colMap.design) || 0;
      var hveHours = (readNumber(raw, colMap.hveEngr) || 0) + (readNumber(raw, colMap.hveDesign) || 0);
      var qty = readNumber(raw, colMap.qty);
      var unit = readText(raw, colMap.unit);

      var validation = buildValidation(deliverable, engineerHours, designerHours, hveHours, totalHours);
      if (validation.validationStatus === VS.NEEDS_REVIEW) needsReviewCount += 1;

      lineItems.push(LineItemSchema.createEstimateLineItem({
        discipline: DISCIPLINE,
        estimateSection: currentSection,
        deliverable: deliverable,
        qty: qty != null ? qty : 0,
        unit: unit,
        engineerHours: engineerHours,
        designerHours: designerHours,
        hveHours: hveHours,
        totalHours: totalHours,
        notes: '',
        validationStatus: validation.validationStatus,
        reviewReason: validation.reviewReason,
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

  NS.EichleayCivilStrExtractor = {
    DISCIPLINE: DISCIPLINE,
    SHEET_PATTERNS: SHEET_PATTERNS,
    isCivilStrSheetName: isCivilStrSheetName,
    findCivilStrSheetName: findCivilStrSheetName,
    extractCivilStrLineItems: extractCivilStrLineItems,
    mapCivilStrColumns: mapCivilStrColumns,
  };
})(typeof window !== 'undefined' ? window : global);
