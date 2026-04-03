import type {
  RecordRow,
  LinkedRecord,
  DailySummaryResult,
  ProjectSummaryResult,
} from 'mustard-core'

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

function formatRecordSummary(row: RecordRow): string {
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

function formatPreview(row: RecordRow | LinkedRecord): string {
  let label = row.title
  if (!label && row.person) label = row.person
  if (!label) label = row.log_type.replace('_', ' ')
  const parts = [`**${label}**`, row.capture_date]
  if (row.status) parts.push(row.status)
  return parts.join(' | ')
}

export function formatGetRecord(row: RecordRow | null, id: string): string {
  if (!row) return `Record not found: ${id}`
  return formatRecordFull(row)
}

export function formatCreateRecord(row: RecordRow): string {
  return `Record created successfully.\n\n${formatRecordFull(row)}`
}

export function formatUpdateRecord(row: RecordRow): string {
  return `Record updated successfully.\n\n${formatRecordFull(row)}`
}

export function formatDeleteRecord(deleted: { id: string; log_type: string; title: string | null }): string {
  return `Deleted record: ${deleted.title ?? deleted.log_type} (${deleted.id})`
}

export function formatSearchResults(rows: RecordRow[], query: string): string {
  if (rows.length === 0) {
    return `No records found matching "${query}".`
  }

  const header = `Found ${rows.length} record${rows.length !== 1 ? 's' : ''} matching "${query}":\n`
  return header + '\n---\n\n' + rows.map(formatRecordSummary).join('\n\n---\n\n')
}

export function formatListResults(records: RecordRow[], total: number, filters?: { type?: string; person?: string; status?: string }): string {
  if (records.length === 0) {
    const filterParts = [filters?.type, filters?.person, filters?.status].filter(Boolean).join(', ')
    return `No records found${filterParts ? ` (filters: ${filterParts})` : ''}.`
  }

  const showing = records.length < total ? `Showing ${records.length} of ${total}` : `${total} total`
  const header = `${showing} records:\n`
  return header + '\n---\n\n' + records.map(formatRecordSummary).join('\n\n---\n\n')
}

export function formatLinkResult(link: { id: string; source_id: string; target_id: string; relation: string }, sourceLabel: string, targetLabel: string, alreadyExists: boolean): string {
  if (alreadyExists) {
    return `Link already exists: ${sourceLabel} —[${link.relation}]→ ${targetLabel}`
  }
  return `Linked: ${sourceLabel} —[${link.relation}]→ ${targetLabel}\nLink ID: ${link.id}`
}

export function formatUnlinkResult(changes: number, params: { source_id: string; target_id: string; relation: string }): string {
  if (changes === 0) {
    return `Link not found: no "${params.relation}" link between ${params.source_id} and ${params.target_id}`
  }
  return `Unlinked: removed "${params.relation}" link between ${params.source_id} and ${params.target_id}`
}

export function formatContext(anchors: RecordRow[], linked: LinkedRecord[]): string {
  if (anchors.length === 0) {
    return 'No matching records found.'
  }

  const sections: string[] = []

  sections.push('## Anchor Records\n')
  for (const anchor of anchors) {
    sections.push(formatRecordSummary(anchor))
    sections.push('')
  }

  if (linked.length === 0) {
    sections.push('\n## Linked Records\n\n(none)')
  } else {
    sections.push('\n## Linked Records\n')
    const groups = new Map<string, LinkedRecord[]>()
    for (const rec of linked) {
      const existing = groups.get(rec.relation) ?? []
      existing.push(rec)
      groups.set(rec.relation, existing)
    }
    for (const [relation, records] of groups) {
      sections.push(`### ${relation} (${records.length})\n`)
      for (const rec of records) {
        sections.push(formatRecordSummary(rec))
        sections.push('')
      }
    }
  }

  return sections.join('\n')
}

export function formatDailySummary(result: DailySummaryResult): string {
  const sections: string[] = []

  sections.push(`# Daily Summary — ${result.date}\n`)

  if (result.overdue.length > 0) {
    sections.push(`## Overdue (${result.overdue.length})\n`)
    for (const t of result.overdue) {
      const label = t.title ?? t.text.slice(0, 80)
      sections.push(`- **${label}** — due ${t.due_date} (${t.id})`)
    }
    sections.push('')
  }

  if (result.dueToday.length > 0) {
    sections.push(`## Due Today (${result.dueToday.length})\n`)
    for (const t of result.dueToday) {
      const label = t.title ?? t.text.slice(0, 80)
      sections.push(`- **${label}** (${t.id})`)
    }
    sections.push('')
  }

  if (result.openTodos.length > 0) {
    sections.push(`## Open Todos (${result.openTodos.length})\n`)
    for (const t of result.openTodos) {
      const label = t.title ?? t.text.slice(0, 80)
      const due = t.due_date ? ` — due ${t.due_date}` : ''
      sections.push(`- ${label}${due}`)
    }
    sections.push('')
  }

  if (result.todayLogs.length > 0) {
    sections.push(`## Today's Logs (${result.todayLogs.length})\n`)
    for (const l of result.todayLogs) {
      const label = l.title ?? l.theme ?? 'log'
      const preview = l.text.length > 200 ? l.text.slice(0, 200) + '...' : l.text
      sections.push(`### ${label}\n${preview}\n`)
    }
  }

  if (result.recentNotes.length > 0) {
    sections.push(`## Recent Notes & Ideas (last 7 days)\n`)
    for (const n of result.recentNotes) {
      const label = n.title ?? (n.person ? `Note about ${n.person}` : n.log_type.replace('_', ' '))
      const preview = n.text.length > 150 ? n.text.slice(0, 150) + '...' : n.text
      sections.push(`- **${label}** (${n.capture_date}): ${preview}`)
    }
    sections.push('')
  }

  if (sections.length <= 1) {
    sections.push('Nothing scheduled or logged for today. Fresh slate!')
  }

  return sections.join('\n')
}

export function formatProjectSummary(result: ProjectSummaryResult | null, params: { record_id?: string; title?: string }): string {
  if (!result) {
    return `Project not found: ${params.title ?? params.record_id ?? 'no identifier provided'}`
  }

  const sections: string[] = []
  sections.push(`# Project Summary — ${result.project.title ?? 'Untitled'}\n`)
  sections.push(formatRecordSummary(result.project))
  sections.push('')

  sections.push(`## Team (${result.team.length})\n`)
  if (result.team.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of result.team) { sections.push(`- ${formatPreview(r)}`) }
  }
  sections.push('')

  sections.push(`## Open Todos (${result.openTodos.length})\n`)
  if (result.openTodos.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of result.openTodos) {
      const due = r.due_date ? ` — due ${r.due_date}` : ''
      sections.push(`- ${formatPreview(r)}${due}`)
    }
  }
  sections.push('')

  sections.push(`## Recent Activity (${result.recentActivity.length})\n`)
  if (result.recentActivity.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of result.recentActivity) { sections.push(`- ${formatPreview(r)}`) }
  }
  sections.push('')

  sections.push(`## Linked Ideas (${result.linkedIdeas.length})\n`)
  if (result.linkedIdeas.length === 0) {
    sections.push('(none)')
  } else {
    for (const r of result.linkedIdeas) { sections.push(`- ${formatPreview(r)}`) }
  }

  return sections.join('\n')
}
