/**
 * Resource Loader — converts approved Standard Import Rows into schedule activity candidates.
 * V3.0 skeleton: does not mutate js/app.js activities; returns a portable candidate list.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var Schema = NS.StandardImportSchema;

  if (!Schema) {
    throw new Error('standard-import-schema.js must load before resource-loader.js');
  }

  /**
   * @typedef {object} ScheduleActivityCandidate
   * @property {string} discipline
   * @property {string} deliverable
   * @property {string} activityType — Action prefix derived from activityName when possible
   * @property {string} activityName
   * @property {number} budgetedHours
   * @property {string} owner
   * @property {string} status
   * @property {string} leadNotes
   * @property {string} importSourceFile
   * @property {string} importTemplateName
   * @property {string} mappingStatus
   */

  var NAME_SEP = ' - ';

  /**
   * Split "Action - Deliverable" style activity names (matches js/app.js convention).
   * @param {string} activityName
   * @returns {{ activityType: string, deliverable: string }}
   */
  function splitActivityName(activityName) {
    var name = (activityName || '').trim();
    var idx = name.indexOf(NAME_SEP);
    if (idx < 0) return { activityType: 'Develop', deliverable: name };
    return {
      activityType: name.slice(0, idx).trim() || 'Develop',
      deliverable: name.slice(idx + NAME_SEP.length).trim(),
    };
  }

  /**
   * @param {StandardImportRow} row
   * @returns {ScheduleActivityCandidate}
   */
  function standardRowToCandidate(row) {
    var parts = splitActivityName(row.activityName);
    var deliverable = row.deliverable || parts.deliverable;
    var activityType = parts.activityType;
    var displayName = row.activityName
      || (activityType && deliverable ? activityType + NAME_SEP + deliverable : '');

    return {
      discipline: row.discipline || '',
      deliverable: deliverable,
      activityType: activityType,
      activityName: displayName,
      budgetedHours: row.totalHours || 0,
      owner: '',
      status: 'Not Started',
      leadNotes: [
        row.notes,
        row.qty ? 'Qty: ' + row.qty : '',
        row.engineerHours ? 'Eng: ' + row.engineerHours : '',
        row.designerHours ? 'Des: ' + row.designerHours : '',
        row.checkerHours ? 'Chk: ' + row.checkerHours : '',
        row.pmHours ? 'PM: ' + row.pmHours : '',
      ].filter(Boolean).join(' | '),
      importSourceFile: row.sourceFile || '',
      importTemplateName: row.templateName || '',
      mappingStatus: row.mappingStatus || Schema.MAPPING_STATUS.UNMAPPED,
    };
  }

  /**
   * @param {StandardImportRow[]} rows
   * @param {object} [options]
   * @param {boolean} [options.requireMapped=true]
   * @returns {{ candidates: ScheduleActivityCandidate[], skipped: number }}
   */
  function loadResourcesFromImportRows(rows, options) {
    options = options || {};
    var requireMapped = options.requireMapped !== false;
    var candidates = [];
    var skipped = 0;

    (rows || []).forEach(function (row) {
      if (requireMapped && row.mappingStatus !== Schema.MAPPING_STATUS.MAPPED) {
        skipped++;
        return;
      }
      candidates.push(standardRowToCandidate(row));
    });

    return { candidates: candidates, skipped: skipped };
  }

  /**
   * Future hook: merge candidates into live schedule (js/app.js activities array).
   * V3.0: not implemented — returns candidates only.
   *
   * @param {ScheduleActivityCandidate[]} candidates
   * @returns {{ applied: number, message: string }}
   */
  function applyCandidatesToSchedule(candidates) {
    return {
      applied: 0,
      message: 'applyCandidatesToSchedule is not wired to js/app.js in V3.0 skeleton.',
    };
  }

  NS.ResourceLoader = {
    splitActivityName: splitActivityName,
    standardRowToCandidate: standardRowToCandidate,
    loadResourcesFromImportRows: loadResourcesFromImportRows,
    applyCandidatesToSchedule: applyCandidatesToSchedule,
  };
})(typeof window !== 'undefined' ? window : global);
