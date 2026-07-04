/**
 * V3 Database Schema — logical tables as plain JS arrays (SQLite-ready shape).
 * Not wired into js/app.js. Exposed on window.AnalyzerSchedule.Database.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var DB = NS.Database = NS.Database || {};

  var SCHEMA_VERSION = 1;
  var STORE_FORMAT = 'analyzer-schedule-v3-db';

  var TABLE_NAMES = [
    'projects',
    'estimateTemplates',
    'disciplines',
    'activityLibrary',
    'estimateDeliverables',
    'activityMappings',
    'importedEstimateRows',
    'scheduleActivities',
    'resources',
    'resourceAssignments',
  ];

  function nextId(store, prefix) {
    store._meta.nextId += 1;
    return (prefix || 'id') + '_' + store._meta.nextId;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  /**
   * Empty in-memory database store.
   * @returns {V3DatabaseStore}
   */
  function createEmptyStore() {
    var store = {
      format: STORE_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      _meta: { nextId: 0, createdAt: nowIso(), updatedAt: nowIso() },
      projects: [],
      estimateTemplates: [],
      disciplines: [],
      activityLibrary: [],
      estimateDeliverables: [],
      activityMappings: [],
      importedEstimateRows: [],
      scheduleActivities: [],
      resources: [],
      resourceAssignments: [],
    };
    return store;
  }

  /** @param {object} input */
  function createProjectRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      name: String(input.name || input.projectName || '').trim(),
      client: String(input.client || '').trim(),
      felStage: String(input.felStage || 'FEL-3').trim(),
      pm: String(input.pm || 'Unassigned').trim(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: input.updatedAt || nowIso(),
      notes: String(input.notes || '').trim(),
    };
  }

  function createEstimateTemplateRecord(input) {
    input = input || {};
    return {
      id: '',
      templateKey: String(input.templateKey || input.id || '').trim(),
      label: String(input.label || '').trim(),
      description: String(input.description || '').trim(),
      parserModule: String(input.parserModule || '').trim(),
      active: input.active !== false,
    };
  }

  function createDisciplineRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      name: String(input.name || '').trim(),
      lead: String(input.lead || '').trim(),
    };
  }

  function createActivityLibraryRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      discipline: String(input.discipline || '').trim(),
      action: String(input.action || input.activityType || 'Develop').trim(),
      deliverable: String(input.deliverable || '').trim(),
      activityName: String(input.activityName || '').trim(),
      defaultDuration: Number(input.defaultDuration) || 0,
      defaultHours: Number(input.defaultHours) || 0,
      templateActivityId: String(input.templateActivityId || '').trim(),
    };
  }

  function createEstimateDeliverableRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      importRowId: String(input.importRowId || '').trim(),
      discipline: String(input.discipline || '').trim(),
      deliverable: String(input.deliverable || '').trim(),
      activityName: String(input.activityName || '').trim(),
      qty: Number(input.qty) || 0,
      totalHours: Number(input.totalHours) || 0,
      mappingStatus: String(input.mappingStatus || 'unmapped').trim(),
    };
  }

  function createActivityMappingRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      estimateDeliverableId: String(input.estimateDeliverableId || '').trim(),
      activityLibraryId: String(input.activityLibraryId || '').trim(),
      mappedAt: input.mappedAt || nowIso(),
      mappedBy: String(input.mappedBy || '').trim(),
      notes: String(input.notes || '').trim(),
    };
  }

  function createImportedEstimateRowRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      sourceFile: String(input.sourceFile || '').trim(),
      templateName: String(input.templateName || '').trim(),
      discipline: String(input.discipline || '').trim(),
      deliverable: String(input.deliverable || '').trim(),
      activityName: String(input.activityName || '').trim(),
      qty: Number(input.qty) || 0,
      engineerHours: Number(input.engineerHours) || 0,
      designerHours: Number(input.designerHours) || 0,
      checkerHours: Number(input.checkerHours) || 0,
      pmHours: Number(input.pmHours) || 0,
      totalHours: Number(input.totalHours) || 0,
      notes: String(input.notes || '').trim(),
      mappingStatus: String(input.mappingStatus || 'unmapped').trim(),
      importedAt: input.importedAt || nowIso(),
    };
  }

  function createScheduleActivityRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      importRowId: String(input.importRowId || '').trim(),
      activityLibraryId: String(input.activityLibraryId || '').trim(),
      activityId: String(input.activityId || '').trim(),
      discipline: String(input.discipline || '').trim(),
      action: String(input.action || '').trim(),
      deliverable: String(input.deliverable || '').trim(),
      activityName: String(input.activityName || '').trim(),
      originalDuration: Number(input.originalDuration) || 0,
      budgetedHours: Number(input.budgetedHours) || 0,
      owner: String(input.owner || '').trim(),
      status: String(input.status || 'Not Started').trim(),
      leadNotes: String(input.leadNotes || '').trim(),
      include: input.include !== false,
      generatedAt: input.generatedAt || nowIso(),
    };
  }

  function createResourceRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      name: String(input.name || '').trim(),
      role: String(input.role || '').trim(),
      discipline: String(input.discipline || '').trim(),
      defaultHoursPerWeek: Number(input.defaultHoursPerWeek) || 40,
    };
  }

  function createResourceAssignmentRecord(input) {
    input = input || {};
    return {
      id: '',
      projectId: String(input.projectId || '').trim(),
      scheduleActivityId: String(input.scheduleActivityId || '').trim(),
      resourceId: String(input.resourceId || '').trim(),
      assignedHours: Number(input.assignedHours) || 0,
      role: String(input.role || '').trim(),
      notes: String(input.notes || '').trim(),
    };
  }

  function touchStore(store) {
    store._meta.updatedAt = nowIso();
  }

  function findById(table, id) {
    for (var i = 0; i < table.length; i++) {
      if (table[i].id === id) return table[i];
    }
    return null;
  }

  function filterByProjectId(table, projectId) {
    return table.filter(function (row) { return row.projectId === projectId; });
  }

  DB.Schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORE_FORMAT: STORE_FORMAT,
    TABLE_NAMES: TABLE_NAMES.slice(),
    createEmptyStore: createEmptyStore,
    createProjectRecord: createProjectRecord,
    createEstimateTemplateRecord: createEstimateTemplateRecord,
    createDisciplineRecord: createDisciplineRecord,
    createActivityLibraryRecord: createActivityLibraryRecord,
    createEstimateDeliverableRecord: createEstimateDeliverableRecord,
    createActivityMappingRecord: createActivityMappingRecord,
    createImportedEstimateRowRecord: createImportedEstimateRowRecord,
    createScheduleActivityRecord: createScheduleActivityRecord,
    createResourceRecord: createResourceRecord,
    createResourceAssignmentRecord: createResourceAssignmentRecord,
    nextId: nextId,
    touchStore: touchStore,
    findById: findById,
    filterByProjectId: filterByProjectId,
  };
})(typeof window !== 'undefined' ? window : global);
