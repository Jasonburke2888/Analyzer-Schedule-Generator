/**
 * FEL-3 Analyzer Schedule Template Builder (v2.4)
 *
 * RENDER / EDIT / SAVE FLOW
 * -------------------------
 * 1. INIT — Load from localStorage or data/activities.csv; seed default lists;
 *    renderTable() once.
 * 2. EDIT — Event delegation on #schedule-table; no full re-render on keypress.
 *    Selects (discipline, deliverable, owner) sync on change; text fields on blur.
 * 3. FILTER — CSS row-hidden only; focus preserved.
 * 4. STRUCTURAL — add/delete/reset call renderTable().
 * 5. SAVE — activities, lists, project metadata → localStorage.
 * 6. LISTS — Manage Lists modal (tabs) for projects/disciplines/deliverables;
 *    inline "+ Add ..." in grid dropdowns; refreshListDropdowns() updates selects
 *    without rebuilding the table.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'fel3-analyzer-schedule-generator-v4';
  const STORAGE_KEY_LEGACY = 'fel3-analyzer-schedule-generator-v3';
  const CSV_PATH = new URL('data/activities.csv', window.location.href).href;

  const ADD_DISCIPLINE = '__add_discipline__';
  const ADD_DELIVERABLE = '__add_deliverable__';
  const ADD_PROJECT = '__add_project__';
  const ADD_PROJECT_ID = '__add_project_id__';
  const ADD_ACTION = '__add_action__';
  const ADD_PM = '__add_pm__';
  const ADD_OWNER = '__add_owner__';

  const DEFAULT_PROJECTS = ['FEL-3 Analyzer Template'];
  const DEFAULT_PROJECT_IDS = ['1517', '1607'];
  const DEFAULT_DISCIPLINES = [
    'Engineering', 'PMAC', 'Process', 'Mechanical', 'Electrical', 'Instrumentation',
    'Civil', 'Structural', 'Project Controls', 'Procurement', 'Construction',
  ];
  const DEFAULT_DELIVERABLES = [
    'Engineering', 'Kick-Off', 'APP', 'Equipment List', 'PFD', 'P&ID', 'Datasheet',
    'Instrument Index', 'Plot Plan', 'Model Review', 'Estimate', 'Schedule',
    'Procurement', 'Construction Support',
  ];
  const DEFAULT_ACTIONS = [
    'Develop', 'Perform', 'Issue', 'Review', 'Incorporate', 'Approved', 'Finalize', 'Custom',
  ];
  const DEFAULT_PMS = ['Unassigned', 'Joe Smith', 'Other'];
  const DEFAULT_ACTIVITY_OWNERS = [
    'Unassigned', 'Process', 'Mechanical', 'Electrical', 'Instrumentation', 'Civil',
    'Structural', 'PMAC', 'Project Controls', 'Procurement', 'Construction', 'Other',
  ];
  const DEFAULT_COLUMN_WIDTHS = {
    select: 32,
    include: 45,
    activityId: 70,
    discipline: 140,
    deliverable: 150,
    action: 85,
    baseName: 240,
    finalName: 220,
    baseDur: 55,
    customDur: 65,
    baseHrs: 55,
    customHrs: 65,
    owner: 110,
    status: 85,
    notes: 200,
  };
  const COLUMN_ORDER = [
    'select', 'include', 'activityId', 'discipline', 'deliverable', 'action',
    'baseName', 'finalName', 'baseDur', 'customDur', 'baseHrs', 'customHrs',
    'owner', 'status', 'notes',
  ];
  const STICKY_COLUMNS = ['include', 'activityId', 'discipline'];
  const FEL_STAGES = ['FEL-1', 'FEL-2', 'FEL-3', 'FEL-4', 'Construction'];
  const STATUS_OPTIONS = [
    'Not Started', 'In Progress', 'Lead Review', 'Complete', 'Hold', 'Delete / Exclude',
  ];

  let activities = [];
  let nextInternalId = 1;
  let lists = {
    projects: [],
    projectIds: [],
    disciplines: [],
    deliverables: [],
    actions: [],
    pms: [],
    activityOwners: [],
  };
  let projectSettings = {
    name: '',
    id: '',
    client: '',
    felStage: 'FEL-3',
    pm: 'Unassigned',
  };
  let projectsData = {};
  let currentProjectName = '';
  let columnWidths = {};
  let activeManageTab = 'projects';
  let resizeState = null;

  const tbody = document.getElementById('activities-body');
  const table = document.getElementById('schedule-table');
  const colgroup = document.getElementById('schedule-cols');
  const statusMessage = document.getElementById('status-message');
  const visibleCountEl = document.getElementById('visible-count');
  const projectSelect = document.getElementById('project-select');
  const projectIdSelect = document.getElementById('project-id-select');
  const projectClientInput = document.getElementById('project-client');
  const projectFelStageSelect = document.getElementById('project-fel-stage');
  const pmSelect = document.getElementById('pm-select');
  const filterDiscipline = document.getElementById('filter-discipline');
  const filterDeliverable = document.getElementById('filter-deliverable');
  const filterAction = document.getElementById('filter-action');
  const filterInclude = document.getElementById('filter-include');
  const filterStatus = document.getElementById('filter-status');
  const selectAllCheckbox = document.getElementById('select-all');
  const manageModal = document.getElementById('manage-lists-modal');
  const deletePasswordModal = document.getElementById('delete-password-modal');
  const deletePasswordInput = document.getElementById('delete-password-input');
  const deletePasswordMessage = document.getElementById('delete-password-message');
  let pendingDeleteIds = null;

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  function finalName(activity) {
    const action = (activity.activityType || '').trim();
    const deliverable = (activity.deliverable || '').trim();
    if (action && deliverable) return action + ' - ' + deliverable;
    if (action) return action;
    if (deliverable) return deliverable;
    return '';
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

  /** Strip project prefix from Activity ID for grid display (1607_31010 → 31010). */
  function stripActivityIdPrefix(id) {
    if (!id) return '';
    const s = String(id).trim();
    const idx = s.indexOf('_');
    return idx >= 0 ? s.slice(idx + 1) : s;
  }

  /** Prepend current Project ID for CSV export (31010 + 1517 → 1517_31010). */
  function exportActivityId(gridId) {
    const suffix = stripActivityIdPrefix(gridId);
    if (!suffix) return '';
    const pid = (projectSettings.id || '').trim();
    return pid ? pid + '_' + suffix : suffix;
  }

  /** Highest numeric Activity ID suffix in the grid (ignores non-numeric IDs). */
  function getHighestNumericActivityId() {
    let highest = 0;
    activities.forEach(function (a) {
      const id = stripActivityIdPrefix(a.activityId);
      if (/^\d+$/.test(id)) {
        const n = parseInt(id, 10);
        if (n > highest) highest = n;
      }
    });
    return highest;
  }

  /** Next Activity ID = highest numeric suffix + 10. */
  function nextActivityId() {
    const highest = getHighestNumericActivityId();
    return highest > 0 ? String(highest + 10) : '10';
  }

  function sortUnique(values) {
    return Array.from(new Set(values.filter(Boolean).map(function (v) {
      return String(v).trim();
    }).filter(Boolean))).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  // ---------------------------------------------------------------------------
  // CSV & activity model
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
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else current += ch;
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
      activityId: stripActivityIdPrefix(record.activity_id || record.activityid || ''),
      activityType: record.activity_type || record.activitytype || record.type || '',
      activityName: record.activity_name || record.base_activity_name || record.activityname || '',
      customActivityName: record.custom_activity_name || '',
      originalDuration: parseNumber(record.original_duration || record.base_duration || record.duration),
      customDuration: parseNumber(record.custom_duration),
      budgetedHours: parseNumber(record.budgeted_hours || record.base_hours || record.hours),
      customHours: parseNumber(record.custom_hours),
      owner: record.owner || record.activity_owner || record.owner_lead || '',
      status: normalizeTemplateStatus(record.status || record.lead_status || ''),
      leadNotes: record.lead_notes || record.leadnotes || '',
    });
  }

  function normalizeTemplateStatus(value) {
    const v = (value || '').trim();
    if (!v || v === 'Complete') return 'Not Started';
    return v;
  }

  function createActivity(overrides) {
    return Object.assign({
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
    }, overrides);
  }

  function rehydrateActivity(row) {
    return createActivity({
      _id: row._id,
      selected: !!row.selected,
      include: row.include !== false,
      discipline: row.discipline || '',
      deliverable: row.deliverable || '',
      activityId: stripActivityIdPrefix(row.activityId || ''),
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

  async function loadFromCsv() {
    const response = await fetch(CSV_PATH);
    if (!response.ok) throw new Error('Could not load ' + CSV_PATH);
    return parseCsv(await response.text());
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  function persistCurrentProject() {
    const name = (projectSettings.name || currentProjectName || '').trim();
    if (!name) return;
    currentProjectName = name;
    projectSettings.name = name;
    projectsData[name] = {
      activities: activities,
      settings: {
        name: name,
        id: projectSettings.id || '',
        client: projectSettings.client || '',
        felStage: projectSettings.felStage || 'FEL-3',
        pm: projectSettings.pm || 'Unassigned',
      },
    };
  }

  function applyProjectSettings(settings) {
    projectSettings = {
      name: settings.name || currentProjectName || '',
      id: settings.id || '',
      client: settings.client || '',
      felStage: settings.felStage || 'FEL-3',
      pm: settings.pm || 'Unassigned',
    };
  }

  function switchToProject(name) {
    if (!name) return;
    persistCurrentProject();
    currentProjectName = name;
    if (!lists.projects.includes(name)) addToList('projects', name);
    const bundle = projectsData[name];
    if (bundle) {
      activities = bundle.activities.map(rehydrateActivity);
      applyProjectSettings(bundle.settings);
    } else {
      activities = [];
      applyProjectSettings({
        name: name,
        id: lists.projectIds[0] || '',
        client: '',
        felStage: 'FEL-3',
        pm: 'Unassigned',
      });
      projectsData[name] = {
        activities: activities,
        settings: Object.assign({}, projectSettings),
      };
    }
    activities.forEach(function (a) {
      if (a._id >= nextInternalId) nextInternalId = a._id + 1;
    });
    mergeListsFromActivities(activities);
    syncProjectSetupUI();
    renderTable();
    saveToStorage();
  }

  function handleNewProject() {
    const name = promptNewListItem('New project name:');
    if (!name) return;
    if (lists.projects.includes(name)) {
      showStatus('Project "' + name + '" already exists.', true);
      return;
    }
    persistCurrentProject();
    addToList('projects', name);
    projectsData[name] = {
      activities: [],
      settings: {
        name: name,
        id: lists.projectIds[0] || '',
        client: '',
        felStage: 'FEL-3',
        pm: 'Unassigned',
      },
    };
    switchToProject(name);
    showStatus('Created project "' + name + '".');
  }

  function handleCloneProject() {
    const source = projectSettings.name || currentProjectName;
    if (!source) { showStatus('No project selected to clone.', true); return; }
    const name = promptNewListItem('Clone "' + source + '" as:');
    if (!name || name === source) return;
    if (lists.projects.includes(name)) {
      showStatus('Project "' + name + '" already exists.', true);
      return;
    }
    persistCurrentProject();
    addToList('projects', name);
    projectsData[name] = {
      activities: JSON.parse(JSON.stringify(activities)),
      settings: Object.assign({}, projectSettings, { name: name }),
    };
    switchToProject(name);
    showStatus('Cloned "' + source + '" to "' + name + '".');
  }

  function handleDeleteProject() {
    const name = projectSettings.name || currentProjectName;
    if (!name) return;
    if (lists.projects.length <= 1) {
      showStatus('At least one project must remain.', true);
      return;
    }
    if (!window.confirm('Delete project "' + name + '" and all its saved activities?')) return;
    delete projectsData[name];
    const idx = lists.projects.indexOf(name);
    if (idx !== -1) lists.projects.splice(idx, 1);
    const next = lists.projects[0] || DEFAULT_PROJECTS[0];
    currentProjectName = '';
    switchToProject(next);
    showStatus('Deleted project "' + name + '".');
  }

  function ensureDefaultLists() {
    if (!lists.projects.length) lists.projects = DEFAULT_PROJECTS.slice();
    if (!lists.projectIds.length) lists.projectIds = DEFAULT_PROJECT_IDS.slice();
    if (!lists.disciplines.length) lists.disciplines = DEFAULT_DISCIPLINES.slice();
    if (!lists.deliverables.length) lists.deliverables = DEFAULT_DELIVERABLES.slice();
    if (!lists.actions.length) lists.actions = DEFAULT_ACTIONS.slice();
    if (!lists.pms.length) lists.pms = DEFAULT_PMS.slice();
    if (!lists.activityOwners.length) lists.activityOwners = DEFAULT_ACTIVITY_OWNERS.slice();
    if (!projectSettings.name && lists.projects.length) {
      projectSettings.name = lists.projects[0];
    }
    if (!projectSettings.id && lists.projectIds.length) {
      projectSettings.id = lists.projectIds[0];
    }
    if (!projectSettings.felStage) projectSettings.felStage = 'FEL-3';
    if (!projectSettings.pm) projectSettings.pm = 'Unassigned';
  }

  function mergeListsFromActivities(source) {
    const rows = source || activities;
    lists.disciplines = sortUnique(lists.disciplines.concat(rows.map(function (a) { return a.discipline; })));
    lists.deliverables = sortUnique(lists.deliverables.concat(rows.map(function (a) { return a.deliverable; })));
    lists.actions = sortUnique(lists.actions.concat(rows.map(function (a) { return a.activityType; })));
    lists.activityOwners = sortUnique(lists.activityOwners.concat(rows.map(function (a) { return a.owner; })));
  }

  function migrateParsedStorage(parsed) {
    if (parsed.lists) {
      lists.projects = Array.isArray(parsed.lists.projects) ? parsed.lists.projects : [];
      lists.projectIds = Array.isArray(parsed.lists.projectIds) ? parsed.lists.projectIds : [];
      lists.disciplines = Array.isArray(parsed.lists.disciplines) ? parsed.lists.disciplines : [];
      lists.deliverables = Array.isArray(parsed.lists.deliverables) ? parsed.lists.deliverables : [];
      lists.actions = Array.isArray(parsed.lists.actions) ? parsed.lists.actions : [];
      lists.pms = Array.isArray(parsed.lists.pms) ? parsed.lists.pms : [];
      lists.activityOwners = Array.isArray(parsed.lists.activityOwners) ? parsed.lists.activityOwners : [];
      if (!lists.pms.length && Array.isArray(parsed.lists.disciplineLeads)) {
        lists.pms = parsed.lists.disciplineLeads.slice();
      }
      if (!lists.actions.length && Array.isArray(parsed.lists.activityTypes)) {
        lists.actions = parsed.lists.activityTypes.slice();
      }
      if (!lists.projectIds.length && parsed.project && parsed.project.id) {
        lists.projectIds = [String(parsed.project.id)];
      }
    }
    if (parsed.project) {
      projectSettings.name = parsed.project.name || '';
      projectSettings.id = parsed.project.id || '';
      projectSettings.client = parsed.project.client || '';
      projectSettings.felStage = parsed.project.felStage || 'FEL-3';
      projectSettings.pm = parsed.project.pm || parsed.project.disciplineLead || 'Unassigned';
    }
    if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
      columnWidths = Object.assign({}, DEFAULT_COLUMN_WIDTHS, parsed.columnWidths);
    } else {
      columnWidths = Object.assign({}, DEFAULT_COLUMN_WIDTHS);
    }
  }

  function loadFromStorage() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(STORAGE_KEY_LEGACY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      nextInternalId = parsed.nextInternalId || 1;
      migrateParsedStorage(parsed);

      if (parsed.projectsData && typeof parsed.projectsData === 'object') {
        projectsData = parsed.projectsData;
        currentProjectName = parsed.currentProjectName || projectSettings.name || lists.projects[0] || '';
        const bundle = projectsData[currentProjectName];
        if (bundle && Array.isArray(bundle.activities)) {
          ensureDefaultLists();
          applyProjectSettings(bundle.settings || { name: currentProjectName });
          const rows = bundle.activities.map(rehydrateActivity);
          rows.forEach(function (a) { a.activityId = stripActivityIdPrefix(a.activityId); });
          return rows;
        }
      }

      if (!Array.isArray(parsed.activities)) return null;
      ensureDefaultLists();
      const legacyName = projectSettings.name || lists.projects[0] || DEFAULT_PROJECTS[0];
      currentProjectName = legacyName;
      const rows = parsed.activities.map(rehydrateActivity);
      rows.forEach(function (a) { a.activityId = stripActivityIdPrefix(a.activityId); });
      projectsData[legacyName] = {
        activities: rows,
        settings: Object.assign({}, projectSettings, { name: legacyName }),
      };
      return rows;
    } catch {
      return null;
    }
  }

  function saveToStorage() {
    persistCurrentProject();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nextInternalId: nextInternalId,
      projectsData: projectsData,
      currentProjectName: currentProjectName,
      lists: lists,
      columnWidths: columnWidths,
      savedAt: new Date().toISOString(),
    }));
  }

  function syncProjectSetupUI() {
    projectClientInput.value = projectSettings.client || '';
    populateFelStageSelect();
    populatePmSelect();
    populateProjectSelect();
    populateProjectIdSelect();
  }

  function populateFelStageSelect() {
    projectFelStageSelect.innerHTML = '';
    FEL_STAGES.forEach(function (stage) {
      const opt = document.createElement('option');
      opt.value = stage;
      opt.textContent = stage;
      if (stage === (projectSettings.felStage || 'FEL-3')) opt.selected = true;
      projectFelStageSelect.appendChild(opt);
    });
  }

  function getPmOptions() {
    return sortUnique(lists.pms.concat([projectSettings.pm]));
  }

  function populatePmSelect() {
    fillListSelect(pmSelect, getPmOptions(), {
      blankLabel: undefined,
      currentValue: projectSettings.pm || 'Unassigned',
      addValue: ADD_PM,
      addLabel: '+ Add PM...',
    });
  }

  function getProjectIdOptions() {
    return sortUnique(lists.projectIds.concat([projectSettings.id]));
  }

  function populateProjectIdSelect() {
    fillListSelect(projectIdSelect, getProjectIdOptions(), {
      blankLabel: '—',
      currentValue: projectSettings.id || '',
      addValue: ADD_PROJECT_ID,
      addLabel: '+ Add Project ID...',
    });
  }

  function getActionOptions(currentValue) {
    return sortUnique(lists.actions.concat([currentValue]));
  }

  // ---------------------------------------------------------------------------
  // List helpers & dropdown fill
  // ---------------------------------------------------------------------------

  function getDisciplineOptions(currentValue) {
    return sortUnique(lists.disciplines.concat([currentValue]));
  }

  function getDeliverableOptions(currentValue) {
    return sortUnique(lists.deliverables.concat([currentValue]));
  }

  function getProjectOptions() {
    return sortUnique(lists.projects.concat([projectSettings.name]));
  }

  function getOwnerOptions(currentValue) {
    return sortUnique(lists.activityOwners.concat([currentValue]));
  }

  function promptNewListItem(label) {
    const name = window.prompt(label);
    if (name == null) return null;
    const trimmed = name.trim();
    if (!trimmed) { showStatus('Name cannot be empty.', true); return null; }
    return trimmed;
  }

  function addToList(listKey, value) {
    if (!lists[listKey].includes(value)) {
      lists[listKey].push(value);
      lists[listKey].sort(function (a, b) { return a.localeCompare(b); });
    }
  }

  function fillListSelect(selectEl, options, config) {
    const current = config.currentValue != null ? config.currentValue : selectEl.value;
    selectEl.innerHTML = '';
    if (config.blankLabel !== undefined) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = config.blankLabel;
      selectEl.appendChild(blank);
    }
    options.forEach(function (val) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      selectEl.appendChild(opt);
    });
    if (config.addValue && config.addLabel) {
      const addOpt = document.createElement('option');
      addOpt.value = config.addValue;
      addOpt.textContent = config.addLabel;
      addOpt.className = 'add-option';
      selectEl.appendChild(addOpt);
    }
    if (current && !options.includes(current) && current !== config.addValue) {
      const extra = document.createElement('option');
      extra.value = current;
      extra.textContent = current;
      selectEl.insertBefore(extra, selectEl.querySelector('option.add-option') || null);
    }
    selectEl.value = options.includes(current) || current === '' || !current ? (current || '') : current;
  }

  function refreshListDropdowns() {
    populateFilterOptions();
    populateProjectSelect();
    populateProjectIdSelect();
    populatePmSelect();
    tbody.querySelectorAll('select[data-field="discipline"]').forEach(function (sel) {
      const activity = getActivityByRow(sel.closest('tr'));
      if (activity) {
        fillListSelect(sel, getDisciplineOptions(activity.discipline), {
          blankLabel: '', currentValue: activity.discipline,
          addValue: ADD_DISCIPLINE, addLabel: '+ Add Discipline...',
        });
      }
    });
    tbody.querySelectorAll('select[data-field="deliverable"]').forEach(function (sel) {
      const activity = getActivityByRow(sel.closest('tr'));
      if (activity) {
        fillListSelect(sel, getDeliverableOptions(activity.deliverable), {
          blankLabel: '', currentValue: activity.deliverable,
          addValue: ADD_DELIVERABLE, addLabel: '+ Add Deliverable...',
        });
      }
    });
    tbody.querySelectorAll('select[data-field="activityType"]').forEach(function (sel) {
      const activity = getActivityByRow(sel.closest('tr'));
      if (activity) {
        fillListSelect(sel, getActionOptions(activity.activityType), {
          blankLabel: '', currentValue: activity.activityType,
          addValue: ADD_ACTION, addLabel: '+ Add Action...',
        });
      }
    });
    tbody.querySelectorAll('select[data-field="owner"]').forEach(function (sel) {
      const activity = getActivityByRow(sel.closest('tr'));
      if (activity) {
        fillListSelect(sel, getPmOptions(activity.owner), {
          blankLabel: '—',
          currentValue: activity.owner,
          addValue: ADD_PM,
          addLabel: '+ Add Discipline Lead...',
        });
      }
    });
  }

  function populateProjectSelect() {
    fillListSelect(projectSelect, getProjectOptions(), {
      blankLabel: '— Select project —',
      currentValue: projectSettings.name,
      addValue: ADD_PROJECT,
      addLabel: '+ Add Project...',
    });
  }

  function renameListValue(listKey, oldName, newName) {
    if (oldName === newName) return;
    const idx = lists[listKey].indexOf(oldName);
    if (idx === -1) return;
    if (lists[listKey].includes(newName)) {
      showStatus('"' + newName + '" already exists.', true);
      return false;
    }
    lists[listKey][idx] = newName;
    lists[listKey].sort(function (a, b) { return a.localeCompare(b); });
    if (listKey === 'projects' && projectSettings.name === oldName) {
      projectSettings.name = newName;
    }
    if (listKey === 'projects' && projectsData[oldName]) {
      projectsData[newName] = projectsData[oldName];
      projectsData[newName].settings.name = newName;
      delete projectsData[oldName];
      if (currentProjectName === oldName) currentProjectName = newName;
    }
    if (listKey === 'projectIds' && projectSettings.id === oldName) {
      projectSettings.id = newName;
    }
    if (listKey === 'pms' && projectSettings.pm === oldName) {
      projectSettings.pm = newName;
    }
    const fieldMap = {
      disciplines: 'discipline',
      deliverables: 'deliverable',
      actions: 'activityType',
      activityOwners: 'owner',
    };
    const field = fieldMap[listKey];
    if (field) {
      activities.forEach(function (a) {
        if (a[field] === oldName) a[field] = newName;
      });
    }
    return true;
  }

  function deleteListValue(listKey, name) {
    const idx = lists[listKey].indexOf(name);
    if (idx === -1) return false;
    if (listKey === 'projects' && lists.projects.length <= 1) {
      showStatus('At least one project must remain.', true);
      return false;
    }
    if (listKey === 'projectIds' && lists.projectIds.length <= 1) {
      showStatus('At least one project ID must remain.', true);
      return false;
    }
    if (listKey === 'pms' && lists.pms.length <= 1) {
      showStatus('At least one PM must remain.', true);
      return false;
    }
    lists[listKey].splice(idx, 1);
    if (listKey === 'projects') {
      delete projectsData[name];
      if (projectSettings.name === name || currentProjectName === name) {
        if (lists.projects.length) switchToProject(lists.projects[0]);
      }
      return true;
    }
    if (listKey === 'projectIds' && projectSettings.id === name) {
      projectSettings.id = lists.projectIds[0] || '';
    }
    if (listKey === 'pms' && projectSettings.pm === name) {
      projectSettings.pm = lists.pms[0] || 'Unassigned';
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Manage Lists modal (tabs)
  // ---------------------------------------------------------------------------

  function openManageListsModal() {
    activeManageTab = 'projects';
    switchManageTab('projects');
    renderListEditors();
    manageModal.hidden = false;
    manageModal.setAttribute('aria-hidden', 'false');
  }

  function closeManageListsModal() {
    manageModal.hidden = true;
    manageModal.setAttribute('aria-hidden', 'true');
  }

  function switchManageTab(tabName) {
    activeManageTab = tabName;
    manageModal.querySelectorAll('.modal-tab').forEach(function (btn) {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    manageModal.querySelectorAll('.tab-panel').forEach(function (panel) {
      const isActive = panel.id === 'tab-panel-' + tabName;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
  }

  function renderListEditors() {
    ['projects', 'projectIds', 'disciplines', 'deliverables', 'actions', 'pms'].forEach(function (listKey) {
      const ul = document.getElementById('list-editor-' + listKey);
      ul.innerHTML = '';
      lists[listKey].forEach(function (name) {
        ul.appendChild(buildListEditorRow(listKey, name));
      });
      if (!lists[listKey].length) {
        const li = document.createElement('li');
        li.className = 'list-editor-empty';
        li.textContent = 'No items yet.';
        ul.appendChild(li);
      }
    });
  }

  function buildListEditorRow(listKey, name) {
    const li = document.createElement('li');
    li.className = 'list-editor-row';
    const span = document.createElement('span');
    span.className = 'list-item-name';
    span.textContent = name;
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.dataset.action = 'rename-list-item';
    editBtn.dataset.list = listKey;
    editBtn.dataset.name = name;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-small btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.dataset.action = 'delete-list-item';
    delBtn.dataset.list = listKey;
    delBtn.dataset.name = name;
    li.appendChild(span);
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    return li;
  }

  function handleAddListItem(listKey) {
    const labels = {
      projects: 'New project name:',
      projectIds: 'New project ID:',
      disciplines: 'New discipline name:',
      deliverables: 'New deliverable name:',
      actions: 'New action name:',
      pms: 'New PM name:',
    };
    const name = promptNewListItem(labels[listKey]);
    if (!name) return;
    if (lists[listKey].includes(name)) {
      showStatus('"' + name + '" already exists.', true);
      return;
    }
    addToList(listKey, name);
    if (listKey === 'projects') projectSettings.name = name;
    if (listKey === 'projectIds') projectSettings.id = name;
    if (listKey === 'pms') projectSettings.pm = name;
    renderListEditors();
    refreshListDropdowns();
    syncProjectSetupUI();
    saveToStorage();
    showStatus('Added "' + name + '".');
  }

  function handleRenameListItem(listKey, oldName) {
    const newName = promptNewListItem('Rename "' + oldName + '" to:');
    if (!newName || newName === oldName) return;
    if (!renameListValue(listKey, oldName, newName)) return;
    renderListEditors();
    refreshListDropdowns();
    syncProjectSetupUI();
    saveToStorage();
    showStatus('Renamed to "' + newName + '".');
  }

  function handleDeleteListItem(listKey, name) {
    if (!window.confirm('Delete "' + name + '" from the list? Existing activity rows keep their current value.')) return;
    if (!deleteListValue(listKey, name)) return;
    renderListEditors();
    refreshListDropdowns();
    syncProjectSetupUI();
    saveToStorage();
    showStatus('Deleted "' + name + '".');
  }

  function handleAddDisciplineFromSelect(selectEl, activity) {
    const name = promptNewListItem('New discipline name:');
    if (!name) { selectEl.value = activity.discipline || ''; return; }
    addToList('disciplines', name);
    activity.discipline = name;
    refreshListDropdowns();
    saveToStorage();
    applyFilters();
    updateSummary();
    showStatus('Discipline "' + name + '" added.');
  }

  function handleAddDeliverableFromSelect(selectEl, activity) {
    const name = promptNewListItem('New deliverable name:');
    if (!name) { selectEl.value = activity.deliverable || ''; return; }
    addToList('deliverables', name);
    activity.deliverable = name;
    refreshListDropdowns();
    saveToStorage();
    applyFilters();
    updateSummary();
    showStatus('Deliverable "' + name + '" added.');
  }

  function handleAddPmToRowFromSelect(selectEl, activity) {
    const name = promptNewListItem('New discipline lead name:');
    if (!name) { selectEl.value = activity.owner || ''; return; }
    addToList('pms', name);
    activity.owner = name;
    refreshListDropdowns();
    saveToStorage();
    updateSummary();
    showStatus('Discipline lead "' + name + '" added.');
  }

  function handleAddProjectFromSelect() {
    handleNewProject();
    if (projectSelect && projectSettings.name) projectSelect.value = projectSettings.name;
  }

  function handleAddProjectIdFromSelect() {
    const name = promptNewListItem('New project ID:');
    if (!name) { projectIdSelect.value = projectSettings.id || ''; return; }
    addToList('projectIds', name);
    projectSettings.id = name;
    syncProjectSetupUI();
    saveToStorage();
    showStatus('Project ID "' + name + '" added.');
  }

  function handleAddPmFromSelect() {
    const name = promptNewListItem('New PM name:');
    if (!name) { pmSelect.value = projectSettings.pm || ''; return; }
    addToList('pms', name);
    projectSettings.pm = name;
    syncProjectSetupUI();
    saveToStorage();
    showStatus('PM "' + name + '" added.');
  }

  function handleAddActionFromSelect(selectEl, activity) {
    const name = promptNewListItem('New action name:');
    if (!name) { selectEl.value = activity.activityType || ''; return; }
    addToList('actions', name);
    activity.activityType = name;
    refreshListDropdowns();
    saveToStorage();
    applyFilters();
    updateSummary();
    const tr = selectEl.closest('tr');
    if (tr) updateRowComputed(tr, activity);
    showStatus('Action "' + name + '" added.');
  }

  // ---------------------------------------------------------------------------
  // Column widths
  // ---------------------------------------------------------------------------

  function getColumnWidth(key) {
    return columnWidths[key] || DEFAULT_COLUMN_WIDTHS[key] || 80;
  }

  function applyColumnWidths() {
    if (!colgroup) return;
    colgroup.innerHTML = '';
    COLUMN_ORDER.forEach(function (key) {
      const th = table.querySelector('thead th[data-col="' + key + '"]');
      if (!th) return;
      const w = getColumnWidth(key);
      const col = document.createElement('col');
      col.style.width = w + 'px';
      col.dataset.col = key;
      colgroup.appendChild(col);
      th.style.width = w + 'px';
    });
    applyStickyColumnOffsets();
  }

  function applyStickyColumnOffsets() {
    let left = 0;
    COLUMN_ORDER.forEach(function (key) {
      const w = getColumnWidth(key);
      if (STICKY_COLUMNS.indexOf(key) >= 0) {
        table.querySelectorAll('thead th[data-col="' + key + '"], tbody td[data-col="' + key + '"]').forEach(function (el) {
          el.classList.add('col-sticky-h');
          el.style.left = left + 'px';
        });
      }
      left += w;
    });
  }

  function initColumnResizers() {
    table.querySelectorAll('thead th[data-col]').forEach(function (th) {
      const key = th.dataset.col;
      if (key === 'select') return;
      let handle = th.querySelector('.col-resizer');
      if (!handle) {
        handle = document.createElement('span');
        handle.className = 'col-resizer';
        handle.setAttribute('aria-hidden', 'true');
        th.appendChild(handle);
      }
      handle.onmousedown = function (event) {
        event.preventDefault();
        resizeState = {
          key: key,
          startX: event.clientX,
          startWidth: getColumnWidth(key),
        };
        document.body.classList.add('col-resizing');
      };
    });
  }

  function onColumnResizeMove(event) {
    if (!resizeState) return;
    const delta = event.clientX - resizeState.startX;
    const next = Math.max(40, resizeState.startWidth + delta);
    columnWidths[resizeState.key] = next;
    applyColumnWidths();
  }

  function onColumnResizeEnd() {
    if (!resizeState) return;
    resizeState = null;
    document.body.classList.remove('col-resizing');
    saveToStorage();
  }

  // ---------------------------------------------------------------------------
  // Render table
  // ---------------------------------------------------------------------------

  function renderTable() {
    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    activities.forEach(function (activity) {
      fragment.appendChild(buildRow(activity));
    });
    tbody.appendChild(fragment);
    applyColumnWidths();
    initColumnResizers();
    applyFilters();
    updateSummary();
    refreshListDropdowns();
    selectAllCheckbox.checked = false;
  }

  function buildRow(activity) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(activity._id);
    if (!activity.include) tr.classList.add('excluded');

    tr.appendChild(buildCheckboxCell('selected', activity.selected, 'Select row for deletion'));
    tr.appendChild(buildCheckboxCell('include', activity.include, 'Include in export'));
    tr.appendChild(buildTextCell('activityId', activity.activityId));
    tr.appendChild(buildListSelectCell('discipline', activity.discipline));
    tr.appendChild(buildListSelectCell('deliverable', activity.deliverable));
    tr.appendChild(buildActionCell(activity.activityType));
    tr.appendChild(buildTextCell('activityName', activity.activityName));
    tr.appendChild(buildComputedCell('finalName', finalName(activity)));
    tr.appendChild(buildReadonlyCell(formatHours(activity.originalDuration)));
    tr.appendChild(buildNumberCell('customDuration', activity.customDuration));
    tr.appendChild(buildReadonlyCell(formatHours(activity.budgetedHours)));
    tr.appendChild(buildNumberCell('customHours', activity.customHours));
    tr.appendChild(buildOwnerCell(activity.owner));
    tr.appendChild(buildStatusCell(activity.status));
    tr.appendChild(buildNotesCell(activity.leadNotes));
    return tr;
  }

  function buildCheckboxCell(field, checked, label) {
    const td = document.createElement('td');
    td.dataset.col = field === 'include' ? 'include' : 'select';
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
    if (field === 'activityId') td.dataset.col = 'activityId';
    if (field === 'activityName') td.dataset.col = 'baseName';
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.field = field;
    input.value = value ?? '';
    td.appendChild(input);
    return td;
  }

  function buildActionCell(value) {
    const td = document.createElement('td');
    td.className = 'col-action';
    const select = document.createElement('select');
    select.dataset.field = 'activityType';
    fillListSelect(select, getActionOptions(value), {
      blankLabel: '', currentValue: value || '',
      addValue: ADD_ACTION, addLabel: '+ Add Action...',
    });
    td.appendChild(select);
    return td;
  }

  function buildListSelectCell(field, value) {
    const td = document.createElement('td');
    td.dataset.col = field;
    if (field === 'discipline') td.className = 'col-discipline';
    if (field === 'deliverable') td.className = 'col-deliverable';
    const select = document.createElement('select');
    select.dataset.field = field;
    if (field === 'discipline') {
      fillListSelect(select, getDisciplineOptions(value), {
        blankLabel: '', currentValue: value || '',
        addValue: ADD_DISCIPLINE, addLabel: '+ Add Discipline...',
      });
    } else {
      fillListSelect(select, getDeliverableOptions(value), {
        blankLabel: '', currentValue: value || '',
        addValue: ADD_DELIVERABLE, addLabel: '+ Add Deliverable...',
      });
    }
    td.appendChild(select);
    return td;
  }

  function buildOwnerCell(value) {
    const td = document.createElement('td');
    td.dataset.col = 'owner';
    td.className = 'col-discipline-lead';
    const select = document.createElement('select');
    select.dataset.field = 'owner';
    fillListSelect(select, getPmOptions(value), {
      blankLabel: '—', currentValue: value || '',
      addValue: ADD_PM, addLabel: '+ Add Discipline Lead...',
    });
    td.appendChild(select);
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
    td.className = 'computed' + (name === 'finalName' ? ' col-final-name' : '');
    td.dataset.computed = name;
    if (name === 'finalName') {
      td.setAttribute('aria-readonly', 'true');
      td.title = value;
    }
    td.textContent = String(value);
    return td;
  }

  function buildStatusCell(value) {
    const td = document.createElement('td');
    td.dataset.col = 'status';
    const select = document.createElement('select');
    select.dataset.field = 'status';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '—';
    if (!value) blank.selected = true;
    select.appendChild(blank);
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

  function updateRowComputed(tr, activity) {
    const finalNameEl = tr.querySelector('[data-computed="finalName"]');
    if (finalNameEl) {
      const name = finalName(activity);
      finalNameEl.textContent = name;
      finalNameEl.title = name;
    }
    tr.classList.toggle('excluded', !activity.include);
  }

  // ---------------------------------------------------------------------------
  // Edit handlers
  // ---------------------------------------------------------------------------

  function getActivityByRow(tr) {
    if (!tr) return null;
    const id = Number(tr.dataset.id);
    return activities.find(function (a) { return a._id === id; }) || null;
  }

  function syncControlToActivity(control, activity) {
    const field = control.dataset.field;
    if (!field || !activity) return;
    if (control.type === 'checkbox') activity[field] = control.checked;
    else if (control.type === 'number') activity[field] = control.value === '' ? '' : Number(control.value);
    else if (field === 'activityId') activity[field] = stripActivityIdPrefix(control.value);
    else activity[field] = control.value;
  }

  function handleTableChange(event) {
    const control = event.target;
    if (!control.dataset.field) return;
    const tr = control.closest('tr');
    const activity = getActivityByRow(tr);
    if (!activity) return;

    if (control.dataset.field === 'discipline' && control.value === ADD_DISCIPLINE) {
      handleAddDisciplineFromSelect(control, activity);
      return;
    }
    if (control.dataset.field === 'deliverable' && control.value === ADD_DELIVERABLE) {
      handleAddDeliverableFromSelect(control, activity);
      return;
    }
    if (control.dataset.field === 'activityType' && control.value === ADD_ACTION) {
      handleAddActionFromSelect(control, activity);
      return;
    }
    if (control.dataset.field === 'owner' && control.value === ADD_PM) {
      handleAddPmToRowFromSelect(control, activity);
      return;
    }

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
  // Filters & summary
  // ---------------------------------------------------------------------------

  function getFilterValues() {
    return {
      discipline: filterDiscipline.value,
      deliverable: filterDeliverable.value,
      action: filterAction.value,
      include: filterInclude.value,
      status: filterStatus.value,
    };
  }

  function rowMatchesFilters(activity) {
    if (!activity) return false;
    const f = getFilterValues();
    if (f.discipline && activity.discipline !== f.discipline) return false;
    if (f.deliverable && activity.deliverable !== f.deliverable) return false;
    if (f.action && activity.activityType !== f.action) return false;
    if (f.include === 'yes' && !activity.include) return false;
    if (f.include === 'no' && activity.include) return false;
    if (f.status && activity.status !== f.status) return false;
    return true;
  }

  function getFilteredActivities() {
    return activities.filter(rowMatchesFilters);
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
    updateSummary();
  }

  function uniqueValues(field, fallback) {
    const set = new Set(fallback || []);
    activities.forEach(function (a) { if (a[field]) set.add(a[field]); });
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

  function populateFilterOptions() {
    populateSelect(filterDiscipline, sortUnique(lists.disciplines.concat(uniqueValues('discipline'))), 'All');
    populateSelect(filterDeliverable, sortUnique(lists.deliverables.concat(uniqueValues('deliverable'))), 'All');
    populateSelect(filterAction, sortUnique(lists.actions.concat(uniqueValues('activityType'))), 'All');
    populateSelect(filterStatus, uniqueValues('status', STATUS_OPTIONS), 'All');
  }

  function updateSummary() {
    const visible = getFilteredActivities();
    const included = visible.filter(function (a) { return a.include; });
    const includedHours = included.reduce(function (sum, a) { return sum + finalHours(a); }, 0);
    const disciplines = new Set(included.map(function (a) { return a.discipline; }).filter(Boolean));
    const reviewHold = visible.filter(function (a) {
      return a.include && (a.status === 'Lead Review' || a.status === 'Hold');
    }).length;

    document.getElementById('kpi-activities').textContent = included.length.toLocaleString();
    document.getElementById('kpi-hours').textContent = formatHours(includedHours);
    document.getElementById('kpi-disciplines').textContent = String(disciplines.size);
    document.getElementById('kpi-review').textContent = String(reviewHold);
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
    activities.unshift(createActivity({
      include: true,
      activityId: nextActivityId(),
      discipline: filterDiscipline.value || '',
      deliverable: filterDeliverable.value || '',
      activityType: filterAction.value || 'Develop',
      activityName: '',
      status: 'Not Started',
    }));
    renderTable();
    saveToStorage();
    showStatus('New activity added.');
  }

  function checkDeletePassword(value) {
    return value === ['j', 'm', 'b'].join('');
  }

  function openDeletePasswordModal(count) {
    pendingDeleteIds = activities.filter(function (a) { return a.selected; }).map(function (a) { return a._id; });
    deletePasswordMessage.textContent = 'Enter password to delete ' + count + ' selected activit' + (count === 1 ? 'y' : 'ies') + '.';
    deletePasswordInput.value = '';
    deletePasswordModal.hidden = false;
    deletePasswordModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(function () { deletePasswordInput.focus(); }, 0);
  }

  function closeDeletePasswordModal() {
    deletePasswordModal.hidden = true;
    deletePasswordModal.setAttribute('aria-hidden', 'true');
    deletePasswordInput.value = '';
    pendingDeleteIds = null;
  }

  function confirmDeleteWithPassword() {
    if (!pendingDeleteIds || !pendingDeleteIds.length) {
      closeDeletePasswordModal();
      return;
    }
    if (!checkDeletePassword(deletePasswordInput.value)) {
      showStatus('Incorrect password. Delete cancelled.', true);
      deletePasswordInput.value = '';
      deletePasswordInput.focus();
      return;
    }
    const ids = new Set(pendingDeleteIds);
    const count = pendingDeleteIds.length;
    closeDeletePasswordModal();
    activities = activities.filter(function (a) { return !ids.has(a._id); });
    renderTable();
    saveToStorage();
    showStatus(count + ' activit' + (count === 1 ? 'y' : 'ies') + ' deleted.');
  }

  function deleteSelected() {
    const toDelete = activities.filter(function (a) { return a.selected; });
    if (!toDelete.length) { showStatus('Select one or more rows to delete.', true); return; }
    openDeletePasswordModal(toDelete.length);
  }

  function exportIncludedCsv() {
    const toExport = activities.filter(function (a) {
      return a.include && rowMatchesFilters(a);
    });
    if (!toExport.length) {
      showStatus('No included, visible activities to export for current filters.', true);
      return;
    }

    const headers = [
      'Project Name', 'Project ID', 'Client', 'FEL Stage', 'PM',
      'Activity ID', 'Activity Name', 'Discipline', 'Deliverable', 'Action',
      'Original Duration', 'Budgeted Hours', 'Discipline Lead', 'Lead Status', 'Lead Notes',
    ];
    const lines = [headers.join(',')];
    toExport.forEach(function (a) {
      lines.push([
        projectSettings.name, projectSettings.id, projectSettings.client,
        projectSettings.felStage, projectSettings.pm,
        exportActivityId(a.activityId), finalName(a), a.discipline, a.deliverable, a.activityType,
        finalDuration(a), finalHours(a), a.owner, a.status, a.leadNotes,
      ].map(csvEscape).join(','));
    });

    downloadFile('FEL3_Analyzer_Included_Activities.csv', lines.join('\n'));
    showStatus('Exported ' + toExport.length + ' included activities (filtered view).');
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
    if (activities.length && !window.confirm(
      'Reset activities to data/activities.csv? Activity edits will be lost. Project setup and custom lists are kept.'
    )) return;
    try {
      nextInternalId = 1;
      activities = await loadFromCsv();
      mergeListsFromActivities(activities);
      renderTable();
      saveToStorage();
      showStatus('Schedule reset to template.');
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  function handleProjectSelectChange() {
    if (projectSelect.value === ADD_PROJECT) {
      handleAddProjectFromSelect();
      return;
    }
    switchToProject(projectSelect.value);
  }

  function handleProjectSetupChange() {
    projectSettings.client = projectClientInput.value.trim();
    projectSettings.felStage = projectFelStageSelect.value;
    saveToStorage();
  }

  function handleProjectIdChange() {
    if (projectIdSelect.value === ADD_PROJECT_ID) {
      handleAddProjectIdFromSelect();
      return;
    }
    projectSettings.id = projectIdSelect.value.trim();
    saveToStorage();
  }

  function handlePmChange() {
    if (pmSelect.value === ADD_PM) {
      handleAddPmFromSelect();
      return;
    }
    projectSettings.pm = pmSelect.value || 'Unassigned';
    saveToStorage();
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
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    columnWidths = Object.assign({}, DEFAULT_COLUMN_WIDTHS);
    document.addEventListener('mousemove', onColumnResizeMove);
    document.addEventListener('mouseup', onColumnResizeEnd);

    table.addEventListener('change', handleTableChange);
    table.addEventListener('blur', handleTableBlur, true);
    table.addEventListener('input', handleTableInput);

    document.getElementById('btn-add').addEventListener('click', addActivity);
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-delete-confirm').addEventListener('click', confirmDeleteWithPassword);
    deletePasswordInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmDeleteWithPassword();
      }
    });
    deletePasswordModal.addEventListener('click', function (event) {
      if (event.target.dataset.action === 'cancel-delete') closeDeletePasswordModal();
    });
    document.getElementById('btn-save').addEventListener('click', function () {
      saveToStorage();
      showStatus('Schedule saved to browser storage.');
    });
    document.getElementById('btn-reset').addEventListener('click', resetToTemplate);
    document.getElementById('btn-export').addEventListener('click', exportIncludedCsv);
    document.getElementById('btn-project-new').addEventListener('click', handleNewProject);
    document.getElementById('btn-project-clone').addEventListener('click', handleCloneProject);
    document.getElementById('btn-project-delete').addEventListener('click', handleDeleteProject);
    document.getElementById('btn-manage-lists').addEventListener('click', openManageListsModal);
    selectAllCheckbox.addEventListener('change', handleSelectAll);

    projectSelect.addEventListener('change', handleProjectSelectChange);
    projectIdSelect.addEventListener('change', handleProjectIdChange);
    projectClientInput.addEventListener('change', handleProjectSetupChange);
    projectClientInput.addEventListener('blur', handleProjectSetupChange);
    projectFelStageSelect.addEventListener('change', handleProjectSetupChange);
    pmSelect.addEventListener('change', handlePmChange);

    manageModal.addEventListener('click', function (event) {
      const action = event.target.dataset.action;
      if (action === 'close-modal') closeManageListsModal();
      if (action === 'project-new') handleNewProject();
      if (action === 'project-clone') handleCloneProject();
      if (action === 'project-delete') handleDeleteProject();
      if (action === 'add-list-item') handleAddListItem(event.target.dataset.list);
      if (action === 'rename-list-item') handleRenameListItem(event.target.dataset.list, event.target.dataset.name);
      if (action === 'delete-list-item') handleDeleteListItem(event.target.dataset.list, event.target.dataset.name);
    });

    manageModal.querySelectorAll('.modal-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchManageTab(btn.dataset.tab); });
    });

    [filterDiscipline, filterDeliverable, filterAction, filterInclude, filterStatus].forEach(function (el) {
      el.addEventListener('change', applyFilters);
    });

    const stored = loadFromStorage();
    if (stored && stored.length) {
      activities = stored;
      activities.forEach(function (a) { if (a._id >= nextInternalId) nextInternalId = a._id + 1; });
      mergeListsFromActivities(activities);
      syncProjectSetupUI();
      renderTable();
      showStatus('Loaded saved schedule from browser storage.');
    } else {
      ensureDefaultLists();
      try {
        activities = await loadFromCsv();
        mergeListsFromActivities(activities);
        currentProjectName = projectSettings.name || lists.projects[0];
        projectSettings.name = currentProjectName;
        projectsData[currentProjectName] = {
          activities: activities,
          settings: Object.assign({}, projectSettings),
        };
        syncProjectSetupUI();
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
