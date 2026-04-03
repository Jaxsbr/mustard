import type Database from 'better-sqlite3'
import type { RecordRow, LinkedRecord, GetContextParams } from './types.js'

const RECORD_COLUMNS = `r.id, r.log_type, r.title, r.text, r.capture_date, r.person, r.status,
  r.due_date, r.category, r.theme, r.period, r.source_origin, r.source_date,
  r.tags, r.confidence, r.created_by, r.source_url, r.delegate, r.created_at, r.updated_at`

function getLinkedRecords(
  db: Database.Database,
  recordId: string,
  since?: string,
): LinkedRecord[] {
  let sql = `
    SELECT ${RECORD_COLUMNS}, l.relation
    FROM links l
    JOIN records r ON r.id = CASE WHEN l.source_id = ? THEN l.target_id ELSE l.source_id END
    WHERE (l.source_id = ? OR l.target_id = ?)
  `
  const bindings: string[] = [recordId, recordId, recordId]

  if (since) {
    sql += ` AND (r.created_at >= ? OR r.updated_at >= ?)`
    bindings.push(since, since)
  }

  return db.prepare(sql).all(...bindings) as LinkedRecord[]
}

export function getContext(db: Database.Database, params: GetContextParams): { anchors: RecordRow[]; linked: LinkedRecord[] } {
  if (!params.record_id && !params.person && !params.project) {
    return { anchors: [], linked: [] }
  }

  const depth = Math.min(Math.max(params.depth ?? 1, 1), 2)
  const since = params.since

  const anchors: RecordRow[] = []
  const allLinked: LinkedRecord[] = []
  const seenAnchorIds = new Set<string>()
  const seenLinkedKeys = new Set<string>()

  if (params.record_id) {
    const row = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, source_origin, source_date,
                tags, confidence, created_by, source_url, delegate, created_at, updated_at
         FROM records WHERE id = ?`,
      )
      .get(params.record_id) as RecordRow | undefined

    if (row) {
      anchors.push(row)
      seenAnchorIds.add(row.id)
    }
  }

  if (params.person) {
    const rows = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, source_origin, source_date,
                tags, confidence, created_by, source_url, delegate, created_at, updated_at
         FROM records WHERE person = ?`,
      )
      .all(params.person) as RecordRow[]

    for (const row of rows) {
      if (!seenAnchorIds.has(row.id)) {
        anchors.push(row)
        seenAnchorIds.add(row.id)
      }
    }
  }

  if (params.project) {
    const rows = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, source_origin, source_date,
                tags, confidence, created_by, source_url, delegate, created_at, updated_at
         FROM records WHERE log_type = 'project' AND title LIKE ?`,
      )
      .all(`%${params.project}%`) as RecordRow[]

    for (const row of rows) {
      if (!seenAnchorIds.has(row.id)) {
        anchors.push(row)
        seenAnchorIds.add(row.id)
      }
    }
  }

  const depth1Ids: string[] = []
  for (const anchor of anchors) {
    for (const linked of getLinkedRecords(db, anchor.id, since)) {
      if (seenAnchorIds.has(linked.id)) continue
      const key = `${linked.id}:${linked.relation}`
      if (seenLinkedKeys.has(key)) continue
      seenLinkedKeys.add(key)
      allLinked.push(linked)
      depth1Ids.push(linked.id)
    }
  }

  if (depth === 2) {
    const uniqueD1 = [...new Set(depth1Ids)]
    for (const d1Id of uniqueD1) {
      for (const linked of getLinkedRecords(db, d1Id, since)) {
        if (seenAnchorIds.has(linked.id)) continue
        const key = `${linked.id}:${linked.relation}`
        if (seenLinkedKeys.has(key)) continue
        seenLinkedKeys.add(key)
        allLinked.push(linked)
      }
    }
  }

  let limitedLinked = allLinked
  if (params.limit !== undefined) {
    const remaining = Math.max(params.limit - anchors.length, 0)
    limitedLinked = allLinked.slice(0, remaining)
  }

  return { anchors, linked: limitedLinked }
}
