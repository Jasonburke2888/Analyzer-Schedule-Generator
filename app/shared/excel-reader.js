/**
 * Excel Reader — thin SheetJS wrapper for estimate import (browser).
 * Requires global XLSX (SheetJS) loaded before this script on import pages.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};

  function requireXlsx() {
    if (!global.XLSX) {
      throw new Error('SheetJS (XLSX) is not loaded. Include xlsx.full.min.js before excel-reader.js.');
    }
    return global.XLSX;
  }

  /**
   * @param {ArrayBuffer|Uint8Array} buffer
   * @returns {import('xlsx').WorkBook}
   */
  function readWorkbookFromArrayBuffer(buffer) {
    var XLSX = requireXlsx();
    return XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false, cellStyles: true });
  }

  /**
   * @param {File} file
   * @returns {Promise<{ workbook: object, arrayBuffer: ArrayBuffer, fileName: string }>}
   */
  function readWorkbookFromFile(file) {
    if (!file) return Promise.reject(new Error('No file provided.'));
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var buffer = reader.result;
          resolve({
            workbook: readWorkbookFromArrayBuffer(buffer),
            arrayBuffer: buffer,
            fileName: file.name || '',
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Failed to read file.'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * @param {object} workbook
   * @param {string} sheetName
   * @returns {unknown[][]}
   */
  function sheetToRows(workbook, sheetName) {
    var XLSX = requireXlsx();
    var sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function cellText(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  /**
   * @param {unknown} value
   * @returns {number}
   */
  function cellNumber(value) {
    if (value === '' || value == null) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    var cleaned = String(value).replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
    var n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * @param {string} fileName
   * @returns {string}
   */
  function guessProjectIdFromFileName(fileName) {
    var name = (fileName || '').replace(/\.[^.]+$/, '');
    var patterns = [
      /\b(1[0-9]{3}|2[0-9]{3})\b/,
      /project[_\-\s#]*(\d{3,5})/i,
      /^(\d{3,5})[_\-\s]/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = name.match(patterns[i]);
      if (m) return m[1] || m[0];
    }
    return '';
  }

  NS.ExcelReader = {
    readWorkbookFromArrayBuffer: readWorkbookFromArrayBuffer,
    readWorkbookFromFile: readWorkbookFromFile,
    sheetToRows: sheetToRows,
    cellText: cellText,
    cellNumber: cellNumber,
    guessProjectIdFromFileName: guessProjectIdFromFileName,
  };
})(typeof window !== 'undefined' ? window : global);
