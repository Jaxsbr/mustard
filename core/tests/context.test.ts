import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../src/db.js'
import { createRecord } from '../src/records.js'
import { linkRecords } from '../src/links.js'
import { getContext } from '../src/context.js'

let db: Database.Database
let projectId: string
let todoId: string
let noteId: string
let ideaId: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)

  const project = createRecord(db, { log_type: 'project', text: 'Alpha project', title: 'Alpha' })
  const todo = createRecord(db, { log_type: 'todo', text: 'Implement feature', title: 'Feature X' })
  const note = createRecord(db, { log_type: 'people_note', text: 'Met with Bob', person: 'bob' })
  const idea = createRecord(db, { log_type: 'idea', text: 'Use graph database', title: 'Graph DB' })

  projectId = project.id
  todoId = todo.id
  noteId = note.id
  ideaId = idea.id

  linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })
  linkRecords(db, { source_id: noteId, target_id: projectId, relation: 'member_of' })
  linkRecords(db, { source_id: ideaId, target_id: todoId, relation: 'related_to' })
})

afterEach(() => {
  db.close()
})

describe('getContext', () => {
  it('returns anchors and linked records at depth 1', () => {
    const result = getContext(db, { record_id: projectId, depth: 1 })

    expect(result.anchors.length).toBe(1)
    expect(result.anchors[0].id).toBe(projectId)

    // project is linked to todo and note (depth 1)
    expect(result.linked.length).toBe(2)
    const linkedIds = result.linked.map((r) => r.id)
    expect(linkedIds).toContain(todoId)
    expect(linkedIds).toContain(noteId)
  })

  it('returns depth 2 records (follows links from depth 1)', () => {
    const result = getContext(db, { record_id: projectId, depth: 2 })

    expect(result.anchors.length).toBe(1)

    // depth 1: todo, note; depth 2: idea (linked to todo)
    const linkedIds = result.linked.map((r) => r.id)
    expect(linkedIds).toContain(todoId)
    expect(linkedIds).toContain(noteId)
    expect(linkedIds).toContain(ideaId)
  })

  it('returns records by person', () => {
    const result = getContext(db, { person: 'bob' })

    expect(result.anchors.length).toBe(1)
    expect(result.anchors[0].person).toBe('bob')
  })

  it('returns records by project title', () => {
    const result = getContext(db, { project: 'Alpha' })

    expect(result.anchors.length).toBe(1)
    expect(result.anchors[0].title).toBe('Alpha')
  })

  it('returns empty when no params match', () => {
    const result = getContext(db, {})
    expect(result.anchors).toEqual([])
    expect(result.linked).toEqual([])
  })

  it('applies limit to linked records', () => {
    const result = getContext(db, { record_id: projectId, depth: 2, limit: 2 })
    // limit 2 means: 1 anchor + max 1 linked
    expect(result.anchors.length).toBe(1)
    expect(result.linked.length).toBeLessThanOrEqual(1)
  })
})
