import { describe, it, expect, beforeEach } from 'vitest'
import { dispatch, registerHandler } from '../src/dispatcher.js'
import type { RelayMessage } from '../../contracts/types.js'

function makeMessage(overrides: Partial<RelayMessage> = {}): RelayMessage {
  return {
    type: 'research-request',
    version: 1,
    payload: {
      url: 'https://example.com/article',
      relevance_note: 'Relevant to AI agents',
    },
    metadata: {
      id: 'msg-001',
      source: 'test',
      timestamp: new Date().toISOString(),
    },
    ...overrides,
  }
}

describe('dispatcher', () => {
  beforeEach(() => {
    registerHandler('research-request', async (msg) => {
      return `handled:${msg.metadata.id}`
    })
  })

  it('routes a research-request message to the correct handler', async () => {
    const result = await dispatch(makeMessage())
    expect(result).toBe('handled:msg-001')
  })

  it('throws on unknown message type', async () => {
    const msg = makeMessage({ type: 'unknown-type' })
    await expect(dispatch(msg)).rejects.toThrow('Unknown message type: "unknown-type"')
  })

  it('throws on schema validation failure', async () => {
    const msg = makeMessage({ payload: { url: '', relevance_note: 'valid' } })
    await expect(dispatch(msg)).rejects.toThrow('Schema validation failed')
  })

  it('throws when payload is missing required fields', async () => {
    const msg = makeMessage({ payload: { url: 'https://example.com' } })
    await expect(dispatch(msg)).rejects.toThrow('Schema validation failed')
  })

  it('rejects additional properties in payload', async () => {
    const msg = makeMessage({
      payload: {
        url: 'https://example.com',
        relevance_note: 'valid',
        extra_field: 'not allowed',
      },
    })
    await expect(dispatch(msg)).rejects.toThrow('Schema validation failed')
  })

  it('accepts payload with optional tags', async () => {
    const msg = makeMessage({
      payload: {
        url: 'https://example.com/article',
        relevance_note: 'Relevant',
        tags: ['ai', 'agents'],
      },
    })
    const result = await dispatch(msg)
    expect(result).toBe('handled:msg-001')
  })

  it('validates url maxLength constraint', async () => {
    const msg = makeMessage({
      payload: {
        url: 'https://example.com/' + 'a'.repeat(2000),
        relevance_note: 'valid',
      },
    })
    await expect(dispatch(msg)).rejects.toThrow('Schema validation failed')
  })
})
