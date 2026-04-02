import crypto from 'node:crypto'
import type Database from 'better-sqlite3'

const VALID_LOG_TYPES = ['todo', 'people_note', 'idea', 'daily_log', 'project', 'learning'] as const

export interface CreateParams {
  log_type: string
  text: string
  title?: string | null
  person?: string | null
  status?: string | null
  due_date?: string | null
  category?: string | null
  theme?: string | null
  period?: string | null
  tags?: string[]
  source_url?: string | null
  delegate?: string | null
}

export interface UpdateParams {
  id: string
  text?: string
  title?: string | null
  person?: string | null
  status?: string | null
  due_date?: string | null
  category?: string | null
  theme?: string | null
  period?: string | null
  tags?: string[]
  source_url?: string | null
  delegate?: string | null
}

interface RecordRow {
  id: string
  log_type: string
  title: string | null
  text: string
  capture_date: string
  person: string | null
  status: string | null
  due_date: string | null
  category: string | null
  theme: string | null
  period: string | null
  tags: string
  source_origin: string
  source_url: string | null
  delegate: string | null
  created_at: string
  updated_at: string
}

function formatRecordFull(row: RecordRow): string {
  const lines: string[] = []
  const typeLabel = row.log_type.replace('_', ' ')
  lines.push(`**${row.title ?? typeLabel}** (${row.log_type})`)
  lines.push(`ID: ${row.id}`)
  lines.push(`Date: ${row.capture_date}`)
  if (row.person) lines.push(`Person: ${row.person}`)
  if (row.status) lines.push(`Status: ${row.status}`)
  if (row.due_date) lines.push(`Due: ${row.due_date}`)
  if (row.category) lines.push(`Category: ${row.category}`)
  if (row.theme) lines.push(`Theme: ${row.theme}`)
  if (row.period) lines.push(`Period: ${row.period}`)

  const tags = JSON.parse(row.tags) as string[]
  if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`)

  if (row.source_url) lines.push(`URL: ${row.source_url}`)
  if (row.delegate) lines.push(`Delegate: ${row.delegate}`)
  lines.push(`Source: ${row.source_origin}`)
  lines.push(`Created: ${row.created_at}`)
  lines.push(`Updated: ${row.updated_at}`)
  lines.push('')
  lines.push(row.text)

  return lines.join('\n')
}

export function getRecord(db: Database.Database, id: string): string {
  const row = db
    .prepare(
      `SELECT id, log_type, title, text, capture_date, person, status,
              due_date, category, theme, period, tags, source_origin,
              source_url, delegate, created_at, updated_at
       FROM records WHERE id = ?`,
    )
    .get(id) as RecordRow | undefined

  if (!row) {
    return `Record not found: ${id}`
  }

  return formatRecordFull(row)
}

export function createRecord(db: Database.Database, params: CreateParams): string {
  if (!VALID_LOG_TYPES.includes(params.log_type as (typeof VALID_LOG_TYPES)[number])) {
    return `Invalid log_type: "${params.log_type}". Must be one of: ${VALID_LOG_TYPES.join(', ')}`
  }
  if (!params.text || params.text.trim().length === 0) {
    return 'Text is required and cannot be empty.'
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const captureDate = new Date().toISOString().slice(0, 10)
  const tags = JSON.stringify(params.tags ?? [])

  const DEFAULT_STATUS: Record<string, string> = {
    todo: 'open',
    project: 'open',
    idea: 'captured',
    learning: 'captured',
    daily_log: 'logged',
    people_note: 'logged',
  }
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

  const row = db
    .prepare(
      `SELECT id, log_type, title, text, capture_date, person, status,
              due_date, category, theme, period, tags, source_origin,
              source_url, delegate, created_at, updated_at
       FROM records WHERE id = ?`,
    )
    .get(id) as RecordRow

  return `Record created successfully.\n\n${formatRecordFull(row)}`
}

export function updateRecord(db: Database.Database, params: UpdateParams): string {
  const existing = db.prepare('SELECT id FROM records WHERE id = ?').get(params.id)
  if (!existing) {
    return `Record not found: ${params.id}`
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
    return 'No fields to update.'
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  sets.push('updated_at = ?')
  bindings.push(now)
  bindings.push(params.id)

  db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`).run(...bindings)

  const row = db
    .prepare(
      `SELECT id, log_type, title, text, capture_date, person, status,
              due_date, category, theme, period, tags, source_origin,
              source_url, delegate, created_at, updated_at
       FROM records WHERE id = ?`,
    )
    .get(params.id) as RecordRow

  return `Record updated successfully.\n\n${formatRecordFull(row)}`
}

export function deleteRecord(db: Database.Database, id: string): string {
  const existing = db
    .prepare('SELECT id, log_type, title FROM records WHERE id = ?')
    .get(id) as { id: string; log_type: string; title: string | null } | undefined

  if (!existing) {
    return `Record not found: ${id}`
  }

  db.prepare('DELETE FROM records WHERE id = ?').run(id)

  return `Deleted record: ${existing.title ?? existing.log_type} (${existing.id})`
}
