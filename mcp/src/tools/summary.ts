import type Database from 'better-sqlite3'

interface TodoRow {
  id: string
  title: string | null
  text: string
  status: string | null
  due_date: string | null
  capture_date: string
}

interface LogRow {
  id: string
  title: string | null
  text: string
  theme: string | null
  capture_date: string
}

interface NoteRow {
  id: string
  log_type: string
  title: string | null
  text: string
  person: string | null
  capture_date: string
}

export function dailySummary(db: Database.Database, date?: string): string {
  const today = date ?? new Date().toISOString().slice(0, 10)
  const sections: string[] = []

  sections.push(`# Daily Summary — ${today}\n`)

  const overdue = db
    .prepare(
      `SELECT id, title, text, status, due_date, capture_date
       FROM records
       WHERE log_type = 'todo' AND status = 'open' AND due_date < ?
       ORDER BY due_date ASC`,
    )
    .all(today) as TodoRow[]

  if (overdue.length > 0) {
    sections.push(`## Overdue (${overdue.length})\n`)
    for (const t of overdue) {
      const label = t.title ?? t.text.slice(0, 80)
      sections.push(`- **${label}** — due ${t.due_date} (${t.id})`)
    }
    sections.push('')
  }

  const dueToday = db
    .prepare(
      `SELECT id, title, text, status, due_date, capture_date
       FROM records
       WHERE log_type = 'todo' AND status = 'open' AND due_date = ?
       ORDER BY capture_date DESC`,
    )
    .all(today) as TodoRow[]

  if (dueToday.length > 0) {
    sections.push(`## Due Today (${dueToday.length})\n`)
    for (const t of dueToday) {
      const label = t.title ?? t.text.slice(0, 80)
      sections.push(`- **${label}** (${t.id})`)
    }
    sections.push('')
  }

  const openTodos = db
    .prepare(
      `SELECT id, title, text, status, due_date, capture_date
       FROM records
       WHERE log_type = 'todo' AND status = 'open'
             AND (due_date IS NULL OR due_date > ?)
       ORDER BY capture_date DESC
       LIMIT 15`,
    )
    .all(today) as TodoRow[]

  if (openTodos.length > 0) {
    sections.push(`## Open Todos (${openTodos.length})\n`)
    for (const t of openTodos) {
      const label = t.title ?? t.text.slice(0, 80)
      const due = t.due_date ? ` — due ${t.due_date}` : ''
      sections.push(`- ${label}${due}`)
    }
    sections.push('')
  }

  const todayLogs = db
    .prepare(
      `SELECT id, title, text, theme, capture_date
       FROM records
       WHERE log_type = 'daily_log' AND capture_date = ?
       ORDER BY created_at DESC`,
    )
    .all(today) as LogRow[]

  if (todayLogs.length > 0) {
    sections.push(`## Today's Logs (${todayLogs.length})\n`)
    for (const l of todayLogs) {
      const label = l.title ?? l.theme ?? 'log'
      const preview = l.text.length > 200 ? l.text.slice(0, 200) + '...' : l.text
      sections.push(`### ${label}\n${preview}\n`)
    }
  }

  const recentNotes = db
    .prepare(
      `SELECT id, log_type, title, text, person, capture_date
       FROM records
       WHERE log_type IN ('people_note', 'idea', 'learning')
             AND capture_date >= date(?, '-7 days')
       ORDER BY capture_date DESC
       LIMIT 10`,
    )
    .all(today) as NoteRow[]

  if (recentNotes.length > 0) {
    sections.push(`## Recent Notes & Ideas (last 7 days)\n`)
    for (const n of recentNotes) {
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
