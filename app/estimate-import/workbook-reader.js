/**
 * Workbook Reader — Sprint 1
 *
 * Opens Excel workbooks, lists sheets, previews rows, detects column headers.
 * No template parsing. Template Detection and Mapping Wizard plug in via getSession().
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var ExcelReader = NS.ExcelReader;

  if (!ExcelReader) {
    throw new Error('excel-reader.js must load before workbook-reader.js');
  }

  var PREVIEW_ROW_LIMIT = 25;
  var HEADER_SCAN_ROWS = 40;

  /** @type {WorkbookSession|null} */
  var activeSession = null;

  /**
   * @typedef {object} WorkbookSession
   * @property {string} fileName
   * @property {object} workbook
   * @property {ArrayBuffer} arrayBuffer
   * @property {string[]} sheetNames
   * @property {string|null} activeSheetName
   * @property {string} openedAt
   */

  /**
   * @typedef {object} SheetPreview
   * @property {string} sheetName
   * @property {unknown[][]} rows
   * @property {number} previewRowCount
   * @property {number} totalRowCount
   * @property {number} totalColumnCount
   * @property {number} headerRowIndex
   * @property {string[]} headers
   */

  /**
   * @typedef {object} HeaderDetectionResult
   * @property {number} rowIndex -1 if none
   * @property {string[]} headers
   * @property {number} filledCellCount
   */

  function nowIso() {
    return new Date().toISOString();
  }

  function isNumericCell(value) {
    if (value === '' || value == null) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    var text = String(value).trim();
    if (!text) return false;
    return !isNaN(Number(text.replace(/,/g, '')));
  }

  function rowFilledCount(row) {
    var count = 0;
    (row || []).forEach(function (cell) {
      if (ExcelReader.cellText(cell)) count += 1;
    });
    return count;
  }

  /**
   * Heuristic header detection — first strong candidate row within scan window.
   * Template Detection can reuse or override this later.
   * @param {unknown[][]} rows
   * @param {{ maxScanRows?: number, minFilledCells?: number }} [options]
   * @returns {HeaderDetectionResult}
   */
  function detectColumnHeaders(rows, options) {
    options = options || {};
    var maxScan = options.maxScanRows != null ? options.maxScanRows : HEADER_SCAN_ROWS;
    var minFilled = options.minFilledCells != null ? options.minFilledCells : 2;
    var best = { rowIndex: -1, headers: [], filledCellCount: 0 };

    for (var r = 0; r < Math.min(rows.length, maxScan); r++) {
      var row = rows[r] || [];
      var filled = rowFilledCount(row);
      if (filled < minFilled) continue;

      var textCells = 0;
      var numericCells = 0;
      row.forEach(function (cell) {
        if (!ExcelReader.cellText(cell)) return;
        if (isNumericCell(cell)) numericCells += 1;
        else textCells += 1;
      });

      if (textCells < 1) continue;

      var score = filled + textCells * 2 - numericCells;
      if (score > best.filledCellCount || (score === best.filledCellCount && filled > best.headers.length)) {
        var headers = row.map(function (cell, colIndex) {
          var text = ExcelReader.cellText(cell);
          return text || ('Column ' + (colIndex + 1));
        });
        while (headers.length && !ExcelReader.cellText(headers[headers.length - 1])) {
          headers.pop();
        }
        best = {
          rowIndex: r,
          headers: headers,
          filledCellCount: score,
        };
      }
    }

    return best;
  }

  function countSheetColumns(rows) {
    var max = 0;
    rows.forEach(function (row) {
      if (row && row.length > max) max = row.length;
    });
    return max;
  }

  /**
   * @param {object} payload
   * @returns {WorkbookSession}
   */
  function createSession(payload) {
    var workbook = payload.workbook;
    var sheetNames = (workbook && workbook.SheetNames) ? workbook.SheetNames.slice() : [];
    return {
      fileName: payload.fileName || '',
      workbook: workbook,
      arrayBuffer: payload.arrayBuffer || null,
      sheetNames: sheetNames,
      activeSheetName: sheetNames.length ? sheetNames[0] : null,
      openedAt: nowIso(),
    };
  }

  /**
   * @param {File} file
   * @returns {Promise<WorkbookSession>}
   */
  function openFromFile(file) {
    if (!file) {
      return Promise.reject(new Error('No workbook file provided.'));
    }
    return ExcelReader.readWorkbookFromFile(file).then(function (payload) {
      var session = createSession(payload);
      activeSession = session;
      return session;
    }).catch(function (err) {
      var message = err && err.message ? err.message : String(err);
      return Promise.reject(new Error('Workbook cannot be read: ' + message));
    });
  }

  /**
   * @param {WorkbookSession} session
   * @returns {{ name: string, sheetCount: number, sheetNames: string[] }}
   */
  function getWorkbookInfo(session) {
    if (!session) {
      return { name: '', sheetCount: 0, sheetNames: [] };
    }
    return {
      name: session.fileName,
      sheetCount: session.sheetNames.length,
      sheetNames: session.sheetNames.slice(),
    };
  }

  /**
   * @param {WorkbookSession} session
   * @param {string} sheetName
   * @returns {unknown[][]}
   */
  function getSheetRows(session, sheetName) {
    if (!session || !session.workbook) return [];
    return ExcelReader.sheetToRows(session.workbook, sheetName);
  }

  /**
   * @param {WorkbookSession} session
   * @param {string} sheetName
   * @param {{ previewLimit?: number }} [options]
   * @returns {SheetPreview}
   */
  function getSheetPreview(session, sheetName, options) {
    options = options || {};
    var limit = options.previewLimit != null ? options.previewLimit : PREVIEW_ROW_LIMIT;
    if (!session || !session.workbook) {
      return {
        sheetName: sheetName || '',
        rows: [],
        previewRowCount: 0,
        totalRowCount: 0,
        totalColumnCount: 0,
        headerRowIndex: -1,
        headers: [],
      };
    }

    var allRows = getSheetRows(session, sheetName);
    var headerResult = detectColumnHeaders(allRows);
    var previewRows = allRows.slice(0, limit);

    return {
      sheetName: sheetName,
      rows: previewRows,
      previewRowCount: previewRows.length,
      totalRowCount: allRows.length,
      totalColumnCount: countSheetColumns(allRows),
      headerRowIndex: headerResult.rowIndex,
      headers: headerResult.headers,
    };
  }

  /**
   * @param {WorkbookSession} session
   * @param {string} sheetName
   * @returns {WorkbookSession}
   */
  function selectSheet(session, sheetName) {
    if (!session) throw new Error('No active workbook session.');
    if (session.sheetNames.indexOf(sheetName) < 0) {
      throw new Error('Worksheet not found: ' + sheetName);
    }
    session.activeSheetName = sheetName;
    activeSession = session;
    return session;
  }

  function getActiveSession() {
    return activeSession;
  }

  function clearSession() {
    activeSession = null;
  }

  NS.WorkbookReader = {
    PREVIEW_ROW_LIMIT: PREVIEW_ROW_LIMIT,
    HEADER_SCAN_ROWS: HEADER_SCAN_ROWS,
    openFromFile: openFromFile,
    createSession: createSession,
    getWorkbookInfo: getWorkbookInfo,
    getSheetRows: getSheetRows,
    getSheetPreview: getSheetPreview,
    detectColumnHeaders: detectColumnHeaders,
    selectSheet: selectSheet,
    getActiveSession: getActiveSession,
    clearSession: clearSession,
  };
})(typeof window !== 'undefined' ? window : global);
