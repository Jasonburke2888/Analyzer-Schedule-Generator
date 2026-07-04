/**
 * V3 Project Database — in-memory CRUD and import→schedule pipeline helpers.
 * Requires app/database/schema.js. Optional: StandardImportSchema for row normalization.
 */
(function (global) {
  'use strict';

  var NS = global.AnalyzerSchedule = global.AnalyzerSchedule || {};
  var DB = NS.Database = NS.Database || {};
  var Schema = DB.Schema;
  var ImportSchema = NS.StandardImportSchema;

  if (!Schema) {
    throw new Error('schema.js must load before project-db.js');
  }

  var NAME_SEP = ' - ';
  var UNMAPPED = 'unmapped';
  var MAPPED = 'mapped';

  /** @type {V3DatabaseStore|null} */
  var activeStore = null;

  function getStore() {
    if (!activeStore) activeStore = Schema.createEmptyStore();
    return activeStore;
  }

  function setStore(store) {
    if (!store || store.format !== Schema.STORE_FORMAT) {
      throw new Error('Invalid V3 database store.');
    }
    activeStore = store;
  }

  function splitActivityName(activityName) {
    var name = (activityName || '').trim();
    var idx = name.indexOf(NAME_SEP);
    if (idx < 0) return { action: 'Develop', deliverable: name };
    return {
      action: name.slice(0, idx).trim() || 'Develop',
      deliverable: name.slice(idx + NAME_SEP.length).trim(),
    };
  }

  function normalizeImportRow(row, projectId) {
    if (ImportSchema && ImportSchema.createStandardImportRow) {
      var std = ImportSchema.createStandardImportRow(Object.assign({}, row, {
        projectId: row.projectId || projectId,
      }));
      return Schema.createImportedEstimateRowRecord(std);
    }
    return Schema.createImportedEstimateRowRecord(Object.assign({}, row, {
      projectId: row.projectId || projectId,
    }));
  }

  /**
   * @param {object} [input]
   * @param {V3DatabaseStore} [store]
   * @returns {{ store: V3DatabaseStore, project: object }}
   */
  function createProject(input, store) {
    input = input || {};
    store = store || getStore();
    var project = Schema.createProjectRecord(input);
    project.id = Schema.nextId(store, 'proj');
    if (!project.name && project.projectId) project.name = 'Project ' + project.projectId;
    store.projects.push(project);
    Schema.touchStore(store);
    return { store: store, project: project };
  }

  function getProject(store, projectDbId) {
    return Schema.findById(store.projects, projectDbId);
  }

  function getProjectByProjectId(store, projectId) {
    for (var i = 0; i < store.projects.length; i++) {
      if (store.projects[i].projectId === projectId) return store.projects[i];
    }
    return null;
  }

  /**
   * @param {V3DatabaseStore} store
   * @param {string} projectDbId — internal proj_* id
   * @param {object[]} rows — standard import rows or compatible objects
   * @returns {{ added: number, importRowIds: string[] }}
   */
  function addImportedEstimateRows(store, projectDbId, rows) {
    var project = getProject(store, projectDbId);
    if (!project) throw new Error('Project not found: ' + projectDbId);

    var importRowIds = [];
    (rows || []).forEach(function (row) {
      var record = normalizeImportRow(row, project.projectId);
      record.id = Schema.nextId(store, 'imp');
      record.projectId = project.projectId;
      record.mappingStatus = record.mappingStatus || UNMAPPED;
      store.importedEstimateRows.push(record);

      var deliverable = Schema.createEstimateDeliverableRecord({
        projectId: project.projectId,
        importRowId: record.id,
        discipline: record.discipline,
        deliverable: record.deliverable,
        activityName: record.activityName,
        qty: record.qty,
        totalHours: record.totalHours,
        mappingStatus: record.mappingStatus,
      });
      deliverable.id = Schema.nextId(store, 'est');
      store.estimateDeliverables.push(deliverable);

      importRowIds.push(record.id);
    });

    project.updatedAt = new Date().toISOString();
    Schema.touchStore(store);
    return { added: importRowIds.length, importRowIds: importRowIds };
  }

  /**
   * @param {V3DatabaseStore} store
   * @param {string} projectDbId
   * @returns {object[]}
   */
  function getUnmappedRows(store, projectDbId) {
    var project = getProject(store, projectDbId);
    if (!project) throw new Error('Project not found: ' + projectDbId);
    return store.importedEstimateRows.filter(function (row) {
      return row.projectId === project.projectId
        && (row.mappingStatus === UNMAPPED || row.mappingStatus === 'partial');
    });
  }

  /**
   * Link an estimate deliverable to an activity library entry.
   * @param {V3DatabaseStore} store
   * @param {object} input
   * @param {string} input.projectDbId
   * @param {string} input.estimateDeliverableId
   * @param {string} input.activityLibraryId
   * @param {string} [input.mappedBy]
   * @param {string} [input.notes]
   * @returns {{ mapping: object, estimateDeliverable: object, importRow: object|null }}
   */
  function mapEstimateDeliverableToActivity(store, input) {
    input = input || {};
    var project = getProject(store, input.projectDbId);
    if (!project) throw new Error('Project not found: ' + input.projectDbId);

    var estDel = Schema.findById(store.estimateDeliverables, input.estimateDeliverableId);
    if (!estDel || estDel.projectId !== project.projectId) {
      throw new Error('EstimateDeliverable not found for project.');
    }

    var lib = Schema.findById(store.activityLibrary, input.activityLibraryId);
    if (!lib || lib.projectId !== project.projectId) {
      throw new Error('ActivityLibrary entry not found for project.');
    }

    var mapping = Schema.createActivityMappingRecord({
      projectId: project.projectId,
      estimateDeliverableId: estDel.id,
      activityLibraryId: lib.id,
      mappedBy: input.mappedBy || '',
      notes: input.notes || '',
    });
    mapping.id = Schema.nextId(store, 'map');
    store.activityMappings.push(mapping);

    estDel.mappingStatus = MAPPED;
    var importRow = null;
    if (estDel.importRowId) {
      importRow = Schema.findById(store.importedEstimateRows, estDel.importRowId);
      if (importRow) importRow.mappingStatus = MAPPED;
    }

    Schema.touchStore(store);
    return { mapping: mapping, estimateDeliverable: estDel, importRow: importRow };
  }

  /**
   * @param {V3DatabaseStore} store
   * @param {string} projectDbId
   * @param {object} [options]
   * @param {boolean} [options.mappedOnly=true]
   * @returns {{ generated: number, activities: object[] }}
   */
  function generateScheduleActivitiesFromImportedRows(store, projectDbId, options) {
    options = options || {};
    var mappedOnly = options.mappedOnly !== false;
    var project = getProject(store, projectDbId);
    if (!project) throw new Error('Project not found: ' + projectDbId);

    var generated = [];
    var seq = store.scheduleActivities.length;

    store.importedEstimateRows.forEach(function (row) {
      if (row.projectId !== project.projectId) return;
      if (mappedOnly && row.mappingStatus !== MAPPED) return;

      var parts = splitActivityName(row.activityName);
      var action = parts.action;
      var deliverable = row.deliverable || parts.deliverable;

      var mapping = null;
      var libId = '';
      store.activityMappings.forEach(function (m) {
        if (m.projectId !== project.projectId) return;
        var est = Schema.findById(store.estimateDeliverables, m.estimateDeliverableId);
        if (est && est.importRowId === row.id) {
          mapping = m;
          libId = m.activityLibraryId;
        }
      });

      if (libId) {
        var lib = Schema.findById(store.activityLibrary, libId);
        if (lib) {
          action = lib.action || action;
          deliverable = lib.deliverable || deliverable;
        }
      }

      var activityName = action && deliverable ? action + NAME_SEP + deliverable : row.activityName;
      seq += 10;
      var activity = Schema.createScheduleActivityRecord({
        projectId: project.projectId,
        importRowId: row.id,
        activityLibraryId: libId,
        activityId: String(seq),
        discipline: row.discipline,
        action: action,
        deliverable: deliverable,
        activityName: activityName,
        budgetedHours: row.totalHours,
        leadNotes: row.notes,
        status: 'Not Started',
        include: true,
      });
      activity.id = Schema.nextId(store, 'act');
      store.scheduleActivities.push(activity);
      generated.push(activity);
    });

    Schema.touchStore(store);
    return { generated: generated.length, activities: generated };
  }

  /**
   * Seed default estimate template registry rows (parser metadata only).
   * @param {V3DatabaseStore} store
   */
  function seedEstimateTemplates(store) {
    var templates = [
      {
        templateKey: 'eichleay-pse-old',
        label: 'Eichleay PSE (Legacy)',
        description: 'Legacy PSE Excel layout',
        parserModule: 'EichleayPseOldParser',
      },
    ];
    templates.forEach(function (t) {
      if (store.estimateTemplates.some(function (x) { return x.templateKey === t.templateKey; })) return;
      var rec = Schema.createEstimateTemplateRecord(t);
      rec.id = Schema.nextId(store, 'tmpl');
      store.estimateTemplates.push(rec);
    });
    Schema.touchStore(store);
  }

  /**
   * @param {V3DatabaseStore} store
   * @param {string} projectDbId
   * @returns {object}
   */
  function summarizeProject(store, projectDbId) {
    var project = getProject(store, projectDbId);
    if (!project) throw new Error('Project not found: ' + projectDbId);
    var pid = project.projectId;
    return {
      project: project,
      counts: {
        importedEstimateRows: filterProject(store.importedEstimateRows, pid).length,
        unmapped: getUnmappedRows(store, projectDbId).length,
        activityMappings: filterProject(store.activityMappings, pid).length,
        scheduleActivities: filterProject(store.scheduleActivities, pid).length,
        resources: filterProject(store.resources, pid).length,
        resourceAssignments: filterProject(store.resourceAssignments, pid).length,
      },
    };
  }

  function filterProject(table, projectId) {
    return table.filter(function (r) { return r.projectId === projectId; });
  }

  DB.ProjectDb = {
    getStore: getStore,
    setStore: setStore,
    createProject: createProject,
    getProject: getProject,
    getProjectByProjectId: getProjectByProjectId,
    addImportedEstimateRows: addImportedEstimateRows,
    getUnmappedRows: getUnmappedRows,
    mapEstimateDeliverableToActivity: mapEstimateDeliverableToActivity,
    generateScheduleActivitiesFromImportedRows: generateScheduleActivitiesFromImportedRows,
    seedEstimateTemplates: seedEstimateTemplates,
    summarizeProject: summarizeProject,
  };

  // Top-level aliases on Database namespace
  DB.createProject = createProject;
  DB.addImportedEstimateRows = addImportedEstimateRows;
  DB.getUnmappedRows = getUnmappedRows;
  DB.mapEstimateDeliverableToActivity = mapEstimateDeliverableToActivity;
  DB.generateScheduleActivitiesFromImportedRows = generateScheduleActivitiesFromImportedRows;
  DB.getStore = getStore;
  DB.setStore = setStore;
})(typeof window !== 'undefined' ? window : global);
