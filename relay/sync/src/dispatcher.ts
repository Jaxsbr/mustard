import { CONTRACT_REGISTRY } from '../../contracts/index.js'
import type { RelayMessage } from '../../contracts/types.js'

export type MessageHandler = (message: RelayMessage) => Promise<string | void>

const handlers = new Map<string, MessageHandler>()

export function registerHandler(type: string, handler: MessageHandler): void {
  handlers.set(type, handler)
}

export async function dispatch(message: RelayMessage): Promise<string | void> {
  const contract = CONTRACT_REGISTRY.get(message.type)
  if (!contract) {
    const known = [...CONTRACT_REGISTRY.keys()].join(', ')
    throw new Error(`Unknown message type: "${message.type}". Known types: ${known}`)
  }

  if (!contract.validate(message.payload)) {
    const errors = JSON.stringify(contract.validate.errors)
    throw new Error(`Schema validation failed for "${message.type}": ${errors}`)
  }

  const handler = handlers.get(message.type)
  if (!handler) {
    throw new Error(`No handler registered for message type: "${message.type}"`)
  }

  return handler(message)
}
