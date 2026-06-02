/**
 * FEL-3 Analyzer Schedule Template Builder
 *
 * RENDER / EDIT / SAVE FLOW
 * -------------------------
 * 1. INIT
 *    Load activities from localStorage (if saved) or data/activities.csv.
 *    Call renderTable() once to build every <tr> from the in-memory array.
 *
 * 2. EDIT (no full re-render while typing)
 *    Event delegation on #schedule-table handles input, change, and blur.
 *    - Text/number/textarea: sync to the activity object on input (live KPIs +
 *      computed Final columns) and persist on blur.
 *    - Checkboxes and selects: sync and save immediately on change.
 *    - updateRowComputed(tr, activity) refreshes Final Name/Dur/Hrs spans and
 *      the excluded-row style WITHOUT rebuilding the row — this fixes the
 *      one-keystroke focus bug from the reference HTML (which called render()
 *      on every input event).
 *
 * 3. FILTER
 *    Filter dropdowns only toggle the row-hidden CSS class. The DOM is never
 *    destroyed during filtering, so focus is preserved.
 *
 * 4. STRUCTURAL CHANGES
 *    Add row, delete selected, and reset call renderTable() because rows must
 *    be created or removed from the DOM.
 *
 * 5. SAVE
 *    saveToStorage() writes the activities array to localStorage. Called after
 *    commits, on explicit Save, and after add/delete/reset.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'fel3-analyzer-schedule-generator-v2';
  /** Relative to index.html — works on GitHub Pages and any static host (no localhost). */
  const CSV_PATH = new URL('data/activities.csv', window.location.href).href;

  const STATUS_OPTIONS = [
    'Not Started',
    'In Progress',
    'Lead Review',
    'Complete',
    'Hold',
    'Delete / Exclude',
  ];

  /** @type {Array<object>} Single source of truth for all activity rows */
  let activities = [];
  let nextInternalId = 1;

  const tbody = document.getElementById('activities-body');
  const table = document.getElementById('schedule-table');
  const statusMessage = document.getElementById('status-message');
  const visibleCountEl = document.getElementById('visible-count');

  const filterDiscipline = document.getElementById('filter-discipline');
  const filterDeliverable = document.getElementById('filter-deliverable');
  const filterInclude = document.getElementById('filter-include');
  const filterStatus = document.getElementById('filter-status');
  const selectAllCheckbox = document.getElementById('select-all');

  // ---------------------------------------------------------------------------
  // Computed values (same logic as reference template)
  // ---------------------------------------------------------------------------

  function finalName(activity) {
    const custom = (activity.customActivityName || '').trim();
    return custom || activity.activityName || '';
  }

  function finalDuration(activity) {
    if (activity.customDuration !== '' && activity.customDuration != null) {
      return Number(activity.customDuration) || 0;
    }
    return Number(activity.originalDuration) || 0;
  }

  function finalHours(activity) {
    if (activity.customHours !== '' && activity.customHours != null) {
      return Number(activity.customHours) || 0;
    }
    return Number(activity.budgetedHours) || 0;
  }

  function formatHours(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  // ---------------------------------------------------------------------------
  // Data loading & persistence
  // ---------------------------------------------------------------------------

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = splitCsvLine(lines[0]).map(normalizeHeader);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = splitCsvLine(line);
      const record = {};
      headers.forEach(function (header, idx) {
        record[header] = values[idx] !== undefined ? values[idx].trim() : '';
      });
      rows.push(csvRecordToActivity(record));
    }
    return rows;
  }

  function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  function normalizeHeader(header) {
    return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  function parseInclude(value) {
    if (!value) return true;
    const v = String(value).toLowerCase();
    return v !== 'false' && v !== '0' && v !== 'no';
  }

  function parseNumber(value) {
    if (value === undefined || value === null || value === '') return '';
    const num = Number(value);
    return Number.isFinite(num) ? num : '';
  }

  function csvRecordToActivity(record) {
    return createActivity({
      include: parseInclude(record.include),
      discipline: record.discipline || '',
      deliverable: record.deliverable || '',
      activityId: record.activity_id || record.activityid || '',
      activityType: record.activity_type || record.activitytype || record.type || '',
      activityName: record.activity_name || record.base_activity_name || record.activityname || '',
      customActivityName: record.custom_activity_name || '',
      originalDuration: parseNumber(record.original_duration || record.base_duration || record.duration),
      customDuration: parseNumber(record.custom_duration),
      budgetedHours: parseNumber(record.budgeted_hours || record.base_hours || record.hours),
      customHours: parseNumber(record.custom_hours),
      owner: record.owner || record.owner_lead || '',
      status: record.status || record.lead_status || 'Not Started',
      leadNotes: record.lead_notes || record.leadnotes || '',
    });
  }

  function createActivity(overrides) {
    const activity = {
      _id: nextInternalId++,
      selected: false,
      include: true,
      discipline: '',
      deliverable: '',
      activityId: '',
      activityType: '',
      activityName: '',
      customActivityName: '',
      originalDuration: '',
      customDuration: '',
      budgetedHours: '',
      customHours: '',
      owner: '',
      status: 'Not Started',
      leadNotes: '',
    };
    return Object.assign(activity, overrides);
  }

  async function loadFromCsv() {
    const response = await fetch(CSV_PATH);
    if (!response.ok) throw new Error('Could not load ' + CSV_PATH);
    return parseCsv(await response.text());
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.activities)) return null;
      nextInternalId = parsed.nextInternalId || 1;
      return parsed.activities.map(rehydrateActivity);
    } catch {
      return null;
    }
  }

  function rehydrateActivity(row) {
    return createActivity({
      _id: row._id,
      selected: !!row.selected,
      include: row.include !== false,
      discipline: row.discipline || '',
      deliverable: row.deliverable || '',
      activityId: row.activityId || '',
      activityType: row.activityType || '',
      activityName: row.activityName || '',
      customActivityName: row.customActivityName || '',
      originalDuration: row.originalDuration ?? '',
      customDuration: row.customDuration ?? '',
      budgetedHours: row.budgetedHours ?? '',
      customHours: row.customHours ?? '',
      owner: row.owner || '',
      status: row.status || 'Not Started',
      leadNotes: row.leadNotes || '',
    });
  }

  function saveToStorage() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nextInternalId: nextInternalId,
        activities: activities,
        savedAt: new Date().toISOString(),
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Render — full table rebuild (structural changes only)
  // ---------------------------------------------------------------------------

  function renderTable() {
    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    activities.forEach(function (activity) {
      fragment.appendChild(buildRow(activity));
    });
    tbody.appendChild(fragment);
    applyFilters();
    updateSummary();
    populateFilterOptions();
    selectAllCheckbox.checked = false;
  }

  function buildRow(activity) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(activity._id);
    if (!activity.include) tr.classList.add('excluded');

    tr.appendChild(buildCheckboxCell('selected', activity.selected, 'Select row for deletion'));
    tr.appendChild(buildCheckboxCell('include', activity.include, 'Include in export'));

    tr.appendChild(buildTextCell('activityId', activity.activityId));
    tr.appendChild(buildTextCell('discipline', activity.discipline));
    tr.appendChild(buildTextCell('deliverable', activity.deliverable));
    tr.appendChild(buildTextCell('activityType', activity.activityType));
    tr.appendChild(buildTextCell('activityName', activity.activityName));
    tr.appendChild(buildTextCell('customActivityName', activity.customActivityName));

    tr.appendChild(buildComputedCell('finalName', finalName(activity)));
    tr.appendChild(buildReadonlyCell(formatHours(activity.originalDuration)));
    tr.appendChild(buildNumberCell('customDuration', activity.customDuration));
    tr.appendChild(buildComputedCell('finalDur', finalDuration(activity)));
    tr.appendChild(buildReadonlyCell(formatHours(activity.budgetedHours)));
    tr.appendChild(buildNumberCell('customHours', activity.customHours));
    tr.appendChild(buildComputedCell('finalHrs', finalHours(activity)));

    tr.appendChild(buildTextCell('owner', activity.owner));
    tr.appendChild(buildStatusCell(activity.status));
    tr.appendChild(buildNotesCell(activity.leadNotes));

    return tr;
  }

  function buildCheckboxCell(field, checked, label) {
    const td = document.createElement('td');
    td.className = field === 'include' ? 'col-include' : 'col-select';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.field = field;
    input.checked = !!checked;
    input.setAttribute('aria-label', label);
    td.appendChild(input);
    return td;
  }

  function buildTextCell(field, value) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.field = field;
    input.value = value ?? '';
    td.appendChild(input);
    return td;
  }

  function buildNumberCell(field, value) {
    const td = document.createElement('td');
    td.className = 'col-num';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = field === 'customHours' ? '0.5' : '1';
    input.dataset.field = field;
    input.value = value === '' || value == null ? '' : value;
    td.appendChild(input);
    return td;
  }

  function buildReadonlyCell(text) {
    const td = document.createElement('td');
    td.className = 'col-num computed';
    td.textContent = text;
    return td;
  }

  function buildComputedCell(name, value) {
    const td = document.createElement('td');
    td.className = 'computed';
    td.dataset.computed = name;
    td.textContent = name === 'finalHrs' ? formatHours(value) : String(value);
    return td;
  }

  function buildStatusCell(value) {
    const td = document.createElement('td');
    const select = document.createElement('select');
    select.dataset.field = 'status';
    STATUS_OPTIONS.forEach(function (option) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (option === value) opt.selected = true;
      select.appendChild(opt);
    });
    td.appendChild(select);
    return td;
  }

  function buildNotesCell(value) {
    const td = document.createElement('td');
    const textarea = document.createElement('textarea');
    textarea.dataset.field = 'leadNotes';
    textarea.rows = 1;
    textarea.value = value ?? '';
    td.appendChild(textarea);
    return td;
  }

  /**
   * Update computed Final columns and excluded styling for one row only.
   * Called during editing instead of renderTable().
   */
  function updateRowComputed(tr, activity) {
    const finalNameEl = tr.querySelector('[data-computed="finalName"]');
    const finalDurEl = tr.querySelector('[data-computed="finalDur"]');
    const finalHrsEl = tr.querySelector('[data-computed="finalHrs"]');
    if (finalNameEl) finalNameEl.textContent = finalName(activity);
    if (finalDurEl) finalDurEl.textContent = String(finalDuration(activity));
    if (finalHrsEl) finalHrsEl.textContent = formatHours(finalHours(activity));
    tr.classList.toggle('excluded', !activity.include);
  }

  // ---------------------------------------------------------------------------
  // Edit — delegated handlers; never call renderTable() on keypress
  // ---------------------------------------------------------------------------

  function getActivityByRow(tr) {
    const id = Number(tr.dataset.id);
    return activities.find(function (a) {
      return a._id === id;
    });
  }

  function syncControlToActivity(control, activity) {
    const field = control.dataset.field;
    if (!field || !activity) return;

    if (control.type === 'checkbox') {
      activity[field] = control.checked;
    } else if (control.type === 'number') {
      activity[field] = control.value === '' ? '' : Number(control.value);
    } else {
      activity[field] = control.value;
    }
  }

  function handleTableChange(event) {
    const control = event.target;
    if (!control.dataset.field) return;

    const tr = control.closest('tr');
    const activity = getActivityByRow(tr);
    syncControlToActivity(control, activity);
    updateRowComputed(tr, activity);
    saveToStorage();
    applyFilters();
    updateSummary();
  }

  function handleTableBlur(event) {
    const control = event.target;
    if (!control.dataset.field || control.type === 'checkbox') return;

    const tr = control.closest('tr');
    const activity = getActivityByRow(tr);
    syncControlToActivity(control, activity);
    updateRowComputed(tr, activity);
    saveToStorage();
    updateSummary();
  }

  function handleTableInput(event) {
    const control = event.target;
    if (!control.dataset.field || control.type === 'checkbox') return;

    const tr = control.closest('tr');
    const activity = getActivityByRow(tr);
    syncControlToActivity(control, activity);
    updateRowComputed(tr, activity);
    updateSummary();
  }

  // ---------------------------------------------------------------------------
  // Filters — visibility only
  // ---------------------------------------------------------------------------

  function getFilterValues() {
    return {
      discipline: filterDiscipline.value,
      deliverable: filterDeliverable.value,
      include: filterInclude.value,
      status: filterStatus.value,
    };
  }

  function rowMatchesFilters(activity) {
    const f = getFilterValues();
    if (f.discipline && activity.discipline !== f.discipline) return false;
    if (f.deliverable && activity.deliverable !== f.deliverable) return false;
    if (f.include === 'yes' && !activity.include) return false;
    if (f.include === 'no' && activity.include) return false;
    if (f.status && activity.status !== f.status) return false;
    return true;
  }

  function applyFilters() {
    let visible = 0;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      const activity = getActivityByRow(tr);
      const show = rowMatchesFilters(activity);
      tr.classList.toggle('row-hidden', !show);
      if (show) visible++;
    });
    visibleCountEl.textContent = visible + ' visible of ' + activities.length + ' total';
    selectAllCheckbox.checked = false;
  }

  function populateFilterOptions() {
    populateSelect(filterDiscipline, uniqueValues('discipline'), 'All disciplines');
    populateSelect(filterDeliverable, uniqueValues('deliverable'), 'All deliverables');
    populateSelect(filterStatus, uniqueValues('status', STATUS_OPTIONS), 'All statuses');
  }

  function uniqueValues(field, fallback) {
    const set = new Set(fallback || []);
    activities.forEach(function (a) {
      if (a[field]) set.add(a[field]);
    });
    return Array.from(set).sort();
  }

  function populateSelect(selectEl, values, allLabel) {
    const current = selectEl.value;
    selectEl.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = allLabel;
    selectEl.appendChild(allOpt);
    values.forEach(function (val) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      selectEl.appendChild(opt);
    });
    if (values.includes(current) || current === '') selectEl.value = current;
  }

  // ---------------------------------------------------------------------------
  // Summary KPIs (match reference cards)
  // ---------------------------------------------------------------------------

  function updateSummary() {
    const included = activities.filter(function (a) {
      return a.include;
    });
    const includedHours = included.reduce(function (sum, a) {
      return sum + finalHours(a);
    }, 0);
    const disciplines = new Set(included.map(function (a) {
      return a.discipline;
    }).filter(Boolean));
    const reviewHold = activities.filter(function (a) {
      return a.include && (a.status === 'Lead Review' || a.status === 'Hold');
    }).length;

    document.getElementById('kpi-activities').textContent = included.length.toLocaleString();
    document.getElementById('kpi-hours').textContent = formatHours(includedHours);
    document.getElementById('kpi-disciplines').textContent = String(disciplines.size);
    document.getElementById('kpi-review').textContent = String(reviewHold);

    let visible = 0;
    tbody.querySelectorAll('tr:not(.row-hidden)').forEach(function () {
      visible++;
    });
    if (activities.length) {
      visibleCountEl.textContent = visible + ' visible of ' + activities.length + ' total';
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar actions
  // ---------------------------------------------------------------------------

  function showStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('error', !!isError);
    if (message && !isError) {
      window.setTimeout(function () {
        if (statusMessage.textContent === message) statusMessage.textContent = '';
      }, 3000);
    }
  }

  function addActivity() {
    activities.unshift(
      createActivity({
        include: true,
        activityId: 'NEW_' + String(Date.now()).slice(-6),
        discipline: filterDiscipline.value || '',
        deliverable: filterDeliverable.value || '',
        activityType: 'Custom',
        activityName: '',
        customActivityName: 'New custom activity',
        status: 'Not Started',
      })
    );
    renderTable();
    saveToStorage();
    showStatus('New activity added.');
  }

  function deleteSelected() {
    const toDelete = activities.filter(function (a) {
      return a.selected;
    });
    if (!toDelete.length) {
      showStatus('Select one or more rows to delete.', true);
      return;
    }
    if (!window.confirm('Delete ' + toDelete.length + ' selected activit' + (toDelete.length === 1 ? 'y' : 'ies') + '?')) {
      return;
    }
    const ids = new Set(toDelete.map(function (a) {
      return a._id;
    }));
    activities = activities.filter(function (a) {
      return !ids.has(a._id);
    });
    renderTable();
    saveToStorage();
    showStatus(toDelete.length + ' activit' + (toDelete.length === 1 ? 'y' : 'ies') + ' deleted.');
  }

  function exportIncludedCsv() {
    const included = activities.filter(function (a) {
      return a.include;
    });
    if (!included.length) {
      showStatus('No included activities to export.', true);
      return;
    }

    const headers = [
      'Activity ID',
      'Activity Name',
      'Discipline',
      'Deliverable',
      'Activity Type',
      'Original Duration',
      'Budgeted Hours',
      'Owner / Lead',
      'Lead Status',
      'Lead Notes',
    ];
    const lines = [headers.join(',')];
    included.forEach(function (a) {
      lines.push(
        [
          a.activityId,
          finalName(a),
          a.discipline,
          a.deliverable,
          a.activityType,
          finalDuration(a),
          finalHours(a),
          a.owner,
          a.status,
          a.leadNotes,
        ]
          .map(csvEscape)
          .join(',')
      );
    });

    downloadFile('FEL3_Analyzer_Included_Activities.csv', lines.join('\n'));
    showStatus('Exported ' + included.length + ' included activities.');
  }

  function csvEscape(value) {
    const str = value == null ? '' : String(value);
    return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function resetToTemplate() {
    if (
      activities.length &&
      !window.confirm('Reset all activities to the template in data/activities.csv? Saved edits will be lost.')
    ) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      nextInternalId = 1;
      activities = await loadFromCsv();
      renderTable();
      saveToStorage();
      showStatus('Schedule reset to template.');
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  function handleSelectAll(event) {
    const checked = event.target.checked;
    tbody.querySelectorAll('tr:not(.row-hidden)').forEach(function (tr) {
      const activity = getActivityByRow(tr);
      activity.selected = checked;
      const cb = tr.querySelector('input[data-field="selected"]');
      if (cb) cb.checked = checked;
    });
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async function init() {
    table.addEventListener('change', handleTableChange);
    table.addEventListener('blur', handleTableBlur, true);
    table.addEventListener('input', handleTableInput);

    document.getElementById('btn-add').addEventListener('click', addActivity);
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-save').addEventListener('click', function () {
      saveToStorage();
      showStatus('Schedule saved to browser storage.');
    });
    document.getElementById('btn-reset').addEventListener('click', resetToTemplate);
    document.getElementById('btn-export').addEventListener('click', exportIncludedCsv);
    selectAllCheckbox.addEventListener('change', handleSelectAll);

    [filterDiscipline, filterDeliverable, filterInclude, filterStatus].forEach(function (el) {
      el.addEventListener('change', applyFilters);
    });

    const stored = loadFromStorage();
    if (stored && stored.length) {
      activities = stored;
      activities.forEach(function (a) {
        if (a._id >= nextInternalId) nextInternalId = a._id + 1;
      });
      renderTable();
      showStatus('Loaded saved schedule from browser storage.');
    } else {
      try {
        activities = await loadFromCsv();
        renderTable();
        saveToStorage();
        showStatus('Loaded ' + activities.length + ' activities from data/activities.csv.');
      } catch (err) {
        showStatus(err.message + ' See README.', true);
      }
    }
  }

  init();
})();
