/**
 * Workbook Reader UI — Sprint 1
 * Binds WorkbookReader to import.html panels. No parsing.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var WorkbookReader = NS.WorkbookReader;

  if (!WorkbookReader) {
    throw new Error('workbook-reader.js must load before workbook-reader-ui.js');
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {{ onLog?: function(string), onSessionChange?: function, onSheetPreview?: function }} hooks
   */
  function mountWorkbookReaderUI(hooks) {
    hooks = hooks || {};

    var chooseBtn = document.getElementById('chooseFileBtn');
    var fileInput = document.getElementById('excelFileInput');
    var fileLabel = document.getElementById('selected-file-label');
    var statusList = document.getElementById('import-engine-status');
    var workbookPanel = document.getElementById('workbook-info-panel');
    var sheetListEl = document.getElementById('worksheet-list');
    var headersPanel = document.getElementById('column-headers-panel');
    var previewWrap = document.getElementById('preview-table-wrap');
    var previewMeta = document.getElementById('preview-meta');
    var templateDetectionPanel = document.getElementById('template-detection-result');
    var importReviewSummary = document.getElementById('estimate-line-items-summary');
    var importReviewPanel = document.getElementById('estimate-line-items-panel');

    var EichleayDetector = NS.EichleayTemplateDetector;
    var CivilStrExtractor = NS.EichleayCivilStrExtractor;
    var LineItemSchema = NS.EstimateLineItemSchema;

    if (!chooseBtn || !fileInput) {
      throw new Error('Workbook Reader UI: required elements missing on import.html');
    }

    /** @type {object|null} */
    var session = null;

    function log(message) {
      if (hooks.onLog) hooks.onLog(message);
    }

    function setStatus(items) {
      if (!statusList) return;
      statusList.innerHTML = items.map(function (text) {
        return '<li>' + escapeHtml(text) + '</li>';
      }).join('');
    }

    function renderWorkbookInfo(info) {
      if (!workbookPanel) return;
      workbookPanel.innerHTML = ''
        + '<dl class="import-dl">'
        + '<dt>Workbook</dt><dd>' + escapeHtml(info.name) + '</dd>'
        + '<dt>Worksheets</dt><dd>' + info.sheetCount + '</dd>'
        + '</dl>';
    }

    function renderSheetList(sheetNames, activeSheet) {
      if (!sheetListEl) return;
      if (!sheetNames.length) {
        sheetListEl.innerHTML = '<p class="import-panel-empty">No worksheets found.</p>';
        return;
      }
      sheetListEl.innerHTML = sheetNames.map(function (name) {
        var active = name === activeSheet ? ' is-active' : '';
        return '<button type="button" class="import-sheet-btn' + active + '" data-sheet="'
          + escapeHtml(name) + '">' + escapeHtml(name) + '</button>';
      }).join('');

      sheetListEl.querySelectorAll('.import-sheet-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectSheet(btn.getAttribute('data-sheet'));
        });
      });
    }

    function renderTemplateDetection(result) {
      if (!templateDetectionPanel) return;
      if (!result) {
        templateDetectionPanel.innerHTML = '<p class="import-panel-empty">Open a workbook to run template detection.</p>';
        return;
      }

      var nameText = result.templateName
        ? escapeHtml(result.templateName)
        : '<span class="import-detect-none">Not matched</span>';
      var matchClass = result.isMatch ? 'import-detect-match' : 'import-detect-nomatch';

      templateDetectionPanel.innerHTML = ''
        + '<dl class="import-dl import-detect-summary ' + matchClass + '">'
        + '<dt>Template</dt><dd>' + nameText + '</dd>'
        + '<dt>Version</dt><dd>' + escapeHtml(result.templateVersion) + '</dd>'
        + '<dt>Confidence</dt><dd>' + result.confidenceScore + '%</dd>'
        + '</dl>'
        + '<div class="import-signal-columns">'
        + '<div class="import-signal-col">'
        + '<h4>Matched signals (' + result.matchedSignals.length + ')</h4>'
        + signalList(result.matchedSignals, 'import-signal-ok')
        + '</div>'
        + '<div class="import-signal-col">'
        + '<h4>Missing signals (' + result.missingSignals.length + ')</h4>'
        + signalList(result.missingSignals, 'import-signal-miss')
        + '</div>'
        + '</div>';
    }

    function signalList(items, itemClass) {
      if (!items.length) {
        return '<p class="import-panel-empty">None</p>';
      }
      return '<ul class="import-signal-list">'
        + items.map(function (item) {
          return '<li class="' + itemClass + '">' + escapeHtml(item) + '</li>';
        }).join('')
        + '</ul>';
    }

    function runTemplateDetection() {
      if (!session || !EichleayDetector) {
        renderTemplateDetection(null);
        if (!EichleayDetector) log('EichleayTemplateDetector not loaded.');
        return null;
      }
      var result = EichleayDetector.detectEichleayPse(session);
      renderTemplateDetection(result);
      if (result.isMatch) {
        setStatus([
          '✓ Page Loaded',
          '✓ Workbook Opened',
          '✓ Eichleay PSE detected (' + result.confidenceScore + '%)',
        ]);
        log('Template detected: ' + result.templateName + ' v' + result.templateVersion
          + ' (' + result.confidenceScore + '% confidence).');
      } else {
        setStatus([
          '✓ Page Loaded',
          '✓ Workbook Opened',
          '○ Template not matched (' + result.confidenceScore + '% confidence)',
        ]);
        log('Template not matched — confidence ' + result.confidenceScore + '%.');
      }
      log('Matched signals: ' + result.matchedSignals.length
        + '; missing: ' + result.missingSignals.length);
      if (hooks.onTemplateDetection) hooks.onTemplateDetection(result, session);
      return result;
    }

    function emptyLineItemsMessage(sheetName) {
      if (CivilStrExtractor && CivilStrExtractor.isCivilStrSheetName(sheetName)) {
        return 'No Civil/Structural line items extracted yet.';
      }
      return 'Select the Civil Str worksheet to extract Civil/Structural estimate line items.';
    }

    function runLineItemExtractionForSheet(sheetName, detection) {
      if (!session || !sheetName) {
        renderEstimateLineItems(null);
        return;
      }
      if (!CivilStrExtractor || !CivilStrExtractor.isCivilStrSheetName(sheetName)) {
        renderEstimateLineItems(null);
        if (importReviewPanel) {
          importReviewPanel.innerHTML = '<p class="import-panel-empty">'
            + escapeHtml(emptyLineItemsMessage(sheetName)) + '</p>';
        }
        return;
      }
      runCivilStrExtraction(detection);
    }

    function renderEstimateLineItems(extraction) {
      if (!importReviewPanel) return;
      if (!extraction || !extraction.items || !extraction.items.length) {
        if (importReviewSummary) importReviewSummary.textContent = '';
        importReviewPanel.innerHTML = '<p class="import-panel-empty">No estimate line items extracted yet.</p>';
        return;
      }

      var summary = LineItemSchema
        ? LineItemSchema.summarizeValidation(extraction.items)
        : { total: extraction.rowCount, valid: 0, needs_review: extraction.needsReviewCount };

      if (importReviewSummary) {
        importReviewSummary.textContent = 'Sheet: ' + extraction.sheetName
          + ' · Line items: ' + summary.total
          + ' · Valid: ' + summary.valid
          + ' · Needs review: ' + summary.needs_review;
      }

      var thead = '<thead><tr>'
        + '<th>#</th><th>Discipline</th><th>Section</th><th>Deliverable</th>'
        + '<th>Qty</th><th>Unit</th><th>Engr</th><th>Dsgn</th><th>HVE</th><th>Total</th>'
        + '<th>Validation</th><th>Review Reason</th><th>Notes</th>'
        + '</tr></thead>';
      var tbody = '<tbody>';
      extraction.items.forEach(function (item, idx) {
        var rowClass = item.validationStatus === 'needs_review' ? ' class="import-row-flagged"' : '';
        tbody += '<tr' + rowClass + '>'
          + '<td>' + (idx + 1) + '</td>'
          + '<td>' + escapeHtml(item.discipline || '—') + '</td>'
          + '<td>' + escapeHtml(item.estimateSection || '—') + '</td>'
          + '<td>' + escapeHtml(item.deliverable) + '</td>'
          + '<td>' + (item.qty || '—') + '</td>'
          + '<td>' + escapeHtml(item.unit || '—') + '</td>'
          + '<td>' + (item.engineerHours || '—') + '</td>'
          + '<td>' + (item.designerHours || '—') + '</td>'
          + '<td>' + (item.hveHours || '—') + '</td>'
          + '<td>' + item.totalHours + '</td>'
          + '<td>' + escapeHtml(item.validationStatus) + '</td>'
          + '<td>' + escapeHtml(item.reviewReason || '—') + '</td>'
          + '<td>' + escapeHtml(item.notes) + '</td>'
          + '</tr>';
      });
      tbody += '</tbody>';
      importReviewPanel.innerHTML = '<table class="import-preview-table">' + thead + tbody + '</table>';
    }

    function runCivilStrExtraction(detection) {
      if (!session || !CivilStrExtractor) {
        log('Civil Str extractor not available.');
        return;
      }
      try {
        var meta = detection ? {
          templateName: detection.templateName,
          templateVersion: detection.templateVersion,
          sheetName: session.activeSheetName,
        } : { sheetName: session.activeSheetName };
        var extraction = CivilStrExtractor.extractCivilStrLineItems(session, meta);
        renderEstimateLineItems(extraction);
        log('Extracted ' + extraction.rowCount + ' Civil/Structural line item(s) from Civil Str.'
          + (extraction.needsReviewCount ? ' (' + extraction.needsReviewCount + ' need review)' : ''));
        setStatus([
          '✓ Page Loaded',
          '✓ Workbook Opened',
          '✓ Civil Str line items (' + extraction.rowCount + ')',
        ]);
        if (hooks.onLineItemsExtracted) hooks.onLineItemsExtracted(extraction, session);
      } catch (err) {
        renderEstimateLineItems(null);
        log('Civil Str extraction error: ' + (err.message || String(err)));
      }
    }

    function renderHeaders(preview) {
      if (!headersPanel) return;
      if (!preview.headers.length) {
        headersPanel.innerHTML = '<p class="import-panel-empty">No column headers detected in the first '
          + WorkbookReader.HEADER_SCAN_ROWS + ' rows.</p>';
        return;
      }
      var headerNote = preview.headerRowIndex >= 0
        ? 'Detected on row ' + (preview.headerRowIndex + 1) + ':'
        : 'Detected headers:';
      headersPanel.innerHTML = '<p class="import-headers-note">' + escapeHtml(headerNote) + '</p>'
        + '<ul class="import-header-list">'
        + preview.headers.map(function (header, index) {
          return '<li><span class="import-header-col">Col ' + (index + 1) + '</span>'
            + escapeHtml(header) + '</li>';
        }).join('')
        + '</ul>';
    }

    function renderPreview(preview) {
      if (!previewWrap) return;
      if (!preview.rows.length) {
        previewWrap.innerHTML = '<p class="import-panel-empty">Worksheet is empty.</p>';
        return;
      }

      var colCount = 0;
      preview.rows.forEach(function (row) {
        if (row && row.length > colCount) colCount = row.length;
      });
      if (colCount < 1) colCount = preview.headers.length || 1;

      var thead = '<thead><tr><th class="import-row-num">#</th>';
      for (var c = 0; c < colCount; c++) {
        var label = preview.headers[c] ? escapeHtml(preview.headers[c]) : ('Col ' + (c + 1));
        thead += '<th>' + label + '</th>';
      }
      thead += '</tr></thead>';

      var tbody = '<tbody>';
      preview.rows.forEach(function (row, rowIndex) {
        var rowClass = rowIndex === preview.headerRowIndex ? ' class="import-header-row"' : '';
        tbody += '<tr' + rowClass + '><td class="import-row-num">' + (rowIndex + 1) + '</td>';
        for (var col = 0; col < colCount; col++) {
          tbody += '<td>' + escapeHtml(ExcelReaderCellText(row, col)) + '</td>';
        }
        tbody += '</tr>';
      });
      tbody += '</tbody>';

      previewWrap.innerHTML = '<table class="import-preview-table">' + thead + tbody + '</table>';

      if (previewMeta) {
        previewMeta.textContent = 'Showing first ' + preview.previewRowCount + ' of '
          + preview.totalRowCount + ' rows · ' + preview.totalColumnCount + ' columns';
      }
    }

    function ExcelReaderCellText(row, colIndex) {
      var AS = NS.ExcelReader;
      if (!row || colIndex >= row.length) return '';
      return AS ? AS.cellText(row[colIndex]) : String(row[colIndex] == null ? '' : row[colIndex]).trim();
    }

    function selectSheet(sheetName) {
      if (!session) return;
      try {
        WorkbookReader.selectSheet(session, sheetName);
        var preview = WorkbookReader.getSheetPreview(session, sheetName);
        renderSheetList(session.sheetNames, sheetName);
        renderHeaders(preview);
        renderPreview(preview);
        log('Worksheet selected: ' + sheetName);
        runLineItemExtractionForSheet(sheetName, null);
        if (hooks.onSheetPreview) hooks.onSheetPreview(preview, session);
      } catch (err) {
        log('Error: ' + (err.message || String(err)));
      }
    }

    function openFile(file) {
      setStatus(['⏳ Reading workbook…']);
      WorkbookReader.openFromFile(file).then(function (newSession) {
        session = newSession;
        var info = WorkbookReader.getWorkbookInfo(session);
        fileLabel.textContent = info.name;
        renderWorkbookInfo(info);
        renderSheetList(info.sheetNames, session.activeSheetName);

        var preview = WorkbookReader.getSheetPreview(session, session.activeSheetName);
        renderHeaders(preview);
        renderPreview(preview);

        setStatus([
          '✓ Page Loaded',
          '✓ Workbook Opened',
          EichleayDetector ? '✓ Template Detection Ready' : '⏳ Template Detection module loading',
        ]);
        log('Workbook opened: ' + info.name + ' (' + info.sheetCount + ' sheet(s))');
        var detection = runTemplateDetection();
        runLineItemExtractionForSheet(session.activeSheetName, detection);
        if (hooks.onSessionChange) hooks.onSessionChange(session);
        if (hooks.onSheetPreview) hooks.onSheetPreview(preview, session);
      }).catch(function (err) {
        session = null;
        WorkbookReader.clearSession();
        renderTemplateDetection(null);
        renderEstimateLineItems(null);
        fileLabel.textContent = 'No file selected';
        setStatus(['✓ Page Loaded', '✗ ' + (err.message || 'Workbook read failed')]);
        log('Error: ' + (err.message || String(err)));
      });
    }

    chooseBtn.addEventListener('click', function () {
      log('Choose Excel File clicked');
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) {
        fileLabel.textContent = 'No file selected';
        return;
      }
      log('Selected file: ' + file.name);
      openFile(file);
    });
  }

  NS.WorkbookReaderUI = {
    mount: mountWorkbookReaderUI,
  };
})(typeof window !== 'undefined' ? window : global);
