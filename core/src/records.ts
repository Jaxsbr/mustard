import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { VALID_LOG_TYPES, DEFAULT_STATUS } from './types.js'
import type { RecordRow, CreateParams, UpdateParams } from './types.js'

const RECORD_COLUMNS = `id, log_type, title, text, capture_date, person, status,
  due_date, category, theme, period, source_origin, source_date,
  tags, confidence, created_by, source_url, delegate, created_at, updated_at`

export function getRecord(db: Database.Database, id: string): RecordRow | null {
  const row = db
    .prepare(`SELECT ${RECORD_COLUMNS} FROM records WHERE id = ?`)
    .get(id) as RecordRow | undefined

  return row ?? null
}

export function createRecord(db: Database.Database, params: CreateParams): RecordRow {
  if (!VALID_LOG_TYPES.includes(params.log_type as (typeof VALID_LOG_TYPES)[number])) {
    throw new Error(`Invalid log_type: "${params.log_type}". Must be one of: ${VALID_LOG_TYPES.join(', ')}`)
  }
  if (!params.text || params.text.trim().length === 0) {
    throw new Error('Text is required and cannot be empty.')
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const captureDate = new Date().toISOString().slice(0, 10)
  const tags = JSON.stringify(params.tags ?? [])
  const status = params.status ?? DEFAULT_STATUS[params.log_type] ?? 'open'

  db.prepare(
    `INSERT INTO records (
      id, log_type, title, text, capture_date,
      person, status, due_date, category, theme, period,
      source_origin, tags, source_url, delegate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mustard-mcp', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.log_type,
    params.title ?? null,
    params.text,
    captureDate,
    params.person ?? null,
    status,
    params.due_date ?? null,
    params.category ?? null,
    params.theme ?? null,
    params.period ?? null,
    tags,
    params.source_url ?? null,
    params.delegate ?? null,
    now,
    now,
  )

  return db
    .prepare(`SELECT ${RECORD_COLUMNS} FROM records WHERE id = ?`)
    .get(id) as RecordRow
}

export function updateRecord(db: Database.Database, params: UpdateParams): RecordRow {
  const existing = db.prepare('SELECT id FROM records WHERE id = ?').get(params.id)
  if (!existing) {
    throw new Error(`Record not found: ${params.id}`)
  }

  const sets: string[] = []
  const bindings: (string | null)[] = []

  if (params.text !== undefined) {
    sets.push('text = ?')
    bindings.push(params.text)
  }
  if (params.title !== undefined) {
    sets.push('title = ?')
    bindings.push(params.title)
  }
  if (params.person !== undefined) {
    sets.push('person = ?')
    bindings.push(params.person)
  }
  if (params.status !== undefined) {
    sets.push('status = ?')
    bindings.push(params.status)
  }
  if (params.due_date !== undefined) {
    sets.push('due_date = ?')
    bindings.push(params.due_date)
  }
  if (params.category !== undefined) {
    sets.push('category = ?')
    bindings.push(params.category)
  }
  if (params.theme !== undefined) {
    sets.push('theme = ?')
    bindings.push(params.theme)
  }
  if (params.period !== undefined) {
    sets.push('period = ?')
    bindings.push(params.period)
  }
  if (params.tags !== undefined) {
    sets.push('tags = ?')
    bindings.push(JSON.stringify(params.tags))
  }
  if (params.source_url !== undefined) {
    sets.push('source_url = ?')
    bindings.push(params.source_url)
  }
  if (params.delegate !== undefined) {
    sets.push('delegate = ?')
    bindings.push(params.delegate)
  }

  if (sets.length === 0) {
    return db
      .prepare(`SELECT ${RECORD_COLUMNS} FROM records WHERE id = ?`)
      .get(params.id) as RecordRow
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  sets.push('updated_at = ?')
  bindings.push(now)
  bindings.push(params.id)

  db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`).run(...bindings)

  return db
    .prepare(`SELECT ${RECORD_COLUMNS} FROM records WHERE id = ?`)
    .get(params.id) as RecordRow
}

export function deleteRecord(db: Database.Database, id: string): { id: string; log_type: string; title: string | null } {
  const existing = db
    .prepare('SELECT id, log_type, title FROM records WHERE id = ?')
    .get(id) as { id: string; log_type: string; title: string | null } | undefined

  if (!existing) {
    throw new Error(`Record not found: ${id}`)
  }

  db.prepare('DELETE FROM records WHERE id = ?').run(id)

  return existing
}
