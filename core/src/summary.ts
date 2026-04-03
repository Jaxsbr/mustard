import type Database from 'better-sqlite3'
import type { RecordRow, LinkedRecord, ProjectSummaryParams } from './types.js'

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

export interface DailySummaryResult {
  date: string
  overdue: TodoRow[]
  dueToday: TodoRow[]
  openTodos: TodoRow[]
  todayLogs: LogRow[]
  recentNotes: NoteRow[]
}

export interface ProjectSummaryResult {
  project: RecordRow
  team: LinkedRecord[]
  openTodos: LinkedRecord[]
  recentActivity: LinkedRecord[]
  linkedIdeas: LinkedRecord[]
}

function getLinkedRecords(db: Database.Database, recordId: string): LinkedRecord[] {
  return db
    .prepare(
      `SELECT r.id, r.log_type, r.title, r.text, r.capture_date, r.person, r.status,
              r.due_date, r.category, r.theme, r.period, r.source_origin, r.source_date,
              r.tags, r.confidence, r.created_by, r.source_url, r.delegate,
              r.created_at, r.updated_at, l.relation
       FROM links l
       JOIN records r ON r.id = CASE WHEN l.source_id = ? THEN l.target_id ELSE l.source_id END
       WHERE (l.source_id = ? OR l.target_id = ?)`,
    )
    .all(recordId, recordId, recordId) as LinkedRecord[]
}

export function dailySummary(db: Database.Database, date?: string): DailySummaryResult {
  const today = date ?? new Date().toISOString().slice(0, 10)

  const overdue = db
    .prepare(
      `SELECT id, title, text, status, due_date, capture_date
       FROM records
       WHERE log_type = 'todo' AND status = 'open' AND due_date < ?
       ORDER BY due_date ASC`,
    )
    .all(today) as TodoRow[]

  const dueToday = db
    .prepare(
      `SELECT id, title, text, status, due_date, capture_date
       FROM records
       WHERE log_type = 'todo' AND status = 'open' AND due_date = ?
       ORDER BY capture_date DESC`,
    )
    .all(today) as TodoRow[]

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

  const todayLogs = db
    .prepare(
      `SELECT id, title, text, theme, capture_date
       FROM records
       WHERE log_type = 'daily_log' AND capture_date = ?
       ORDER BY created_at DESC`,
    )
    .all(today) as LogRow[]

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

  return { date: today, overdue, dueToday, openTodos, todayLogs, recentNotes }
}

export function projectSummary(db: Database.Database, params: ProjectSummaryParams): ProjectSummaryResult | null {
  let project: RecordRow | undefined

  if (params.record_id) {
    project = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, source_origin, source_date,
                tags, confidence, created_by, source_url, delegate, created_at, updated_at
         FROM records WHERE id = ? AND log_type = 'project'`,
      )
      .get(params.record_id) as RecordRow | undefined
  }

  if (!project && params.title) {
    project = db
      .prepare(
        `SELECT id, log_type, title, text, capture_date, person, status,
                due_date, category, theme, period, source_origin, source_date,
                tags, confidence, created_by, source_url, delegate, created_at, updated_at
         FROM records WHERE log_type = 'project' AND title LIKE ? LIMIT 1`,
      )
      .get(`%${params.title}%`) as RecordRow | undefined
  }

  if (!project) {
    return null
  }

  const linked = getLinkedRecords(db, project.id)

  const team = linked.filter((r) => r.log_type === 'people_note')
  const openTodos = linked.filter((r) => r.log_type === 'todo' && r.status === 'open')

  const refDate = params.reference_date ?? new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(new Date(refDate).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const recentActivity = linked.filter(
    (r) => r.capture_date >= sevenDaysAgo || r.updated_at.slice(0, 10) >= sevenDaysAgo,
  )

  const linkedIdeas = linked.filter((r) => r.log_type === 'idea')

  return { project, team, openTodos, recentActivity, linkedIdeas }
}
