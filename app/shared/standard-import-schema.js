/**
 * Standard Import Schema — V3.0 Estimate Import Engine
 *
 * Defines the normalized row shape produced by template parsers and consumed
 * by Mapping Review and Resource Loader. Not wired into js/app.js yet.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};

  var SCHEMA_VERSION = 1;
  var FORMAT_ID = 'analyzer-schedule-standard-import';

  var MAPPING_STATUS = {
    UNMAPPED: 'unmapped',
    PARTIAL: 'partial',
    MAPPED: 'mapped',
    SKIPPED: 'skipped',
    ERROR: 'error',
  };

  var ROW_FIELDS = [
    'projectId',
    'sourceFile',
    'templateName',
    'templateVersion',
    'sheetName',
    'rowNumber',
    'discipline',
    'estimateDeliverable',
    'deliverable',
    'activityName',
    'qty',
    'engineerHours',
    'designerHours',
    'checkerHours',
    'pmHours',
    'totalHours',
    'notes',
    'mappingStatus',
  ];

  var NUMERIC_FIELDS = [
    'rowNumber',
    'qty',
    'engineerHours',
    'designerHours',
    'checkerHours',
    'pmHours',
    'totalHours',
  ];

  function toNumber(value) {
    if (value === '' || value == null) return 0;
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * @param {Partial<StandardImportRow>} overrides
   * @returns {StandardImportRow}
   */
  function createStandardImportRow(overrides) {
    var base = {
      projectId: '',
      sourceFile: '',
      templateName: '',
      templateVersion: '',
      sheetName: '',
      rowNumber: 0,
      discipline: '',
      estimateDeliverable: '',
      deliverable: '',
      activityName: '',
      qty: 0,
      engineerHours: 0,
      designerHours: 0,
      checkerHours: 0,
      pmHours: 0,
      totalHours: 0,
      notes: '',
      mappingStatus: MAPPING_STATUS.UNMAPPED,
    };
    if (!overrides || typeof overrides !== 'object') return base;
    ROW_FIELDS.forEach(function (key) {
      if (overrides[key] !== undefined) {
        base[key] = NUMERIC_FIELDS.indexOf(key) >= 0
          ? toNumber(overrides[key])
          : String(overrides[key] == null ? '' : overrides[key]).trim();
      }
    });
    if (!base.estimateDeliverable && base.deliverable) {
      base.estimateDeliverable = base.deliverable;
    }
    if (!base.deliverable && base.estimateDeliverable) {
      base.deliverable = base.estimateDeliverable;
    }
    if (!base.totalHours && (base.engineerHours || base.designerHours || base.checkerHours || base.pmHours)) {
      base.totalHours = base.engineerHours + base.designerHours + base.checkerHours + base.pmHours;
    }
    return base;
  }

  /**
   * @param {unknown} row
   * @returns {string|null} Error message or null if valid
   */
  function validateStandardImportRow(row) {
    if (!row || typeof row !== 'object') return 'Row must be an object.';
    for (var i = 0; i < ROW_FIELDS.length; i++) {
      var key = ROW_FIELDS[i];
      if (!(key in row)) return 'Missing field: ' + key;
    }
    if (typeof row.mappingStatus !== 'string') return 'mappingStatus must be a string.';
    for (var j = 0; j < NUMERIC_FIELDS.length; j++) {
      var numKey = NUMERIC_FIELDS[j];
      if (typeof row[numKey] !== 'number' || !Number.isFinite(row[numKey])) {
        return numKey + ' must be a finite number.';
      }
    }
    return null;
  }

  /**
   * @param {unknown} payload
   * @returns {string|null}
   */
  function validateStandardImportBatch(payload) {
    if (!payload || typeof payload !== 'object') return 'Batch must be an object.';
    if (payload.format !== FORMAT_ID) return 'Invalid format (expected "' + FORMAT_ID + '").';
    if (payload.schemaVersion !== SCHEMA_VERSION) {
      return 'Unsupported schemaVersion (expected ' + SCHEMA_VERSION + ').';
    }
    if (!Array.isArray(payload.rows)) return 'rows must be an array.';
    for (var i = 0; i < payload.rows.length; i++) {
      var err = validateStandardImportRow(payload.rows[i]);
      if (err) return 'Row ' + i + ': ' + err;
    }
    return null;
  }

  /**
   * @param {object} meta
   * @param {StandardImportRow[]} rows
   * @returns {StandardImportBatch}
   */
  function createStandardImportBatch(meta, rows) {
    var batch = {
      format: FORMAT_ID,
      schemaVersion: SCHEMA_VERSION,
      importedAt: new Date().toISOString(),
      projectId: (meta && meta.projectId) || '',
      sourceFile: (meta && meta.sourceFile) || '',
      templateName: (meta && meta.templateName) || '',
      templateVersion: (meta && meta.templateVersion) || '',
      rows: (rows || []).map(function (r) { return createStandardImportRow(r); }),
    };
    var err = validateStandardImportBatch(batch);
    if (err) throw new Error(err);
    return batch;
  }

  NS.StandardImportSchema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    FORMAT_ID: FORMAT_ID,
    MAPPING_STATUS: MAPPING_STATUS,
    ROW_FIELDS: ROW_FIELDS.slice(),
    createStandardImportRow: createStandardImportRow,
    validateStandardImportRow: validateStandardImportRow,
    validateStandardImportBatch: validateStandardImportBatch,
    createStandardImportBatch: createStandardImportBatch,
  };
})(typeof window !== 'undefined' ? window : global);
