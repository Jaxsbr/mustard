import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getDb, initSchema, getRecord } from 'mustard-core'
import { handleResearchRequest } from '../../src/handlers/research-request.js'
import type { RelayMessage } from '../../../contracts/types.js'

function makeResearchMessage(overrides: Record<string, unknown> = {}): RelayMessage {
  return {
    type: 'research-request',
    version: 1,
    payload: {
      url: 'https://example.com/article',
      relevance_note: 'Relevant to AI agents',
      tags: ['ai', 'research'],
      ...overrides,
    },
    metadata: {
      id: 'msg-test-001',
      source: 'test',
      timestamp: new Date().toISOString(),
    },
  }
}

describe('research-request handler', () => {
  let tmpDir: string
  let originalPulsePath: string | undefined
  let originalMustardDb: string | undefined

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'relay-test-'))
    originalPulsePath = process.env.PULSE_DATA_PATH
    originalMustardDb = process.env.MUSTARD_DB
    process.env.PULSE_DATA_PATH = tmpDir
    process.env.MUSTARD_DB = join(tmpDir, 'test.db')
  })

  afterEach(() => {
    if (originalPulsePath !== undefined) {
      process.env.PULSE_DATA_PATH = originalPulsePath
    } else {
      delete process.env.PULSE_DATA_PATH
    }
    if (originalMustardDb !== undefined) {
      process.env.MUSTARD_DB = originalMustardDb
    } else {
      delete process.env.MUSTARD_DB
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a mustard learning record and writes to research queue', async () => {
    const msg = makeResearchMessage()
    const recordId = await handleResearchRequest(msg)

    // Verify mustard record was created
    const db = getDb(process.env.MUSTARD_DB!)
    initSchema(db)
    const record = getRecord(db, recordId)
    expect(record).not.toBeNull()
    expect(record!.log_type).toBe('learning')
    expect(record!.source_origin).toBe('mustard-relay')
    expect(record!.source_url).toBe('https://example.com/article')
    expect(record!.text).toBe('Relevant to AI agents')
    expect(record!.status).toBe('captured')
    expect(JSON.parse(record!.tags)).toEqual(['ai', 'research'])

    // Verify research queue entry
    const queuePath = join(tmpDir, 'research-queue.json')
    const queue = JSON.parse(readFileSync(queuePath, 'utf-8'))
    expect(queue).toHaveLength(1)
    expect(queue[0].link).toBe('https://example.com/article')
    expect(queue[0].summary).toBe('Relevant to AI agents')
    expect(queue[0].source).toBe('relay')
    expect(queue[0].status).toBe('pending')
    expect(queue[0].tags).toEqual(['ai', 'research'])
  })

  it('returns the created record ID', async () => {
    const msg = makeResearchMessage()
    const recordId = await handleResearchRequest(msg)
    expect(recordId).toBeTruthy()
    expect(typeof recordId).toBe('string')
  })

  it('preserves mustard record even when pulse queue write fails', async () => {
    // Set an invalid pulse path to force write failure
    process.env.PULSE_DATA_PATH = '/nonexistent/path/that/does/not/exist'

    const msg = makeResearchMessage()
    const recordId = await handleResearchRequest(msg)

    // Record should still exist
    const db = getDb(process.env.MUSTARD_DB!)
    initSchema(db)
    const record = getRecord(db, recordId)
    expect(record).not.toBeNull()
    expect(record!.source_origin).toBe('mustard-relay')
  })

  it('appends to existing research queue entries', async () => {
    const msg1 = makeResearchMessage({ url: 'https://example.com/first' })
    const msg2 = makeResearchMessage({ url: 'https://example.com/second' })

    await handleResearchRequest(msg1)
    await handleResearchRequest(msg2)

    const queuePath = join(tmpDir, 'research-queue.json')
    const queue = JSON.parse(readFileSync(queuePath, 'utf-8'))
    expect(queue).toHaveLength(2)
    expect(queue[0].link).toBe('https://example.com/first')
    expect(queue[1].link).toBe('https://example.com/second')
  })
})
