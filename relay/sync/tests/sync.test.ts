import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pollOnce } from '../src/index.js'
import { registerHandler } from '../src/dispatcher.js'
import type { SQSClient } from '@aws-sdk/client-sqs'

function makeSqsMessage(body: string, receiptHandle = 'receipt-1') {
  return { Body: body, ReceiptHandle: receiptHandle, MessageId: 'msg-1' }
}

function makeRelayJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
  })
}

function mockSqsClient(messages: Array<{ Body: string; ReceiptHandle: string; MessageId: string }>) {
  const deletedReceipts: string[] = []
  const client = {
    send: vi.fn(async (command: { constructor: { name: string }; input?: Record<string, unknown> }) => {
      if (command.constructor.name === 'ReceiveMessageCommand') {
        // Return messages once, then empty
        const result = { Messages: messages.length > 0 ? [...messages] : undefined }
        messages.length = 0
        return result
      }
      if (command.constructor.name === 'DeleteMessageCommand') {
        deletedReceipts.push((command.input as Record<string, string>).ReceiptHandle)
        return {}
      }
      return {}
    }),
  } as unknown as SQSClient
  return { client, deletedReceipts }
}

describe('sync daemon', () => {
  let handledMessages: string[]

  beforeEach(() => {
    handledMessages = []
    registerHandler('research-request', async (msg) => {
      handledMessages.push(msg.metadata.id)
      return `handled:${msg.metadata.id}`
    })
  })

  it('processes a valid message end-to-end through dispatcher to handler', async () => {
    const msg = makeSqsMessage(makeRelayJson())
    const { client, deletedReceipts } = mockSqsClient([msg])

    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(handledMessages).toEqual(['msg-001'])
    expect(deletedReceipts).toEqual(['receipt-1'])
  })

  it('deletes malformed JSON and continues', async () => {
    const bad = makeSqsMessage('not-json{{{', 'receipt-bad')
    const good = makeSqsMessage(makeRelayJson(), 'receipt-good')
    const { client, deletedReceipts } = mockSqsClient([bad, good])

    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(deletedReceipts).toContain('receipt-bad')
    expect(deletedReceipts).toContain('receipt-good')
    expect(handledMessages).toEqual(['msg-001'])
  })

  it('deletes messages with unknown type', async () => {
    const msg = makeSqsMessage(makeRelayJson({ type: 'unknown-type' }), 'receipt-unknown')
    const { client, deletedReceipts } = mockSqsClient([msg])

    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(deletedReceipts).toEqual(['receipt-unknown'])
    expect(handledMessages).toEqual([])
  })

  it('deletes messages that fail schema validation', async () => {
    const msg = makeSqsMessage(
      makeRelayJson({ payload: { url: '' } }),
      'receipt-invalid',
    )
    const { client, deletedReceipts } = mockSqsClient([msg])

    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(deletedReceipts).toEqual(['receipt-invalid'])
    expect(handledMessages).toEqual([])
  })

  it('does NOT delete messages when handler throws (retry to DLQ)', async () => {
    registerHandler('research-request', async () => {
      throw new Error('handler failed')
    })

    const msg = makeSqsMessage(makeRelayJson(), 'receipt-handler-fail')
    const { client, deletedReceipts } = mockSqsClient([msg])

    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(deletedReceipts).toEqual([])
  })

  it('continues polling when SQS returns no messages', async () => {
    const { client } = mockSqsClient([])

    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(handledMessages).toEqual([])
  })

  it('logs and continues when SQS is unreachable', async () => {
    const client = {
      send: vi.fn(async () => {
        throw new Error('Network error')
      }),
    } as unknown as SQSClient

    // Should not throw
    await pollOnce(client, 'https://sqs.us-east-1.amazonaws.com/123/test-queue')

    expect(handledMessages).toEqual([])
  })
})
