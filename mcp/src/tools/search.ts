import type Database from 'better-sqlite3'

export interface SearchParams {
  query: string
  type?: string
  person?: string
  status?: string
  limit?: number
}

export interface ListParams {
  type?: string
  person?: string
  status?: string
  delegate?: string | null
  sort?: 'newest' | 'oldest'
  limit?: number
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
  source_url: string | null
  delegate: string | null
}

function formatRecord(row: RecordRow): string {
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

  const tags = JSON.parse(row.tags) as string[]
  if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`)
  if (row.source_url) lines.push(`URL: ${row.source_url}`)
  if (row.delegate) lines.push(`Delegate: ${row.delegate}`)

  lines.push('')
  lines.push(row.text.length > 500 ? row.text.slice(0, 500) + '...' : row.text)

  return lines.join('\n')
}

export function searchRecords(db: Database.Database, params: SearchParams): string {
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
           r.person, r.status, r.due_date, r.category, r.theme, r.period, r.tags,
           r.source_url, r.delegate
    FROM records r
    JOIN records_fts fts ON fts.rowid = r.rowid
    WHERE ${conditions.join(' AND ')}
    ORDER BY rank
    LIMIT ?
  `

  const rows = db.prepare(sql).all(...bindings) as RecordRow[]

  if (rows.length === 0) {
    return `No records found matching "${params.query}".`
  }

  const header = `Found ${rows.length} record${rows.length !== 1 ? 's' : ''} matching "${params.query}":\n`
  return header + '\n---\n\n' + rows.map(formatRecord).join('\n\n---\n\n')
}

export function listRecords(db: Database.Database, params: ListParams): string {
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

  bindings.push(limit)

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT id, log_type, title, text, capture_date,
           person, status, due_date, category, theme, period, tags,
           source_url, delegate
    FROM records
    ${where}
    ORDER BY capture_date ${sort}
    LIMIT ?
  `

  const rows = db.prepare(sql).all(...bindings) as RecordRow[]

  if (rows.length === 0) {
    const filters = [params.type, params.person, params.status].filter(Boolean).join(', ')
    return `No records found${filters ? ` (filters: ${filters})` : ''}.`
  }

  const countSql = `SELECT COUNT(*) as cnt FROM records ${where}`
  const countBindings = bindings.slice(0, -1)
  const total = (db.prepare(countSql).get(...countBindings) as { cnt: number }).cnt
  const showing = rows.length < total ? `Showing ${rows.length} of ${total}` : `${total} total`

  const header = `${showing} records:\n`
  return header + '\n---\n\n' + rows.map(formatRecord).join('\n\n---\n\n')
}
