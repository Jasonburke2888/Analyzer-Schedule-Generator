/**
 * Estimate Line Item Schema
 *
 * Labor-bearing rows extracted from estimate workbooks.
 * The estimate is the source of truth — no schedule/activity fields.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};

  var SCHEMA_VERSION = 1;
  var FORMAT_ID = 'analyzer-estimate-line-items';

  var VALIDATION_STATUS = {
    VALID: 'valid',
    NEEDS_REVIEW: 'needs_review',
    INVALID: 'invalid',
  };

  var LINE_ITEM_FIELDS = [
    'discipline',
    'estimateSection',
    'deliverable',
    'qty',
    'unit',
    'engineerHours',
    'designerHours',
    'hveHours',
    'totalHours',
    'notes',
    'validationStatus',
    'reviewReason',
  ];

  var NUMERIC_FIELDS = ['qty', 'engineerHours', 'designerHours', 'hveHours', 'totalHours'];

  function toNumber(value) {
    if (value === '' || value == null) return 0;
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * @param {Partial<EstimateLineItem>} overrides
   * @returns {EstimateLineItem}
   */
  function createEstimateLineItem(overrides) {
    var base = {
      discipline: '',
      estimateSection: '',
      deliverable: '',
      qty: 0,
      unit: '',
      engineerHours: 0,
      designerHours: 0,
      hveHours: 0,
      totalHours: 0,
      notes: '',
      validationStatus: VALIDATION_STATUS.NEEDS_REVIEW,
      reviewReason: '',
    };
    if (!overrides || typeof overrides !== 'object') return base;
    LINE_ITEM_FIELDS.forEach(function (key) {
      if (overrides[key] !== undefined) {
        base[key] = NUMERIC_FIELDS.indexOf(key) >= 0
          ? toNumber(overrides[key])
          : String(overrides[key] == null ? '' : overrides[key]).trim();
      }
    });
    return base;
  }

  /**
   * @param {unknown} item
   * @returns {string|null}
   */
  function validateEstimateLineItem(item) {
    if (!item || typeof item !== 'object') return 'Line item must be an object.';
    for (var i = 0; i < LINE_ITEM_FIELDS.length; i++) {
      var key = LINE_ITEM_FIELDS[i];
      if (!(key in item)) return 'Missing field: ' + key;
    }
    for (var j = 0; j < NUMERIC_FIELDS.length; j++) {
      var numKey = NUMERIC_FIELDS[j];
      if (typeof item[numKey] !== 'number' || !Number.isFinite(item[numKey])) {
        return numKey + ' must be a finite number.';
      }
    }
    return null;
  }

  /**
   * @param {object} meta
   * @param {EstimateLineItem[]} items
   * @returns {EstimateLineItemBatch}
   */
  function createEstimateLineItemBatch(meta, items) {
    var batch = {
      format: FORMAT_ID,
      schemaVersion: SCHEMA_VERSION,
      extractedAt: new Date().toISOString(),
      sourceFile: (meta && meta.sourceFile) || '',
      templateName: (meta && meta.templateName) || '',
      templateVersion: (meta && meta.templateVersion) || '',
      sheetName: (meta && meta.sheetName) || '',
      items: (items || []).map(function (item) { return createEstimateLineItem(item); }),
    };
    return batch;
  }

  function summarizeValidation(items) {
    var summary = { total: 0, valid: 0, needs_review: 0, invalid: 0 };
    (items || []).forEach(function (item) {
      summary.total += 1;
      var key = item.validationStatus;
      if (summary[key] !== undefined) summary[key] += 1;
      else summary.needs_review += 1;
    });
    return summary;
  }

  NS.EstimateLineItemSchema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    FORMAT_ID: FORMAT_ID,
    VALIDATION_STATUS: VALIDATION_STATUS,
    LINE_ITEM_FIELDS: LINE_ITEM_FIELDS.slice(),
    createEstimateLineItem: createEstimateLineItem,
    validateEstimateLineItem: validateEstimateLineItem,
    createEstimateLineItemBatch: createEstimateLineItemBatch,
    summarizeValidation: summarizeValidation,
  };
})(typeof window !== 'undefined' ? window : global);
