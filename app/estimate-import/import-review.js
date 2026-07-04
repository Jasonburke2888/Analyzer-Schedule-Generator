/**
 * Import Review — mapping review stage between Standard Import Rows and Resource Loader.
 * V3.0 skeleton: in-memory review state and validation helpers; no UI yet.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var Schema = NS.StandardImportSchema;

  if (!Schema) {
    throw new Error('standard-import-schema.js must load before import-review.js');
  }

  /**
   * @typedef {object} ImportReviewState
   * @property {StandardImportBatch} batch
   * @property {number} reviewedCount
   * @property {number} mappedCount
   * @property {number} errorCount
   */

  /**
   * @param {StandardImportBatch} batch
   * @returns {ImportReviewState}
   */
  function createReviewState(batch) {
    var err = Schema.validateStandardImportBatch(batch);
    if (err) throw new Error('Invalid import batch: ' + err);

    var mapped = 0;
    var errors = 0;
    batch.rows.forEach(function (row) {
      if (row.mappingStatus === Schema.MAPPING_STATUS.MAPPED) mapped++;
      if (row.mappingStatus === Schema.MAPPING_STATUS.ERROR) errors++;
    });

    return {
      batch: batch,
      reviewedCount: 0,
      mappedCount: mapped,
      errorCount: errors,
    };
  }

  /**
   * @param {ImportReviewState} state
   * @param {number} rowIndex
   * @param {Partial<StandardImportRow>} updates
   * @returns {ImportReviewState}
   */
  function updateReviewRow(state, rowIndex, updates) {
    if (!state || !state.batch || !Array.isArray(state.batch.rows)) {
      throw new Error('Invalid review state.');
    }
    if (rowIndex < 0 || rowIndex >= state.batch.rows.length) {
      throw new Error('Row index out of range.');
    }
    var merged = Schema.createStandardImportRow(
      Object.assign({}, state.batch.rows[rowIndex], updates || {})
    );
    state.batch.rows[rowIndex] = merged;
    return createReviewState(state.batch);
  }

  /**
   * Rows ready for Resource Loader (mapped or explicitly partial with hours).
   * @param {ImportReviewState} state
   * @returns {StandardImportRow[]}
   */
  function getRowsReadyForLoader(state) {
    if (!state || !state.batch) return [];
    return state.batch.rows.filter(function (row) {
      return row.mappingStatus === Schema.MAPPING_STATUS.MAPPED
        || row.mappingStatus === Schema.MAPPING_STATUS.PARTIAL;
    });
  }

  /**
   * @param {ImportReviewState} state
   * @returns {{ total: number, unmapped: number, mapped: number, partial: number, skipped: number, error: number }}
   */
  function summarizeReview(state) {
    var summary = {
      total: 0,
      unmapped: 0,
      mapped: 0,
      partial: 0,
      skipped: 0,
      error: 0,
    };
    if (!state || !state.batch) return summary;
    summary.total = state.batch.rows.length;
    state.batch.rows.forEach(function (row) {
      var key = row.mappingStatus;
      if (summary[key] !== undefined) summary[key]++;
      else summary.unmapped++;
    });
    return summary;
  }

  NS.ImportReview = {
    createReviewState: createReviewState,
    updateReviewRow: updateReviewRow,
    getRowsReadyForLoader: getRowsReadyForLoader,
    summarizeReview: summarizeReview,
  };
})(typeof window !== 'undefined' ? window : global);
