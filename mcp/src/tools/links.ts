import crypto from 'node:crypto'
import type Database from 'better-sqlite3'

export interface LinkParams {
  source_id: string
  target_id: string
  relation: string
}

export function linkRecords(db: Database.Database, params: LinkParams): string {
  if (params.source_id === params.target_id) {
    return `Cannot link a record to itself: ${params.source_id}`
  }

  const source = db.prepare('SELECT id, title, log_type FROM records WHERE id = ?').get(params.source_id) as
    | { id: string; title: string | null; log_type: string }
    | undefined
  if (!source) {
    return `Source record not found: ${params.source_id}`
  }

  const target = db.prepare('SELECT id, title, log_type FROM records WHERE id = ?').get(params.target_id) as
    | { id: string; title: string | null; log_type: string }
    | undefined
  if (!target) {
    return `Target record not found: ${params.target_id}`
  }

  const sourceLabel = source.title ?? source.log_type
  const targetLabel = target.title ?? target.log_type

  const existing = db
    .prepare('SELECT id FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
    .get(params.source_id, params.target_id, params.relation)

  if (existing) {
    return `Link already exists: ${sourceLabel} —[${params.relation}]→ ${targetLabel}`
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  db.prepare('INSERT INTO links (id, source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    params.source_id,
    params.target_id,
    params.relation,
    now,
  )

  return `Linked: ${sourceLabel} —[${params.relation}]→ ${targetLabel}\nLink ID: ${id}`
}

export function unlinkRecords(db: Database.Database, params: LinkParams): string {
  const result = db
    .prepare('DELETE FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
    .run(params.source_id, params.target_id, params.relation)

  if (result.changes === 0) {
    return `Link not found: no "${params.relation}" link between ${params.source_id} and ${params.target_id}`
  }

  return `Unlinked: removed "${params.relation}" link between ${params.source_id} and ${params.target_id}`
}
