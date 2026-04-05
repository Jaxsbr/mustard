# Mustard Relay

End-to-end setup for the mustard relay pipeline: cloud infrastructure, sync daemon, and Android app.

```
Android app (share sheet / manual)
  -> POST /message (x-api-key header)
  -> API Gateway REST API (API key auth)
  -> SQS Queue -> relay-sync daemon (polls every 60s)
  -> handler dispatches by message type
```

## Auth architecture

```
┌─────────────────┐    HTTPS + API key     ┌──────────────┐   IAM role (server-side)   ┌───────────┐
│  Android app /  │ ────────────────────── │ API Gateway  │ ────────────────────────── │   SQS     │
│  curl / script  │   x-api-key header     │  REST API    │   apigw-sqs-role           │   Queue   │
└─────────────────┘                        └──────────────┘                            └─────┬─────┘
                                                                                             │
                                           ┌──────────────┐   relay-reader credentials ┌────┴──────┐
                                           │  relay-sync  │ ◄──────────────────────────  │   SQS     │
                                           │  daemon      │   read + delete only        │   Poll    │
                                           └──────────────┘                             └───────────┘
```

Three distinct auth boundaries:

| Boundary | Mechanism | Credentials | Scope |
|---|---|---|---|
| Client → API Gateway | API key via `x-api-key` header | Terraform output `api_key_value`, stored in `app/local.properties` | POST /message only. Rate-limited by usage plan. No AWS credentials involved. |
| API Gateway → SQS | IAM role (managed by Terraform) | Assumed automatically by API Gateway at runtime | Write to the relay queue only. Clients never see or use this role. |
| Sync daemon → SQS | IAM user `mustard-relay-reader` | Explicit credentials set in the launchd plist env vars | Read and delete from relay queue and DLQ only. Cannot write, create, or manage any other resources. |

Key implications:

- **The Android app has no AWS credentials.** It authenticates to API Gateway with an API key over HTTPS. The API key is not an IAM credential — it cannot call AWS APIs directly.
- **The API Gateway → SQS hop is server-side.** The IAM role is assumed by API Gateway itself, invisible to clients.
- **The sync daemon uses dedicated, least-privilege credentials.** It can only consume messages — it cannot send messages, modify queues, or access any other AWS service.
- **The operator (`mustard-admin`) is used only for infrastructure management** — running `terraform apply/destroy` and retrieving outputs. It is never embedded in running services.

### IAM identity inventory

All identities are managed in `infra/main.tf`. This is the complete list — if you see an identity not listed here, investigate.

| Identity | Type | Purpose | Permissions | Where credentials live |
|---|---|---|---|---|
| `mustard-admin` | IAM user (manual) | Infrastructure operator. Runs Terraform, retrieves outputs, manages the AWS account. | Broad (admin-level). Not managed by Terraform — exists outside this repo. | `~/.aws/credentials` (default profile) |
| `mustard-relay-reader` | IAM user (Terraform) | Sync daemon queue consumer. Created by `terraform apply`. | Read and delete on relay queue + DLQ only. Nothing else. | Launchd plist env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) |
| API Gateway SQS role | IAM role (Terraform) | Allows API Gateway to write messages into SQS. No human or app uses this directly. | Write to relay queue only. | Assumed by AWS automatically — no stored credentials. |

**Rotation:** To rotate `mustard-relay-reader` credentials, run `terraform taint aws_iam_access_key.relay_reader && terraform apply`, then update the launchd plist with the new values and reload the daemon.

## Prerequisites

- **Terraform** >= 1.5: `brew install terraform`
- **AWS CLI** configured: `aws configure`
- **Docker** running (for Android builds)
- **adb**: `brew install android-platform-tools`

## 1. Deploy cloud infrastructure

```bash
cd mustard/relay/infra

terraform init
terraform plan
terraform apply    # type 'yes' to confirm
```

Note the outputs:

```bash
terraform output api_endpoint_url              # POST endpoint for the Android app
terraform output api_key_value                 # API key (sensitive)
terraform output sqs_queue_url                 # Queue URL for the sync daemon
terraform output sqs_dlq_url                   # Dead-letter queue URL
terraform output relay_reader_access_key_id    # Sync daemon AWS access key ID
terraform output relay_reader_secret_access_key # Sync daemon AWS secret (sensitive)
```

This creates: API Gateway REST API, SQS queue + dead-letter queue, IAM roles/users for each component, API key + usage plan. See [IAM identity inventory](#iam-identity-inventory) for the full list. All within AWS free tier at low usage.

See `infra/README.md` for variables, smoke tests, and teardown.

## 2. Start the sync daemon

The sync daemon polls SQS and dispatches messages to handlers.

### Build the sync (if not already built)

```bash
cd mustard/relay
npm install
npm run build
```

### Configure, install, and start

Run the interactive configuration script:

```bash
bash sync/configure-daemon.sh
```

The script prompts for each setting one by one. If the daemon is already installed, it shows the current value (secrets are masked) and uses it as the default — just press Enter to keep it. It then stops any running instance, installs the plist, starts the daemon, and tails the log so you can confirm it's working.

You'll need these Terraform outputs for the prompts:

| Prompt | Source |
|---|---|
| `RELAY_SQS_QUEUE_URL` | `terraform output sqs_queue_url` |
| `AWS_REGION` | The region you deployed to (e.g. `ap-southeast-2`) |
| `AWS_ACCESS_KEY_ID` | `terraform output relay_reader_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | `terraform output -raw relay_reader_secret_access_key` |

These are the `mustard-relay-reader` credentials (see [IAM identity inventory](#iam-identity-inventory)). Do not use `mustard-admin` or any other broad-access credentials here.

### Stop / restart

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.mustard.relay-sync.plist

# Reconfigure and restart
bash sync/configure-daemon.sh
```

## 3. Build the Android app

### Create local.properties

Create `app/local.properties` with the Terraform outputs (this file is gitignored):

```properties
relay.api.endpoint=<terraform output api_endpoint_url>
relay.api.key=<terraform output api_key_value>
```

### Build the APK

```bash
cd mustard/relay/app
bash build.sh
```

This uses Docker with the `thyrlian/android-sdk` image. The output APK is at:

```
app/build/outputs/apk/debug/app-debug.apk
```

## 4. Install on your Android phone

### One-time phone setup

1. **Enable Developer Mode:** Settings > About Phone > tap **Build number** 7 times
2. **Enable USB Debugging:** Settings > Developer Options > toggle **USB Debugging** on

### Install via USB

1. Plug your phone into your Mac via USB cable
2. Tap **Allow** on the "Allow USB debugging?" prompt (check "Always allow from this computer")
3. Verify the connection:
   ```bash
   adb devices
   ```
4. Install:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```
5. The app appears in your app drawer. You can unplug the cable — the app runs independently.

### Update an existing install

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Set up wireless ADB (optional, avoids cable for future installs)

While still connected via USB:

```bash
adb tcpip 5555
adb connect <phone-ip>:5555
```

Find your phone's IP: Settings > Wi-Fi > tap your network > IP address.

Now unplug. Future installs work wirelessly:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The wireless connection persists until the phone restarts. To reconnect: `adb connect <phone-ip>:5555`.

### Uninstall

```bash
adb uninstall com.mustard.relay
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `no devices/emulators found` | Check USB cable, re-toggle USB Debugging, tap Allow on phone |
| `INSTALL_FAILED_ALREADY_EXISTS` | Use `adb install -r` to replace |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Uninstall first: `adb uninstall com.mustard.relay` |
| Phone not showing trust prompt | Try a different USB cable (some are charge-only) |
| Sync daemon exit code 78 | Check node path in plist — run `which node` to find correct path |
| Sync logs empty | Check `/tmp/mustard-relay-sync.err` for errors |
| Docker build fails with platform warning | Expected on Apple Silicon — runs under Rosetta, builds still work |
