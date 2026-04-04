import AjvModule, { type ValidateFunction } from 'ajv'

const Ajv = AjvModule.default ?? AjvModule
import researchRequestSchema from './research-request.schema.json' with { type: 'json' }

export type { RelayMessage, RelayMessageMetadata } from './types.js'
export type { ResearchRequestPayload } from './research-request.js'

const ajv = new Ajv()

export interface ContractEntry {
  schema: object
  validate: ValidateFunction
}

export const CONTRACT_REGISTRY: Map<string, ContractEntry> = new Map([
  ['research-request', {
    schema: researchRequestSchema,
    validate: ajv.compile(researchRequestSchema),
  }],
])
