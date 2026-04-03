import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../src/db.js'
import { getRecord, createRecord, updateRecord, deleteRecord } from '../src/records.js'

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

describe('createRecord', () => {
  it('creates a todo and returns a RecordRow', () => {
    const row = createRecord(db, { log_type: 'todo', text: 'Buy groceries', title: 'Shopping' })

    expect(row.id).toBeTruthy()
    expect(row.log_type).toBe('todo')
    expect(row.text).toBe('Buy groceries')
    expect(row.title).toBe('Shopping')
    expect(row.status).toBe('open')
    expect(row.capture_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(row.created_at).toBeTruthy()
    expect(row.updated_at).toBeTruthy()
  })

  it('assigns default status per log_type', () => {
    const todo = createRecord(db, { log_type: 'todo', text: 'task' })
    expect(todo.status).toBe('open')

    const idea = createRecord(db, { log_type: 'idea', text: 'concept' })
    expect(idea.status).toBe('captured')

    const log = createRecord(db, { log_type: 'daily_log', text: 'log entry' })
    expect(log.status).toBe('logged')

    const note = createRecord(db, { log_type: 'people_note', text: 'note about someone' })
    expect(note.status).toBe('logged')
  })

  it('allows custom status override', () => {
    const row = createRecord(db, { log_type: 'todo', text: 'task', status: 'done' })
    expect(row.status).toBe('done')
  })

  it('stores tags as JSON array', () => {
    const row = createRecord(db, { log_type: 'idea', text: 'concept', tags: ['ai', 'ml'] })
    expect(JSON.parse(row.tags)).toEqual(['ai', 'ml'])
  })

  it('throws on invalid log_type', () => {
    expect(() => createRecord(db, { log_type: 'invalid', text: 'test' })).toThrow('Invalid log_type')
  })

  it('throws on empty text', () => {
    expect(() => createRecord(db, { log_type: 'todo', text: '' })).toThrow('Text is required')
    expect(() => createRecord(db, { log_type: 'todo', text: '   ' })).toThrow('Text is required')
  })
})

describe('getRecord', () => {
  it('returns a RecordRow for an existing record', () => {
    const created = createRecord(db, { log_type: 'todo', text: 'task' })
    const fetched = getRecord(db, created.id)

    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.text).toBe('task')
  })

  it('returns null for non-existent record', () => {
    const result = getRecord(db, 'non-existent-id')
    expect(result).toBeNull()
  })
})

describe('updateRecord', () => {
  it('updates fields and returns the updated RecordRow', () => {
    const created = createRecord(db, { log_type: 'todo', text: 'original', title: 'Original' })
    const updated = updateRecord(db, { id: created.id, text: 'modified', title: 'Modified' })

    expect(updated.id).toBe(created.id)
    expect(updated.text).toBe('modified')
    expect(updated.title).toBe('Modified')
  })

  it('updates status field', () => {
    const created = createRecord(db, { log_type: 'todo', text: 'task' })
    const updated = updateRecord(db, { id: created.id, status: 'done' })
    expect(updated.status).toBe('done')
  })

  it('returns unchanged record when no fields provided', () => {
    const created = createRecord(db, { log_type: 'todo', text: 'task' })
    const same = updateRecord(db, { id: created.id })
    expect(same.text).toBe('task')
  })

  it('throws on non-existent record', () => {
    expect(() => updateRecord(db, { id: 'non-existent', text: 'fail' })).toThrow('Record not found')
  })
})

describe('deleteRecord', () => {
  it('deletes and returns id, log_type, title', () => {
    const created = createRecord(db, { log_type: 'todo', text: 'task', title: 'My Task' })
    const deleted = deleteRecord(db, created.id)

    expect(deleted.id).toBe(created.id)
    expect(deleted.log_type).toBe('todo')
    expect(deleted.title).toBe('My Task')

    expect(getRecord(db, created.id)).toBeNull()
  })

  it('throws on non-existent record', () => {
    expect(() => deleteRecord(db, 'non-existent')).toThrow('Record not found')
  })
})
