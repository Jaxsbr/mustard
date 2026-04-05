#!/usr/bin/env bash
set -euo pipefail

LABEL="com.mustard.relay-sync"
PLIST_NAME="${LABEL}.plist"
INSTALLED="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_FILE="/tmp/mustard-relay-sync.log"
ERR_FILE="/tmp/mustard-relay-sync.err"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------- helpers ----------

mask() {
  local val="$1"
  if [[ ${#val} -le 5 ]]; then
    printf '%s' "•••••"
  else
    printf '%s' "•••••${val: -5}"
  fi
}

plist_env() {
  [[ -f "$INSTALLED" ]] && /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:$1" "$INSTALLED" 2>/dev/null || true
}

plist_arg() {
  [[ -f "$INSTALLED" ]] && /usr/libexec/PlistBuddy -c "Print :ProgramArguments:$1" "$INSTALLED" 2>/dev/null || true
}

is_placeholder() {
  [[ -z "$1" || "$1" == YOUR_* || "$1" == "/path/to/"* ]]
}

REPLY_VALUE=""
prompt() {
  local label="$1"
  local current="$2"
  local secret="${3:-false}"
  REPLY_VALUE=""

  if is_placeholder "$current"; then
    printf "  %s: " "$label" > /dev/tty
  else
    local display="$current"
    if [[ "$secret" == "true" ]]; then
      display="$(mask "$current")"
    fi
    printf "  %s [%s]: " "$label" "$display" > /dev/tty
  fi

  read -r REPLY_VALUE < /dev/tty

  if [[ -z "$REPLY_VALUE" ]] && ! is_placeholder "$current"; then
    REPLY_VALUE="$current"
  fi
}

require() {
  if [[ -z "$REPLY_VALUE" ]]; then
    echo "Error: $1 is required." >&2
    exit 1
  fi
}

# ---------- gather values ----------

echo ""
echo "=== Mustard Relay Sync Daemon — Configure ==="
echo ""

NODE_DEFAULT="$(plist_arg 0)"
if is_placeholder "$NODE_DEFAULT"; then NODE_DEFAULT="$(which node 2>/dev/null || echo "")"; fi
prompt "Node path" "$NODE_DEFAULT"
require "Node path"
NODE_PATH="$REPLY_VALUE"

SCRIPT_DEFAULT="$(plist_arg 1)"
if is_placeholder "$SCRIPT_DEFAULT"; then
  SCRIPT_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)/dist/sync/src/index.js"
fi
prompt "Script path" "$SCRIPT_DEFAULT"
require "Script path"
SCRIPT_PATH="$REPLY_VALUE"

echo ""
echo "Environment variables:"

QUEUE_DEFAULT="$(plist_env RELAY_SQS_QUEUE_URL)"
if is_placeholder "$QUEUE_DEFAULT"; then
  QUEUE_DEFAULT="$(cd "$SCRIPT_DIR/../infra" && terraform output -raw sqs_queue_url 2>/dev/null || echo "")"
fi
prompt "RELAY_SQS_QUEUE_URL" "$QUEUE_DEFAULT"
require "RELAY_SQS_QUEUE_URL"
QUEUE_URL="$REPLY_VALUE"

REGION_DEFAULT="$(plist_env AWS_REGION)"
if is_placeholder "$REGION_DEFAULT"; then
  REGION_DEFAULT="$(aws configure get region 2>/dev/null || echo "")"
fi
prompt "AWS_REGION" "$REGION_DEFAULT"
require "AWS_REGION"
AWS_REGION_VAL="$REPLY_VALUE"

prompt "AWS_ACCESS_KEY_ID" "$(plist_env AWS_ACCESS_KEY_ID)" true
require "AWS_ACCESS_KEY_ID"
ACCESS_KEY="$REPLY_VALUE"

prompt "AWS_SECRET_ACCESS_KEY" "$(plist_env AWS_SECRET_ACCESS_KEY)" true
require "AWS_SECRET_ACCESS_KEY"
SECRET_KEY="$REPLY_VALUE"

POLL_DEFAULT="$(plist_env RELAY_POLL_INTERVAL_MS)"
prompt "RELAY_POLL_INTERVAL_MS" "${POLL_DEFAULT:-60000}"
POLL_INTERVAL="${REPLY_VALUE:-60000}"

# ---------- generate plist ----------

PLIST_CONTENT=$(cat <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${SCRIPT_PATH}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RELAY_SQS_QUEUE_URL</key>
    <string>${QUEUE_URL}</string>
    <key>AWS_REGION</key>
    <string>${AWS_REGION_VAL}</string>
    <key>AWS_ACCESS_KEY_ID</key>
    <string>${ACCESS_KEY}</string>
    <key>AWS_SECRET_ACCESS_KEY</key>
    <string>${SECRET_KEY}</string>
    <key>RELAY_POLL_INTERVAL_MS</key>
    <string>${POLL_INTERVAL}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_FILE}</string>
</dict>
</plist>
PLISTEOF
)

# ---------- install ----------

echo ""
echo "Installing daemon..."

if launchctl list "$LABEL" &>/dev/null; then
  echo "  Stopping existing daemon..."
  launchctl unload "$INSTALLED" 2>/dev/null || true
fi

: > "$LOG_FILE"
: > "$ERR_FILE"

echo "$PLIST_CONTENT" > "$INSTALLED"
launchctl load "$INSTALLED"
echo "  Daemon loaded."

# ---------- verify ----------

echo ""
echo "Waiting for first poll..."
sleep 4

ERRORS="$(cat "$ERR_FILE" 2>/dev/null)"
if [[ -n "$ERRORS" ]]; then
  echo "  ✗ Errors detected:"
  echo "$ERRORS" | head -5 | sed 's/^/    /'
  echo ""
  echo "  Fix the issue and re-run this script."
  exit 1
fi

if ! launchctl list "$LABEL" &>/dev/null; then
  echo "  ✗ Daemon failed to start."
  exit 1
fi

FIRST_LOG="$(cat "$LOG_FILE" 2>/dev/null)"
if [[ -z "$FIRST_LOG" ]]; then
  echo "  ⚠ Daemon is running but no log output yet."
else
  echo "  ✓ Daemon is running:"
  echo "$FIRST_LOG" | head -5 | sed 's/^/    /'
fi

echo ""
echo "Tailing log (Ctrl-C to stop):"
echo "---"
tail -f "$LOG_FILE"
