import type Database from 'better-sqlite3'

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

interface LinkedRecord extends RecordRow {
  relation: string
}

export interface GetContextParams {
  record_id?: string
  person?: string
  project?: string
  since?: string
  depth?: number
  limit?: number
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
  if (row.period) lines.push(`Period: ${row.period}`)

  const tags = JSON.parse(row.tags) as string[]
  if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`)
  if (row.source_url) lines.push(`URL: ${row.source_url}`)
  if (row.delegate) lines.push(`Delegate: ${row.delegate}`)

  lines.push('')
  lines.push(row.text.length > 500 ? row.text.slice(0, 500) + '...' : row.text)

  return lines.join('\n')
}

function getLinkedRecords(
  db: Database.Database,
  recordId: string,
  since?: string,
): LinkedRecord[] {
  let sql = `
    SELECT r.id, r.log_type, r.title, r.text, r.capture_date, r.person, r.status,
      r.due_date, r.category, r.theme, r.period, r.tags, r.source_origin,
      r.source_url, r.delegate, r.created_at, r.updated_at, l.relation
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

function groupByRelation(linked: LinkedRecord[]): Map<string, LinkedRecord[]> {
  const groups = new Map<string, LinkedRecord[]>()
  for (const rec of linked) {
    const existing = groups.get(rec.relation) ?? []
    existing.push(rec)
    groups.set(rec.relation, existing)
  }
  return groups
}

function formatContextResult(anchors: RecordRow[], linked: LinkedRecord[]): string {
  if (anchors.length === 0) {
    return 'No matching records found.'
  }

  const sections: string[] = []

  sections.push('## Anchor Records\n')
  for (const anchor of anchors) {
    sections.push(formatRecord(anchor))
    sections.push('')
  }

  if (linked.length === 0) {
    sections.push('\n## Linked Records\n\n(none)')
  } else {
    sections.push('\n## Linked Records\n')
    const groups = groupByRelation(linked)
    for (const [relation, records] of groups) {
      sections.push(`### ${relation} (${records.length})\n`)
      for (const rec of records) {
        sections.push(formatRecord(rec))
        sections.push('')
      }
    }
  }

  return sections.join('\n')
}

export function getContext(db: Database.Database, params: GetContextParams): string {
  if (!params.record_id && !params.person && !params.project) {
    return 'No matching records found.'
  }

  const depth = Math.min(Math.max(params.depth ?? 1, 1), 2)
  const since = params.since

  const anchors: RecordRow[] = []
  const allLinked: LinkedRecord[] = []
  const seenAnchorIds = new Set<string>()
  const seenLinkedKeys = new Set<string>()

  // Collect anchor records
  if (params.record_id) {
    const row = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, tags, source_origin,
                source_url, delegate, created_at, updated_at
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
                due_date, category, theme, period, tags, source_origin,
                source_url, delegate, created_at, updated_at
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
                due_date, category, theme, period, tags, source_origin,
                source_url, delegate, created_at, updated_at
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

  // Depth-1: linked records for all anchors
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

  // Depth-2: follow links from depth-1 records (if requested)
  if (depth === 2) {
    // Deduplicate depth1Ids to avoid redundant queries
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

  // Apply limit (to linked records only — all anchors are always returned)
  let limitedLinked = allLinked
  if (params.limit !== undefined) {
    const remaining = Math.max(params.limit - anchors.length, 0)
    limitedLinked = allLinked.slice(0, remaining)
  }

  return formatContextResult(anchors, limitedLinked)
}

export interface ProjectSummaryParams {
  record_id?: string
  title?: string
  reference_date?: string // YYYY-MM-DD — for deterministic "recent activity" (defaults to today)
}

function formatPreview(row: RecordRow): string {
  let label = row.title
  if (!label && row.person) label = row.person
  if (!label) label = row.log_type.replace('_', ' ')
  const parts = [`**${label}**`, row.capture_date]
  if (row.status) parts.push(row.status)
  return parts.join(' | ')
}

export function projectSummary(db: Database.Database, params: ProjectSummaryParams): string {
  let project: RecordRow | undefined

  if (params.record_id) {
    project = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, tags, source_origin,
                source_url, delegate, created_at, updated_at
         FROM records WHERE id = ? AND log_type = 'project'`,
      )
      .get(params.record_id) as RecordRow | undefined
  }

  if (!project && params.title) {
    project = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, tags, source_origin,
                source_url, delegate, created_at, updated_at
         FROM records WHERE log_type = 'project' AND title LIKE ? LIMIT 1`,
      )
      .get(`%${params.title}%`) as RecordRow | undefined
  }

  if (!project) {
    return `Project not found: ${params.title ?? params.record_id ?? 'no identifier provided'}`
  }

  const sections: string[] = []
  sections.push(`# Project Summary — ${project.title ?? 'Untitled'}\n`)
  sections.push(formatRecord(project))
  sections.push('')

  const linked = getLinkedRecords(db, project.id)

  // Team — people_note records
  const team = linked.filter((r) => r.log_type === 'people_note')
  sections.push(`## Team (${team.length})\n`)
  if (team.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of team) {
      sections.push(`- ${formatPreview(r)}`)
    }
  }
  sections.push('')

  // Open Todos — excludes done todos
  const openTodos = linked.filter((r) => r.log_type === 'todo' && r.status === 'open')
  sections.push(`## Open Todos (${openTodos.length})\n`)
  if (openTodos.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of openTodos) {
      const due = r.due_date ? ` — due ${r.due_date}` : ''
      sections.push(`- ${formatPreview(r)}${due}`)
    }
  }
  sections.push('')

  // Recent Activity — last 7 days from reference date (deterministic)
  const refDate = params.reference_date ?? new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(new Date(refDate).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const recent = linked.filter(
    (r) => r.capture_date >= sevenDaysAgo || r.updated_at.slice(0, 10) >= sevenDaysAgo,
  )
  sections.push(`## Recent Activity (${recent.length})\n`)
  if (recent.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of recent) {
      sections.push(`- ${formatPreview(r)}`)
    }
  }
  sections.push('')

  // Linked Ideas
  const ideas = linked.filter((r) => r.log_type === 'idea')
  sections.push(`## Linked Ideas (${ideas.length})\n`)
  if (ideas.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of ideas) {
      sections.push(`- ${formatPreview(r)}`)
    }
  }

  return sections.join('\n')
}
