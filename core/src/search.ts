import type Database from 'better-sqlite3'
import type { RecordRow, SearchParams, ListParams } from './types.js'

export function searchRecords(db: Database.Database, params: SearchParams): RecordRow[] {
  const limit = Math.min(params.limit ?? 10, 50)

  const conditions: string[] = []
  const bindings: (string | number)[] = []

  conditions.push('records_fts MATCH ?')
  bindings.push(params.query)

  if (params.type) {
    conditions.push('r.log_type = ?')
    bindings.push(params.type)
  }
  if (params.person) {
    conditions.push('r.person = ?')
    bindings.push(params.person)
  }
  if (params.status) {
    conditions.push('r.status = ?')
    bindings.push(params.status)
  }

  bindings.push(limit)

  const sql = `
    SELECT r.id, r.log_type, r.title, r.text, r.capture_date,
           r.person, r.status, r.due_date, r.category, r.theme, r.period,
           r.source_origin, r.source_date, r.tags, r.confidence, r.created_by,
           r.source_url, r.delegate, r.created_at, r.updated_at
    FROM records r
    JOIN records_fts fts ON fts.rowid = r.rowid
    WHERE ${conditions.join(' AND ')}
    ORDER BY rank
    LIMIT ?
  `

  return db.prepare(sql).all(...bindings) as RecordRow[]
}

export function listRecords(db: Database.Database, params: ListParams): { records: RecordRow[]; total: number } {
  const limit = Math.min(params.limit ?? 25, 100)
  const sort = params.sort === 'oldest' ? 'ASC' : 'DESC'

  const conditions: string[] = []
  const bindings: (string | number)[] = []

  if (params.type) {
    conditions.push('log_type = ?')
    bindings.push(params.type)
  }
  if (params.person) {
    conditions.push('person = ?')
    bindings.push(params.person)
  }
  if (params.status) {
    conditions.push('status = ?')
    bindings.push(params.status)
  }
  if (params.delegate !== undefined) {
    if (params.delegate === null) {
      conditions.push('delegate IS NULL')
    } else {
      conditions.push('delegate = ?')
      bindings.push(params.delegate)
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countSql = `SELECT COUNT(*) as cnt FROM records ${where}`
  const total = (db.prepare(countSql).get(...bindings) as { cnt: number }).cnt

  bindings.push(limit)

  const sql = `
    SELECT id, log_type, title, text, capture_date,
           person, status, due_date, category, theme, period,
           source_origin, source_date, tags, confidence, created_by,
           source_url, delegate, created_at, updated_at
    FROM records
    ${where}
    ORDER BY capture_date ${sort}
    LIMIT ?
  `

  const records = db.prepare(sql).all(...bindings) as RecordRow[]

  return { records, total }
}
