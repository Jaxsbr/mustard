# Relay Infrastructure

Terraform configs for the mustard relay cloud queue. Deploys an API Gateway REST API with SQS direct integration — no Lambda.

## Architecture

```
Client (Android app / curl)
  → POST /message (x-api-key header)
  → API Gateway REST API (API key auth via usage plan)
  → SQS SendMessage (direct integration, no Lambda)
  → SQS Queue (main) ←→ Dead-letter queue (after 3 failed receives)
```

## Prerequisites

1. **AWS CLI** configured with a profile: `aws configure`
2. **Terraform** >= 1.5 installed: `brew install terraform`
3. The AWS profile must have permissions to create API Gateway, SQS, and IAM resources

## Deploy

```bash
cd mustard/relay/infra

terraform init
terraform plan      # review before applying
terraform apply     # type 'yes' to confirm
```

Note the outputs — you need them for the Android app (`local.properties`) and sync daemon (env vars):

```bash
terraform output api_endpoint_url    # POST endpoint for the Android app
terraform output api_key_value       # API key (sensitive — pipe to clipboard)
terraform output sqs_queue_url       # Queue URL for the sync daemon
terraform output sqs_dlq_url         # Dead-letter queue URL
```

## Post-deploy smoke tests

1. **Unauthenticated request → 403:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -X POST "$(terraform output -raw api_endpoint_url)" \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   # Expected: 403
   ```

2. **Authenticated request → 200:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -X POST "$(terraform output -raw api_endpoint_url)" \
     -H "Content-Type: application/json" \
     -H "x-api-key: $(terraform output -raw api_key_value)" \
     -d '{"type":"research-request","version":1,"payload":{"url":"https://example.com","relevance_note":"test"},"metadata":{"id":"test-1","source":"curl","timestamp":"2026-01-01T00:00:00Z"}}'
   # Expected: 200
   ```

3. **DLQ overflow** — send 4+ messages that fail processing. After the sync daemon retries each 3 times, verify messages appear in the DLQ:
   ```bash
   aws sqs get-queue-attributes \
     --queue-url "$(terraform output -raw sqs_dlq_url)" \
     --attribute-names ApproximateNumberOfMessages
   ```

## Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `region` | CLI profile default | AWS region |
| `queue_name` | `mustard-relay` | SQS queue name |
| `api_name` | `mustard-relay-api` | API Gateway name |

## Tear down

```bash
terraform destroy
```

## Design note

REST API v1 is used instead of HTTP API v2 because HTTP API v2 does not support API keys or usage plans. REST API v1 provides native `api_key_required` with SQS direct integration (no Lambda).
