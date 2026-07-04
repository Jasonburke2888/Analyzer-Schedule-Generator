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

    var chooseBtn = document.getElementById('btn-choose-excel');
    var fileInput = document.getElementById('excel-file-input');
    var fileLabel = document.getElementById('selected-file-label');
    var statusList = document.getElementById('import-engine-status');
    var workbookPanel = document.getElementById('workbook-info-panel');
    var sheetListEl = document.getElementById('worksheet-list');
    var headersPanel = document.getElementById('column-headers-panel');
    var previewWrap = document.getElementById('preview-table-wrap');
    var previewMeta = document.getElementById('preview-meta');
    var templateDetectionPanel = document.getElementById('template-detection-result');

    var EichleayDetector = NS.EichleayTemplateDetector;

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
        runTemplateDetection();
        if (hooks.onSessionChange) hooks.onSessionChange(session);
        if (hooks.onSheetPreview) hooks.onSheetPreview(preview, session);
      }).catch(function (err) {
        session = null;
        WorkbookReader.clearSession();
        renderTemplateDetection(null);
        fileLabel.textContent = 'No file selected';
        setStatus(['✓ Page Loaded', '✗ ' + (err.message || 'Workbook read failed')]);
        log('Error: ' + (err.message || String(err)));
      });
    }

    chooseBtn.addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) {
        fileLabel.textContent = 'No file selected';
        return;
      }
      openFile(file);
    });
  }

  NS.WorkbookReaderUI = {
    mount: mountWorkbookReaderUI,
  };
})(typeof window !== 'undefined' ? window : global);
