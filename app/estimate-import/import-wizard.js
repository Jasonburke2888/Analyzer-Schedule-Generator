/**
 * Import Wizard — file pick → template detect → parse → Import Review (no schedule generation).
 * V3.1 import test proof page. Does not modify js/app.js activities.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var Schema = NS.StandardImportSchema;
  var ExcelReader = NS.ExcelReader;
  var TemplateManager = NS.TemplateManager;
  var TemplateDetector = NS.TemplateDetector;
  var ImportReview = NS.ImportReview;

  if (!Schema || !ExcelReader || !TemplateManager || !TemplateDetector || !ImportReview) {
    throw new Error('ImportWizard requires schema, excel-reader, template-manager, template-detector, import-review.');
  }

  var FIXTURE_URL = './data/fixtures/1830-pse-sample.xlsx';
  var FIXTURE_NAME = '1830-pse-sample.xlsx';

  var ERROR = {
    WORKBOOK_READ: 'WORKBOOK_READ',
    TEMPLATE_NOT_DETECTED: 'TEMPLATE_NOT_DETECTED',
    NO_ROWS: 'NO_ROWS',
    PARSER_FAILED: 'PARSER_FAILED',
  };

  var ERROR_MESSAGES = {
    WORKBOOK_READ: 'Workbook cannot be read. Verify the file is a valid .xlsx or .xls estimate workbook.',
    TEMPLATE_NOT_DETECTED: 'Template not detected. Try Template override or verify the workbook matches a supported PSE layout.',
    NO_ROWS: 'No import rows found. Check that data sheets contain Deliverable and hour columns.',
    PARSER_FAILED: 'Parser failed while extracting rows from the workbook.',
  };

  /** @type {object|null} */
  var lastResult = null;

  function makeImportError(code, detail, extra) {
    var base = ERROR_MESSAGES[code] || 'Import failed.';
    var message = detail ? base + ' ' + detail : base;
    var err = new Error(message);
    err.code = code;
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        err[key] = extra[key];
      });
    }
    return err;
  }

  /**
   * @returns {Promise<File>}
   */
  function loadFixtureFile() {
    return fetch(FIXTURE_URL).then(function (res) {
      if (!res.ok) {
        throw makeImportError(ERROR.WORKBOOK_READ, '(Sample fixture missing at ' + FIXTURE_URL + '.)');
      }
      return res.arrayBuffer();
    }).then(function (buffer) {
      return new File([buffer], FIXTURE_NAME, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }).catch(function (err) {
      if (err.code) throw err;
      throw makeImportError(ERROR.WORKBOOK_READ, '(' + (err.message || 'fetch failed') + ')');
    });
  }

  /**
   * @param {File} file
   * @param {{ projectId?: string, templateId?: string, sheetMatches?: object[] }} opts
   * @returns {Promise<object>}
   */
  function runImportPipeline(file, opts) {
    opts = opts || {};
    var projectIdOverride = opts.projectId || '';
    var templateIdOverride = opts.templateId || '';

    return ExcelReader.readWorkbookFromFile(file).then(function (payload) {
      var workbook = payload.workbook;
      var sourceFile = payload.fileName;

      var detection;
      try {
        detection = TemplateDetector.detectTemplate(workbook, {
          sourceFile: sourceFile,
          projectId: projectIdOverride,
        });
      } catch (detectErr) {
        throw makeImportError(ERROR.PARSER_FAILED, '(' + detectErr.message + ')');
      }

      var templateId = templateIdOverride || detection.templateId;
      if (!templateId) {
        throw makeImportError(ERROR.TEMPLATE_NOT_DETECTED, 'File: "' + sourceFile + '".', {
          detection: detection,
        });
      }

      var projectId = projectIdOverride || detection.projectIdGuess || '';

      return TemplateManager.parseWithTemplate(templateId, {
        projectId: projectId,
        sourceFile: sourceFile,
        workbook: workbook,
        options: {
          sheetMatches: detection.sheetMatches,
        },
      }).then(function (batch) {
        if (!batch.rows || !batch.rows.length) {
          throw makeImportError(ERROR.NO_ROWS, 'Template: ' + templateId + '.', {
            detection: detection,
            batch: batch,
          });
        }

        var review = ImportReview.acceptImportForReview(batch);
        var result = {
          workbook: workbook,
          detection: detection,
          batch: batch,
          review: review,
          sourceFile: sourceFile,
          projectId: batch.projectId || projectId,
          templateId: templateId,
          usedFixture: sourceFile === FIXTURE_NAME,
        };
        lastResult = result;
        return result;
      }).catch(function (parseErr) {
        if (parseErr.code) throw parseErr;
        throw makeImportError(ERROR.PARSER_FAILED, '(' + parseErr.message + ')', {
          detection: detection,
        });
      });
    }).catch(function (readErr) {
      if (readErr.code) throw readErr;
      throw makeImportError(ERROR.WORKBOOK_READ, '(' + readErr.message + ')');
    });
  }

  /**
   * @param {File|{ file?: File, projectId?: string, templateId?: string, useFixture?: boolean }} input
   * @returns {Promise<object>}
   */
  function runImportFromFile(input) {
    var opts = {
      projectId: '',
      templateId: '',
    };
    var filePromise;

    if (input instanceof File) {
      filePromise = Promise.resolve(input);
    } else {
      input = input || {};
      opts.projectId = input.projectId || '';
      opts.templateId = input.templateId || '';
      if (input.file) {
        filePromise = Promise.resolve(input.file);
      } else if (input.useFixture !== false) {
        filePromise = loadFixtureFile();
      } else {
        return Promise.reject(makeImportError(
          ERROR.WORKBOOK_READ,
          'Select an Excel file or use the sample fixture.'
        ));
      }
    }

    return filePromise.then(function (file) {
      return runImportPipeline(file, opts);
    });
  }

  function getLastImportResult() {
    return lastResult;
  }

  function clearLastImportResult() {
    lastResult = null;
  }

  function serializeReviewBatch(result) {
    if (!result || !result.batch) return '{}';
    return JSON.stringify(result.batch, null, 2);
  }

  function formatErrorStatus(err) {
    if (!err || !err.code) return err.message || String(err);
    return '[' + err.code + '] ' + (err.message || ERROR_MESSAGES[err.code] || 'Import failed.');
  }

  /**
   * @param {HTMLElement} rootEl
   * @param {{ autoRunFixture?: boolean, onComplete?: function, onError?: function }} [hooks]
   */
  function mountImportWizard(rootEl, hooks) {
    hooks = hooks || {};
    if (!rootEl) throw new Error('mountImportWizard requires a container element.');

    rootEl.innerHTML = ''
      + '<div class="import-wizard">'
      + '  <section class="import-panel">'
      + '    <h2>Import Test</h2>'
      + '    <p class="import-help">Proof path: Excel workbook → template detect → Standard Import Rows → Import Review. '
      + '<strong>Schedule activities are not generated.</strong> '
      + 'If no file is selected, <code>' + FIXTURE_NAME + '</code> is used.</p>'
      + '    <div class="import-controls">'
      + '      <label class="import-field">'
      + '        <span>Project ID</span>'
      + '        <input type="text" id="import-project-id" placeholder="Auto-detect (e.g. 1830)">'
      + '      </label>'
      + '      <label class="import-field">'
      + '        <span>Excel file (optional)</span>'
      + '        <input type="file" id="import-file-input" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel">'
      + '      </label>'
      + '      <label class="import-field">'
      + '        <span>Template override</span>'
      + '        <select id="import-template-override"><option value="">Auto-detect</option></select>'
      + '      </label>'
      + '      <button type="button" id="import-run-btn" class="btn">Run Import</button>'
      + '      <button type="button" id="import-fixture-btn" class="btn btn-secondary">Load Sample Fixture</button>'
      + '    </div>'
      + '    <p id="import-status" class="import-status" role="status"></p>'
      + '  </section>'
      + '  <section class="import-panel" id="import-detection-panel" hidden>'
      + '    <h3>Template Detection</h3>'
      + '    <pre id="import-detection-text" class="import-pre"></pre>'
      + '  </section>'
      + '  <section class="import-panel" id="import-summary-panel" hidden>'
      + '    <h3>Import Summary</h3>'
      + '    <div class="import-stats" id="import-stats"></div>'
      + '    <p id="import-summary-text" class="import-summary-detail"></p>'
      + '    <div class="import-actions">'
      + '      <button type="button" id="import-download-json" class="btn btn-secondary">Download Import JSON</button>'
      + '    </div>'
      + '  </section>'
      + '  <section class="import-panel" id="import-table-panel" hidden>'
      + '    <h3>Standard Import Rows (Review)</h3>'
      + '    <div class="import-table-wrap">'
      + '      <table class="import-table" id="import-rows-table">'
      + '        <thead><tr>'
      + '          <th>#</th><th>Sheet</th><th>Row</th><th>Discipline</th>'
      + '          <th>Deliverable</th><th>Activity</th><th>Qty</th>'
      + '          <th>Engr</th><th>Dsgn</th><th>Chk</th><th>PM</th><th>Total</th><th>Status</th>'
      + '        </tr></thead>'
      + '        <tbody></tbody>'
      + '      </table>'
      + '    </div>'
      + '  </section>'
      + '</div>';

    var fileInput = rootEl.querySelector('#import-file-input');
    var projectInput = rootEl.querySelector('#import-project-id');
    var templateSelect = rootEl.querySelector('#import-template-override');
    var runBtn = rootEl.querySelector('#import-run-btn');
    var fixtureBtn = rootEl.querySelector('#import-fixture-btn');
    var statusEl = rootEl.querySelector('#import-status');
    var detectionPanel = rootEl.querySelector('#import-detection-panel');
    var detectionText = rootEl.querySelector('#import-detection-text');
    var summaryPanel = rootEl.querySelector('#import-summary-panel');
    var statsEl = rootEl.querySelector('#import-stats');
    var summaryText = rootEl.querySelector('#import-summary-text');
    var tablePanel = rootEl.querySelector('#import-table-panel');
    var tableBody = rootEl.querySelector('#import-rows-table tbody');
    var downloadBtn = rootEl.querySelector('#import-download-json');

    TemplateManager.listTemplateParsers().forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      templateSelect.appendChild(opt);
    });

    function setStatus(msg, isError) {
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('import-status-error', !!isError);
    }

    function setBusy(busy) {
      runBtn.disabled = busy;
      fixtureBtn.disabled = busy;
    }

    function hideResults() {
      detectionPanel.hidden = true;
      summaryPanel.hidden = true;
      tablePanel.hidden = true;
    }

    function renderDetection(detection) {
      detectionPanel.hidden = false;
      detectionText.textContent = JSON.stringify(detection, null, 2);
    }

    function renderReview(result) {
      var summary = ImportReview.summarizeReview(result.review);
      summaryPanel.hidden = false;
      tablePanel.hidden = false;

      statsEl.innerHTML = ''
        + statCard('Total rows', summary.total)
        + statCard('Unmapped', summary.unmapped, summary.unmapped ? 'import-stat-warn' : '')
        + statCard('Mapped', summary.mapped)
        + statCard('Template', result.templateId)
        + statCard('Project ID', result.projectId || '—');

      summaryText.textContent = [
        'Source: ' + result.sourceFile + (result.usedFixture ? ' (sample fixture)' : ''),
        'Template version: ' + (result.batch.templateVersion || result.detection.templateVersion || '—'),
        'Detection confidence: ' + (result.detection.confidence || 0) + '%',
        'Schedule generation: skipped — Import Review only',
      ].join(' · ');

      tableBody.innerHTML = '';
      result.batch.rows.forEach(function (row, idx) {
        var tr = document.createElement('tr');
        if (row.mappingStatus === Schema.MAPPING_STATUS.UNMAPPED) {
          tr.className = 'import-row-unmapped';
        }
        tr.innerHTML = ''
          + '<td>' + (idx + 1) + '</td>'
          + '<td>' + escapeHtml(row.sheetName) + '</td>'
          + '<td>' + row.rowNumber + '</td>'
          + '<td>' + escapeHtml(row.discipline) + '</td>'
          + '<td>' + escapeHtml(row.estimateDeliverable || row.deliverable) + '</td>'
          + '<td>' + escapeHtml(row.activityName) + '</td>'
          + '<td>' + row.qty + '</td>'
          + '<td>' + row.engineerHours + '</td>'
          + '<td>' + row.designerHours + '</td>'
          + '<td>' + row.checkerHours + '</td>'
          + '<td>' + row.pmHours + '</td>'
          + '<td>' + row.totalHours + '</td>'
          + '<td>' + escapeHtml(row.mappingStatus) + '</td>';
        tableBody.appendChild(tr);
      });
    }

    function statCard(label, value, extraClass) {
      return '<div class="import-stat-card' + (extraClass ? ' ' + extraClass : '') + '">'
        + '<span class="import-stat-label">' + escapeHtml(label) + '</span>'
        + '<span class="import-stat-value">' + escapeHtml(String(value)) + '</span>'
        + '</div>';
    }

    function executeImport(useFixtureOnly) {
      hideResults();
      setBusy(true);
      setStatus(useFixtureOnly
        ? 'Loading sample fixture ' + FIXTURE_NAME + '…'
        : 'Reading workbook and detecting template…');

      var file = !useFixtureOnly && fileInput.files && fileInput.files[0];
      var promise = runImportFromFile({
        file: file || undefined,
        projectId: projectInput.value.trim(),
        templateId: templateSelect.value.trim(),
        useFixture: !file,
      });

      promise.then(function (result) {
        setStatus('Success — imported ' + result.batch.rows.length + ' row(s). Unmapped: '
          + ImportReview.summarizeReview(result.review).unmapped + '.');
        renderDetection(result.detection);
        renderReview(result);
        if (hooks.onComplete) hooks.onComplete(result);
      }).catch(function (err) {
        setStatus(formatErrorStatus(err), true);
        if (err.detection) renderDetection(err.detection);
        if (hooks.onError) hooks.onError(err);
      }).finally(function () {
        setBusy(false);
      });
    }

    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length) {
        setStatus('Selected: ' + fileInput.files[0].name);
      } else {
        setStatus('No file selected — Run Import will use ' + FIXTURE_NAME + '.');
      }
    });

    runBtn.addEventListener('click', function () {
      executeImport(false);
    });

    fixtureBtn.addEventListener('click', function () {
      fileInput.value = '';
      executeImport(true);
    });

    downloadBtn.addEventListener('click', function () {
      if (!lastResult) return;
      var blob = new Blob([serializeReviewBatch(lastResult)], { type: 'application/json' });
      var a = document.createElement('a');
      var base = (lastResult.sourceFile || 'import').replace(/\.[^.]+$/, '');
      a.href = URL.createObjectURL(blob);
      a.download = base + '_standard_import.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    setStatus('Ready — select a workbook or click Run Import to use ' + FIXTURE_NAME + '.');

    if (hooks.autoRunFixture) {
      executeImport(true);
    }
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  NS.ImportWizard = {
    ERROR: ERROR,
    ERROR_MESSAGES: ERROR_MESSAGES,
    FIXTURE_URL: FIXTURE_URL,
    FIXTURE_NAME: FIXTURE_NAME,
    loadFixtureFile: loadFixtureFile,
    runImportFromFile: runImportFromFile,
    getLastImportResult: getLastImportResult,
    clearLastImportResult: clearLastImportResult,
    serializeReviewBatch: serializeReviewBatch,
    mountImportWizard: mountImportWizard,
  };
})(typeof window !== 'undefined' ? window : global);
