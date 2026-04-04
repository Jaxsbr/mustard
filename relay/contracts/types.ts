export interface RelayMessageMetadata {
  id: string
  source: string
  timestamp: string
}

export interface RelayMessage<T = unknown> {
  type: string
  version: number
  payload: T
  metadata: RelayMessageMetadata
}
