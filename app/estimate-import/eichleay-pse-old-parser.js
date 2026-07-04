/**
 * Eichleay PSE (legacy) estimate template parser — STUB
 *
 * Future: read Excel workbook sheets/columns for legacy PSE layout.
 * Now: returns an empty standard import batch with metadata only.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var Schema = NS.StandardImportSchema;
  var TemplateManager = NS.TemplateManager;

  if (!Schema || !TemplateManager) {
    throw new Error('standard-import-schema.js and template-manager.js must load first.');
  }

  var TEMPLATE_ID = 'eichleay-pse-old';
  var TEMPLATE_LABEL = 'Eichleay PSE (Legacy)';

  /**
   * @param {import('./template-manager.js').ParseEstimateInput} input
   * @returns {Promise<import('../shared/standard-import-schema.js').StandardImportBatch>}
   */
  function parseEichleayPseOld(input) {
    input = input || {};
    // TODO V3.1: parse input.file (Excel) into raw rows, map columns to standard fields.
    var stubRows = [];

    if (input.options && input.options.includeStubSample) {
      stubRows.push(Schema.createStandardImportRow({
        projectId: input.projectId || '',
        sourceFile: input.sourceFile || '',
        templateName: TEMPLATE_ID,
        discipline: 'Engineering',
        deliverable: 'PSE Sample Line',
        activityName: 'Develop - PSE Sample Line',
        qty: 1,
        engineerHours: 8,
        designerHours: 4,
        checkerHours: 2,
        pmHours: 1,
        totalHours: 15,
        notes: 'Stub row — Excel parsing not implemented',
        mappingStatus: Schema.MAPPING_STATUS.UNMAPPED,
      }));
    }

    return Promise.resolve(Schema.createStandardImportBatch({
      projectId: input.projectId || '',
      sourceFile: input.sourceFile || '',
      templateName: TEMPLATE_ID,
    }, stubRows));
  }

  TemplateManager.registerTemplateParser({
    id: TEMPLATE_ID,
    label: TEMPLATE_LABEL,
    description: 'Legacy Eichleay Project Services Estimate (PSE) Excel layout. Parser stub only in V3.0.',
    parse: parseEichleayPseOld,
  });

  NS.EichleayPseOldParser = {
    TEMPLATE_ID: TEMPLATE_ID,
    TEMPLATE_LABEL: TEMPLATE_LABEL,
    parse: parseEichleayPseOld,
  };
})(typeof window !== 'undefined' ? window : global);
