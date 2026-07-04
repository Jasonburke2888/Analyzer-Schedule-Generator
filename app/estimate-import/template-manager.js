/**
 * Template Manager — registers estimate Excel/PSE parsers by template name.
 * V3.0 skeleton: no file I/O; parsers return stub batches until Excel is implemented.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var Schema = NS.StandardImportSchema;

  if (!Schema) {
    throw new Error('standard-import-schema.js must load before template-manager.js');
  }

  /** @type {Record<string, EstimateTemplateParser>} */
  var registry = {};

  /**
   * @typedef {object} EstimateTemplateParser
   * @property {string} id
   * @property {string} label
   * @property {string} description
   * @property {function(ParseEstimateInput): Promise<StandardImportBatch>} parse
   */

  /**
   * @typedef {object} ParseEstimateInput
   * @property {string} [projectId]
   * @property {string} [sourceFile]
   * @property {ArrayBuffer|File|object} [file] — reserved for future Excel read
   * @property {object} [options]
   */

  /**
   * @param {EstimateTemplateParser} parser
   */
  function registerTemplateParser(parser) {
    if (!parser || !parser.id || typeof parser.parse !== 'function') {
      throw new Error('Invalid template parser registration.');
    }
    registry[parser.id] = parser;
  }

  /**
   * @param {string} templateId
   * @returns {EstimateTemplateParser|null}
   */
  function getTemplateParser(templateId) {
    return registry[templateId] || null;
  }

  /**
   * @returns {{ id: string, label: string, description: string }[]}
   */
  function listTemplateParsers() {
    return Object.keys(registry).sort().map(function (id) {
      var p = registry[id];
      return { id: p.id, label: p.label, description: p.description || '' };
    });
  }

  /**
   * @param {string} templateId
   * @param {ParseEstimateInput} input
   * @returns {Promise<StandardImportBatch>}
   */
  function parseWithTemplate(templateId, input) {
    var parser = getTemplateParser(templateId);
    if (!parser) {
      return Promise.reject(new Error('Unknown estimate template: ' + templateId));
    }
    return Promise.resolve().then(function () {
      return parser.parse(input || {});
    });
  }

  NS.TemplateManager = {
    registerTemplateParser: registerTemplateParser,
    getTemplateParser: getTemplateParser,
    listTemplateParsers: listTemplateParsers,
    parseWithTemplate: parseWithTemplate,
  };
})(typeof window !== 'undefined' ? window : global);
