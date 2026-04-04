# Mustard Relay

End-to-end setup for the mustard relay pipeline: cloud infrastructure, sync daemon, and Android app.

```
Android app (share sheet / manual)
  -> POST /message (x-api-key header)
  -> API Gateway REST API (API key auth)
  -> SQS Queue -> relay-sync daemon (polls every 60s)
  -> handler dispatches by message type
```

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
terraform output api_endpoint_url    # POST endpoint for the Android app
terraform output api_key_value       # API key (sensitive)
terraform output sqs_queue_url       # Queue URL for the sync daemon
terraform output sqs_dlq_url         # Dead-letter queue URL
```

This creates: API Gateway REST API, SQS queue + dead-letter queue, IAM role for the integration, API key + usage plan. All within AWS free tier at low usage.

See `infra/README.md` for variables, smoke tests, and teardown.

## 2. Start the sync daemon

The sync daemon polls SQS and dispatches messages to handlers.

### Configure the launchd plist

Edit `sync/com.mustard.relay-sync.plist` and set:

- **Node path** — find yours with `which node` (e.g. `/opt/homebrew/bin/node`)
- **Script path** — absolute path to `mustard/relay/dist/sync/src/index.js`
- **RELAY_SQS_QUEUE_URL** — from `terraform output sqs_queue_url`
- **AWS_REGION** — the region you deployed to (e.g. `ap-southeast-2`)

AWS credentials are picked up automatically from `~/.aws/credentials` (default profile).

### Build the sync (if not already built)

```bash
cd mustard/relay
npm install
npm run build
```

### Install and start

```bash
cp sync/com.mustard.relay-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mustard.relay-sync.plist
```

### Verify

```bash
launchctl list | grep mustard
tail -f /tmp/mustard-relay-sync.log
```

You should see: `[relay-sync] Starting daemon — polling <queue-url> every 60000ms`

### Stop / restart

```bash
launchctl unload ~/Library/LaunchAgents/com.mustard.relay-sync.plist
# edit plist if needed, then re-copy and load
launchctl load ~/Library/LaunchAgents/com.mustard.relay-sync.plist
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
