// CI verification — remove after confirming checks
// Database
export { getDb, initSchema, checkFtsHealth, rebuildFts, closeDb } from './db.js'
export type { Database } from './db.js'

// Types and constants
export { VALID_LOG_TYPES, DEFAULT_STATUS } from './types.js'
export type {
  LogType,
  RecordRow,
  LinkedRecord,
  CreateParams,
  UpdateParams,
  SearchParams,
  ListParams,
  LinkParams,
  GetContextParams,
  ProjectSummaryParams,
} from './types.js'

// Records (CRUD)
export { getRecord, createRecord, updateRecord, deleteRecord } from './records.js'

// Search
export { searchRecords, listRecords } from './search.js'

// Links
export { linkRecords, unlinkRecords } from './links.js'

// Context
export { getContext } from './context.js'

// Summaries
export { dailySummary, projectSummary } from './summary.js'
export type { DailySummaryResult, ProjectSummaryResult } from './summary.js'
