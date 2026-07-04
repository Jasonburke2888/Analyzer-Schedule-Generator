/**
 * Template Detector — fingerprint Excel workbooks to estimate template id/version.
 * Rules are isolated per template; 1830 sample workbooks use eichleay-pse-old v1.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var ExcelReader = NS.ExcelReader;

  if (!ExcelReader) {
    throw new Error('excel-reader.js must load before template-detector.js');
  }

  var SKIP_SHEET = /^(cover|summary|instructions|lookup|index|contents|revision|log)$/i;

  /**
   * @typedef {object} TemplateDetectionResult
   * @property {string|null} templateId
   * @property {string} templateVersion
   * @property {number} confidence 0–100
   * @property {string[]} reasons
   * @property {string} projectIdGuess
   * @property {string} sourceFile
   */

  /** @type {Record<string, { id: string, version: string, score: function }>} */
  var detectors = {};

  function normalizeHeader(value) {
    return ExcelReader.cellText(value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function findHeaderRow(rows, aliasGroups) {
    var best = { rowIndex: -1, map: {}, score: 0 };
    var maxScan = Math.min(rows.length, 40);
    for (var r = 0; r < maxScan; r++) {
      var row = rows[r] || [];
      var map = {};
      var score = 0;
      for (var c = 0; c < row.length; c++) {
        var header = normalizeHeader(row[c]);
        if (!header) continue;
        Object.keys(aliasGroups).forEach(function (field) {
          if (map[field] != null) return;
          var aliases = aliasGroups[field];
          for (var a = 0; a < aliases.length; a++) {
            if (header === aliases[a] || header.indexOf(aliases[a]) >= 0) {
              map[field] = c;
              score += 1;
              break;
            }
          }
        });
      }
      var hasDeliverable = map.estimateDeliverable != null || map.activityName != null;
      var hasHours = map.engineerHours != null || map.totalHours != null;
      if (hasDeliverable && hasHours && score > best.score) {
        best = { rowIndex: r, map: map, score: score };
      }
    }
    return best;
  }

  function scanWorkbookHeaders(workbook, aliasGroups) {
    var sheets = (workbook.SheetNames || []).filter(function (name) {
      return !SKIP_SHEET.test(name.trim());
    });
    var matches = [];
    sheets.forEach(function (sheetName) {
      var rows = ExcelReader.sheetToRows(workbook, sheetName);
      var header = findHeaderRow(rows, aliasGroups);
      if (header.rowIndex >= 0 && header.score >= 3) {
        matches.push({
          sheetName: sheetName,
          headerRowIndex: header.rowIndex,
          columnMap: header.map,
          score: header.score,
        });
      }
    });
    return matches;
  }

  function guessProjectIdFromWorkbook(workbook, fileName) {
    var fromName = ExcelReader.guessProjectIdFromFileName(fileName);
    if (fromName) return fromName;
    var labels = ['project id', 'project no', 'project number', 'job no', 'job number', 'project #'];
    var sheets = workbook.SheetNames || [];
    for (var s = 0; s < Math.min(sheets.length, 5); s++) {
      var rows = ExcelReader.sheetToRows(workbook, sheets[s]);
      for (var r = 0; r < Math.min(rows.length, 30); r++) {
        var row = rows[r] || [];
        for (var c = 0; c < row.length - 1; c++) {
          var label = normalizeHeader(row[c]);
          for (var i = 0; i < labels.length; i++) {
            if (label.indexOf(labels[i]) >= 0) {
              var val = ExcelReader.cellText(row[c + 1]);
              if (/^\d{3,5}$/.test(val)) return val;
            }
          }
        }
      }
    }
    return '';
  }

  /**
   * Eichleay PSE (legacy) v1 — column layout used by project 1830 sample workbooks.
   * Header aliases are version-specific; add v2 rules in a separate detector block later.
   */
  detectors['eichleay-pse-old'] = {
    id: 'eichleay-pse-old',
    version: '1',
    score: function scoreEichleay(workbook, fileName) {
      var reasons = [];
      var confidence = 0;
      var aliasGroups = NS.EichleayPseOldParser && NS.EichleayPseOldParser.COLUMN_ALIASES
        ? NS.EichleayPseOldParser.COLUMN_ALIASES
        : {
          discipline: ['discipline', 'disc'],
          estimateDeliverable: ['deliverable', 'estimate deliverable', 'pse deliverable', 'task'],
          activityName: ['activity', 'activity name', 'description'],
          qty: ['qty', 'quantity'],
          engineerHours: ['engineer', 'engr', 'engineering hrs', 'eng hrs'],
          designerHours: ['designer', 'design hrs', 'dsgn'],
          checkerHours: ['checker', 'check hrs', 'review hrs'],
          pmHours: ['pm hrs', 'pm hours', 'project management'],
          totalHours: ['total hrs', 'total hours', 'total'],
          notes: ['notes', 'comments', 'remarks'],
        };

      var lowerName = (fileName || '').toLowerCase();
      if (/pse|eichleay|project services estimate/.test(lowerName)) {
        confidence += 15;
        reasons.push('File name suggests PSE/Eichleay estimate.');
      }

      var sheetNames = workbook.SheetNames || [];
      sheetNames.forEach(function (name) {
        var n = name.toLowerCase();
        if (/pse|estimate|engineering|process|pmac|project services|i&c|electrical|mechanical|piping|civil|structural/.test(n)) {
          confidence += 5;
          reasons.push('Sheet "' + name + '" matches PSE discipline/estimate naming.');
        }
      });

      var matches = scanWorkbookHeaders(workbook, aliasGroups);
      if (matches.length) {
        confidence += Math.min(50, matches.length * 12 + matches[0].score * 4);
        reasons.push('Found ' + matches.length + ' data sheet(s) with PSE-style hour columns.');
      }

      var bodyText = '';
      sheetNames.slice(0, 3).forEach(function (sn) {
        var rows = ExcelReader.sheetToRows(workbook, sn);
        rows.slice(0, 15).forEach(function (row) {
          bodyText += (row || []).join(' ').toLowerCase() + ' ';
        });
      });
      if (/project services estimate|fel.?3|eichleay/.test(bodyText)) {
        confidence += 10;
        reasons.push('Workbook text mentions Project Services Estimate / FEL-3.');
      }

      return {
        templateId: confidence >= 35 ? 'eichleay-pse-old' : null,
        templateVersion: '1',
        confidence: Math.min(100, confidence),
        reasons: reasons,
        sheetMatches: matches,
      };
    },
  };

  /**
   * @param {object} workbook
   * @param {{ sourceFile?: string, projectId?: string }} [meta]
   * @returns {TemplateDetectionResult}
   */
  function detectTemplate(workbook, meta) {
    meta = meta || {};
    var fileName = meta.sourceFile || '';
    var best = {
      templateId: null,
      templateVersion: '',
      confidence: 0,
      reasons: ['No matching estimate template detected.'],
      projectIdGuess: meta.projectId || guessProjectIdFromWorkbook(workbook, fileName),
      sourceFile: fileName,
      sheetMatches: [],
    };

    Object.keys(detectors).forEach(function (key) {
      var detector = detectors[key];
      var result = detector.score(workbook, fileName);
      if (result.confidence > best.confidence) {
        best = {
          templateId: result.templateId,
          templateVersion: result.templateVersion || detector.version,
          confidence: result.confidence,
          reasons: result.reasons.length ? result.reasons : ['Matched ' + detector.id],
          projectIdGuess: best.projectIdGuess,
          sourceFile: fileName,
          sheetMatches: result.sheetMatches || [],
        };
      }
    });

    return best;
  }

  /**
   * @param {string} templateId
   * @param {object} detector
   */
  function registerDetector(templateId, detector) {
    detectors[templateId] = detector;
  }

  NS.TemplateDetector = {
    detectTemplate: detectTemplate,
    registerDetector: registerDetector,
    findHeaderRow: findHeaderRow,
    scanWorkbookHeaders: scanWorkbookHeaders,
    guessProjectIdFromWorkbook: guessProjectIdFromWorkbook,
  };
})(typeof window !== 'undefined' ? window : global);
