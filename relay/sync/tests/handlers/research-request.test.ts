import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'relay-test-'))
    originalPulsePath = process.env.PULSE_DATA_PATH
    process.env.PULSE_DATA_PATH = tmpDir
  })

  afterEach(() => {
    if (originalPulsePath !== undefined) {
      process.env.PULSE_DATA_PATH = originalPulsePath
    } else {
      delete process.env.PULSE_DATA_PATH
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a pending entry to the research queue', async () => {
    const msg = makeResearchMessage()
    const entryId = await handleResearchRequest(msg)

    const queuePath = join(tmpDir, 'research-queue.json')
    const queue = JSON.parse(readFileSync(queuePath, 'utf-8'))
    expect(queue).toHaveLength(1)
    expect(queue[0].link).toBe('https://example.com/article')
    expect(queue[0].summary).toBe('Relevant to AI agents')
    expect(queue[0].source).toBe('relay')
    expect(queue[0].status).toBe('pending')
    expect(queue[0].tags).toEqual(['ai', 'research'])
    expect(queue[0].id).toBe(entryId)
  })

  it('returns a queue entry ID', async () => {
    const msg = makeResearchMessage()
    const entryId = await handleResearchRequest(msg)
    expect(entryId).toBeTruthy()
    expect(typeof entryId).toBe('string')
  })

  it('throws when pulse queue path is invalid', async () => {
    process.env.PULSE_DATA_PATH = '/nonexistent/path/that/does/not/exist'

    const msg = makeResearchMessage()
    await expect(handleResearchRequest(msg)).rejects.toThrow()
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
