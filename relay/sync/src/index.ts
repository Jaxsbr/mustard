import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'
import { CONTRACT_REGISTRY } from '../../contracts/index.js'
import type { RelayMessage } from '../../contracts/types.js'
import { dispatch, registerHandler } from './dispatcher.js'
import { handleResearchRequest } from './handlers/research-request.js'

// Register all handlers
registerHandler('research-request', handleResearchRequest)

const POLL_INTERVAL = parseInt(process.env.RELAY_POLL_INTERVAL_MS ?? '60000', 10)
const QUEUE_URL = process.env.RELAY_SQS_QUEUE_URL ?? ''
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1'

export interface SyncDaemonOptions {
  sqsClient?: SQSClient
  queueUrl?: string
  pollInterval?: number
}

export async function pollOnce(
  client: SQSClient,
  queueUrl: string,
): Promise<void> {
  let response
  try {
    response = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
      }),
    )
  } catch (err) {
    console.error('[relay-sync] SQS receive error (will retry next poll):', (err as Error).message)
    return
  }

  if (!response.Messages || response.Messages.length === 0) return

  for (const sqsMessage of response.Messages) {
    const receiptHandle = sqsMessage.ReceiptHandle!
    const rawBody = sqsMessage.Body ?? ''

    let message: RelayMessage
    try {
      message = JSON.parse(rawBody)
    } catch {
      console.error('[relay-sync] Malformed JSON — deleting:', rawBody.slice(0, 200))
      await deleteMessage(client, queueUrl, receiptHandle)
      continue
    }

    const contract = CONTRACT_REGISTRY.get(message.type)
    if (!contract) {
      console.error(`[relay-sync] Unknown message type "${message.type}" — deleting`)
      await deleteMessage(client, queueUrl, receiptHandle)
      continue
    }

    if (!contract.validate(message.payload)) {
      console.error(
        `[relay-sync] Schema validation failed for "${message.type}" — deleting:`,
        JSON.stringify(contract.validate.errors),
      )
      await deleteMessage(client, queueUrl, receiptHandle)
      continue
    }

    try {
      const result = await dispatch(message)
      console.log(`[relay-sync] Processed ${message.type} (${message.metadata?.id}): ${result ?? 'ok'}`)
      await deleteMessage(client, queueUrl, receiptHandle)
    } catch (err) {
      console.error(
        `[relay-sync] Handler error for ${message.type} (${message.metadata?.id}) — NOT deleting (will retry):`,
        (err as Error).message,
      )
      // Do NOT delete — message stays in queue for retry, eventually goes to DLQ
    }
  }
}

async function deleteMessage(
  client: SQSClient,
  queueUrl: string,
  receiptHandle: string,
): Promise<void> {
  try {
    await client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    )
  } catch (err) {
    console.error('[relay-sync] Failed to delete message:', (err as Error).message)
  }
}

export function startDaemon(options: SyncDaemonOptions = {}): NodeJS.Timeout {
  const queueUrl = options.queueUrl ?? QUEUE_URL
  const interval = options.pollInterval ?? POLL_INTERVAL
  const client = options.sqsClient ?? new SQSClient({ region: REGION })

  if (!queueUrl) {
    console.error('[relay-sync] RELAY_SQS_QUEUE_URL is required')
    process.exit(1)
  }

  console.log(`[relay-sync] Starting daemon — polling ${queueUrl} every ${interval}ms`)

  // Poll immediately on start, then on interval
  pollOnce(client, queueUrl)
  return setInterval(() => pollOnce(client, queueUrl), interval)
}

// Run as standalone daemon when executed directly
const isMain = process.argv[1] && new URL(process.argv[1], 'file://').href === import.meta.url
if (isMain && QUEUE_URL) {
  startDaemon()
}
