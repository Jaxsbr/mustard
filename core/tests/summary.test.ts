import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../src/db.js'
import { createRecord } from '../src/records.js'
import { linkRecords } from '../src/links.js'
import { dailySummary, projectSummary } from '../src/summary.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
})

afterEach(() => {
  db.close()
})

describe('dailySummary', () => {
  it('returns structured data with all sections', () => {
    // Seed with deterministic dates
    const refDate = '2026-04-03'

    // Create a todo due yesterday (overdue)
    db.prepare(
      `INSERT INTO records (id, log_type, title, text, capture_date, status, due_date, source_origin, tags, created_at, updated_at)
       VALUES ('t1', 'todo', 'Overdue Task', 'text', '2026-04-01', 'open', '2026-04-02', 'mustard-mcp', '[]', '2026-04-01 10:00:00', '2026-04-01 10:00:00')`,
    ).run()

    // Create a todo due today
    db.prepare(
      `INSERT INTO records (id, log_type, title, text, capture_date, status, due_date, source_origin, tags, created_at, updated_at)
       VALUES ('t2', 'todo', 'Due Today', 'text', '2026-04-03', 'open', '2026-04-03', 'mustard-mcp', '[]', '2026-04-03 10:00:00', '2026-04-03 10:00:00')`,
    ).run()

    // Create an open todo with no due date
    db.prepare(
      `INSERT INTO records (id, log_type, title, text, capture_date, status, source_origin, tags, created_at, updated_at)
       VALUES ('t3', 'todo', 'Open Task', 'text', '2026-04-03', 'open', 'mustard-mcp', '[]', '2026-04-03 10:00:00', '2026-04-03 10:00:00')`,
    ).run()

    // Create a daily log for today
    db.prepare(
      `INSERT INTO records (id, log_type, title, text, capture_date, status, theme, source_origin, tags, created_at, updated_at)
       VALUES ('d1', 'daily_log', 'Morning Standup', 'Discussed progress', '2026-04-03', 'logged', 'work', 'mustard-mcp', '[]', '2026-04-03 09:00:00', '2026-04-03 09:00:00')`,
    ).run()

    // Create a recent idea (within 7 days)
    db.prepare(
      `INSERT INTO records (id, log_type, title, text, capture_date, status, source_origin, tags, created_at, updated_at)
       VALUES ('i1', 'idea', 'New Concept', 'An interesting idea', '2026-04-01', 'captured', 'mustard-mcp', '[]', '2026-04-01 10:00:00', '2026-04-01 10:00:00')`,
    ).run()

    const result = dailySummary(db, refDate)

    expect(result.date).toBe(refDate)
    expect(result.overdue.length).toBe(1)
    expect(result.overdue[0].id).toBe('t1')
    expect(result.dueToday.length).toBe(1)
    expect(result.dueToday[0].id).toBe('t2')
    expect(result.openTodos.length).toBe(1)
    expect(result.openTodos[0].id).toBe('t3')
    expect(result.todayLogs.length).toBe(1)
    expect(result.todayLogs[0].id).toBe('d1')
    expect(result.recentNotes.length).toBe(1)
    expect(result.recentNotes[0].id).toBe('i1')
  })

  it('returns empty arrays when no records exist', () => {
    const result = dailySummary(db, '2026-04-03')

    expect(result.overdue).toEqual([])
    expect(result.dueToday).toEqual([])
    expect(result.openTodos).toEqual([])
    expect(result.todayLogs).toEqual([])
    expect(result.recentNotes).toEqual([])
  })
})

describe('projectSummary', () => {
  it('returns structured project data with linked records', () => {
    const project = createRecord(db, { log_type: 'project', text: 'Alpha project', title: 'Alpha' })
    const todo = createRecord(db, { log_type: 'todo', text: 'Build feature' })
    const note = createRecord(db, { log_type: 'people_note', text: 'Bob context', person: 'bob' })
    const idea = createRecord(db, { log_type: 'idea', text: 'Use graph' })

    linkRecords(db, { source_id: todo.id, target_id: project.id, relation: 'assigned_to' })
    linkRecords(db, { source_id: note.id, target_id: project.id, relation: 'member_of' })
    linkRecords(db, { source_id: idea.id, target_id: project.id, relation: 'related_to' })

    const result = projectSummary(db, { record_id: project.id, reference_date: '2026-04-03' })

    expect(result).not.toBeNull()
    expect(result!.project.id).toBe(project.id)
    expect(result!.team.length).toBe(1)
    expect(result!.team[0].person).toBe('bob')
    expect(result!.openTodos.length).toBe(1)
    expect(result!.linkedIdeas.length).toBe(1)
  })

  it('finds project by title', () => {
    createRecord(db, { log_type: 'project', text: 'Beta project', title: 'Beta' })

    const result = projectSummary(db, { title: 'Beta', reference_date: '2026-04-03' })

    expect(result).not.toBeNull()
    expect(result!.project.title).toBe('Beta')
  })

  it('returns null when project not found', () => {
    const result = projectSummary(db, { title: 'NonExistent' })
    expect(result).toBeNull()
  })
})
