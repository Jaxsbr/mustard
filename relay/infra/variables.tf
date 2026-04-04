variable "region" {
  description = "AWS region. Defaults to CLI profile region if omitted."
  type        = string
  default     = null
}

variable "queue_name" {
  description = "Name for the SQS relay queue"
  type        = string
  default     = "mustard-relay"
}

variable "api_name" {
  description = "Name for the API Gateway REST API"
  type        = string
  default     = "mustard-relay-api"
}
