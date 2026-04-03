import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { LinkParams } from './types.js'

export function linkRecords(db: Database.Database, params: LinkParams): { id: string; source_id: string; target_id: string; relation: string } {
  if (params.source_id === params.target_id) {
    throw new Error(`Cannot link a record to itself: ${params.source_id}`)
  }

  const source = db.prepare('SELECT id FROM records WHERE id = ?').get(params.source_id)
  if (!source) {
    throw new Error(`Source record not found: ${params.source_id}`)
  }

  const target = db.prepare('SELECT id FROM records WHERE id = ?').get(params.target_id)
  if (!target) {
    throw new Error(`Target record not found: ${params.target_id}`)
  }

  const existing = db
    .prepare('SELECT id FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
    .get(params.source_id, params.target_id, params.relation) as { id: string } | undefined

  if (existing) {
    return {
      id: existing.id,
      source_id: params.source_id,
      target_id: params.target_id,
      relation: params.relation,
    }
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

  return { id, source_id: params.source_id, target_id: params.target_id, relation: params.relation }
}

export function unlinkRecords(db: Database.Database, params: LinkParams): { changes: number } {
  const result = db
    .prepare('DELETE FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
    .run(params.source_id, params.target_id, params.relation)

  return { changes: result.changes }
}
