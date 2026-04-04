#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building Mustard Relay APK with Docker..."

# Generate Gradle wrapper if missing
if [ ! -f gradlew ]; then
  echo "Generating Gradle wrapper..."
  docker run --rm -v "$SCRIPT_DIR":/project -w /project \
    mobiledevops/android-sdk-image:latest \
    gradle wrapper --gradle-version 8.9
fi

# Build debug APK
docker run --rm -v "$SCRIPT_DIR":/project -w /project \
  mobiledevops/android-sdk-image:latest \
  ./gradlew assembleDebug

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
  echo ""
  echo "Build successful!"
  echo "APK: $SCRIPT_DIR/$APK_PATH"
  echo ""
  echo "Install: adb install $APK_PATH"
else
  echo "Build failed — APK not found at $APK_PATH"
  exit 1
fi
