output "api_endpoint_url" {
  description = "POST endpoint URL for relay messages"
  value       = "${aws_api_gateway_stage.prod.invoke_url}/message"
}

output "api_key_value" {
  description = "API key for authenticating POST requests"
  value       = aws_api_gateway_api_key.main.value
  sensitive   = true
}

output "sqs_queue_url" {
  description = "SQS queue URL for the sync daemon"
  value       = aws_sqs_queue.main.id
}

output "sqs_dlq_url" {
  description = "SQS dead-letter queue URL"
  value       = aws_sqs_queue.dlq.id
}
