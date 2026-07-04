/**
 * Eichleay PSE Template Detector — Sprint 2
 *
 * Detects whether a workbook matches the legacy Eichleay PSE layout.
 * Uses WorkbookReader session output only — no hour parsing, no activities.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var ExcelReader = NS.ExcelReader;
  var WorkbookReader = NS.WorkbookReader;

  if (!ExcelReader) {
    throw new Error('excel-reader.js must load before eichleay-template-detector.js');
  }

  var TEMPLATE_NAME = 'Eichleay PSE';
  var TEMPLATE_VERSION = 'old';
  var MATCH_THRESHOLD = 55;

  /**
   * Expected Eichleay PSE workbook sheets (flexible name matching).
   * @type {{ label: string, patterns: RegExp[] }[]}
   */
  var EXPECTED_SHEETS = [
    { label: 'PM Est', patterns: [/^pm\s*est$/i, /\bpm\s*est\b/i] },
    { label: 'Summary', patterns: [/^summary$/i] },
    { label: 'Process', patterns: [/^process$/i] },
    { label: 'Pipe Eng', patterns: [/pipe\s*eng/i] },
    { label: 'Pipe Des', patterns: [/pipe\s*des/i] },
    { label: 'Elect', patterns: [/^elect$/i, /^electrical$/i] },
    { label: 'I&C', patterns: [/i&c/i, /i\s*&\s*c/i, /^ic$/i] },
    { label: 'Sched', patterns: [/^sched$/i, /^schedule$/i] },
    { label: 'Staff Plan', patterns: [/staff\s*plan/i] },
    { label: 'Dates', patterns: [/^dates$/i] },
  ];

  var DISCIPLINE_SHEET_PATTERNS = [
    /^process$/i, /pipe\s*eng/i, /pipe\s*des/i, /^elect$/i, /^electrical$/i,
    /i&c/i, /mech/i, /civil/i, /struct/i, /pmac/i, /project services/i,
  ];

  function normalizeSheetName(name) {
    return String(name || '').trim();
  }

  function sheetMatchesPattern(sheetName, patterns) {
    var n = normalizeSheetName(sheetName);
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(n)) return true;
    }
    return false;
  }

  function findSheetByPatterns(sheetNames, patterns) {
    for (var i = 0; i < sheetNames.length; i++) {
      if (sheetMatchesPattern(sheetNames[i], patterns)) return sheetNames[i];
    }
    return null;
  }

  function getRows(session, sheetName) {
    if (WorkbookReader && WorkbookReader.getSheetRows) {
      return WorkbookReader.getSheetRows(session, sheetName);
    }
    return ExcelReader.sheetToRows(session.workbook, sheetName);
  }

  function rowsContainFelPhaseColumns(rows) {
    var maxScan = Math.min(rows.length, 20);
    for (var r = 0; r < maxScan; r++) {
      var row = rows[r] || [];
      for (var c = 0; c < row.length; c++) {
        var text = ExcelReader.cellText(row[c]);
        if (/fel\s*[- ]?\s*[1-4]/i.test(text)) return true;
        if (/fel\s*[1-4]/i.test(text.replace(/\s/g, ''))) return true;
      }
    }
    return false;
  }

  function sheetHasHourStructure(rows) {
    var detectFn = WorkbookReader && WorkbookReader.detectColumnHeaders
      ? WorkbookReader.detectColumnHeaders
      : null;
    var headers = [];
    if (detectFn) {
      headers = detectFn(rows).headers;
    } else {
      var scan = Math.min(rows.length, 40);
      for (var r = 0; r < scan; r++) {
        var filled = (rows[r] || []).filter(function (cell) {
          return ExcelReader.cellText(cell);
        }).length;
        if (filled >= 3) {
          headers = (rows[r] || []).map(function (cell) {
            return ExcelReader.cellText(cell);
          });
          break;
        }
      }
    }

    if (!headers.length) return false;
    var joined = headers.join(' ').toLowerCase();
    var hasEngineering = /engineer|engr|\beng\b/.test(joined);
    var hasDesign = /design|dsgn|designer/.test(joined);
    var hasChecker = /check|review|checker/.test(joined);
    var hasHours = /hrs|hours|manhours|man-hours/.test(joined);
    return hasHours && ((hasEngineering && hasDesign) || (hasEngineering && hasChecker));
  }

  function isDisciplineSheet(sheetName) {
    return sheetMatchesPattern(sheetName, DISCIPLINE_SHEET_PATTERNS);
  }

  /**
   * @typedef {object} EichleayDetectionResult
   * @property {string|null} templateName
   * @property {string} templateVersion
   * @property {number} confidenceScore
   * @property {string[]} matchedSignals
   * @property {string[]} missingSignals
   * @property {boolean} isMatch
   */

  /**
   * @param {import('./workbook-reader.js').WorkbookSession} session
   * @returns {EichleayDetectionResult}
   */
  function detectEichleayPse(session) {
    var matchedSignals = [];
    var missingSignals = [];
    var score = 0;
    var maxScore = 0;

    if (!session || !session.workbook) {
      return {
        templateName: null,
        templateVersion: TEMPLATE_VERSION,
        confidenceScore: 0,
        matchedSignals: [],
        missingSignals: ['Workbook session not available'],
        isMatch: false,
      };
    }

    var sheetNames = session.sheetNames || [];

    EXPECTED_SHEETS.forEach(function (expected) {
      maxScore += 8;
      var found = findSheetByPatterns(sheetNames, expected.patterns);
      if (found) {
        score += 8;
        matchedSignals.push('Sheet: ' + expected.label + ' ("' + found + '")');
      } else {
        missingSignals.push('Sheet: ' + expected.label);
      }
    });

    maxScore += 15;
    var pmEstSheet = findSheetByPatterns(sheetNames, EXPECTED_SHEETS[0].patterns);
    if (pmEstSheet) {
      var pmRows = getRows(session, pmEstSheet);
      if (rowsContainFelPhaseColumns(pmRows)) {
        score += 15;
        matchedSignals.push('PM Est: FEL phase columns detected');
      } else {
        missingSignals.push('PM Est: FEL phase columns');
      }
    } else {
      missingSignals.push('PM Est: FEL phase columns (PM Est sheet missing)');
    }

    maxScore += 15;
    var disciplineMatches = [];
    sheetNames.forEach(function (name) {
      if (!isDisciplineSheet(name)) return;
      var rows = getRows(session, name);
      if (sheetHasHourStructure(rows)) {
        disciplineMatches.push(name);
      }
    });
    if (disciplineMatches.length >= 2) {
      score += 15;
      matchedSignals.push('Discipline sheets: engineering/design hour structure on '
        + disciplineMatches.length + ' sheet(s) (' + disciplineMatches.join(', ') + ')');
    } else if (disciplineMatches.length === 1) {
      score += 8;
      matchedSignals.push('Discipline sheet: hour structure on ' + disciplineMatches[0]);
      missingSignals.push('Discipline sheets: need hour structure on at least 2 discipline tabs');
    } else {
      missingSignals.push('Discipline sheets: engineering/design hour structure');
    }

    var confidenceScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    var isMatch = confidenceScore >= MATCH_THRESHOLD;

    return {
      templateName: isMatch ? TEMPLATE_NAME : null,
      templateVersion: TEMPLATE_VERSION,
      confidenceScore: confidenceScore,
      matchedSignals: matchedSignals,
      missingSignals: missingSignals,
      isMatch: isMatch,
    };
  }

  NS.EichleayTemplateDetector = {
    TEMPLATE_NAME: TEMPLATE_NAME,
    TEMPLATE_VERSION: TEMPLATE_VERSION,
    MATCH_THRESHOLD: MATCH_THRESHOLD,
    EXPECTED_SHEETS: EXPECTED_SHEETS,
    detectEichleayPse: detectEichleayPse,
  };
})(typeof window !== 'undefined' ? window : global);
