#!/bin/bash
echo "🎬 Reels Generator — Environment Check"
echo "======================================="

PASS=true

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 18 ] 2>/dev/null; then
  echo "✅ Node.js $(node -v)"
else
  echo "❌ Node.js 18+ required. Found: $(node -v 2>/dev/null || echo 'not installed')"
  PASS=false
fi

# Check FFmpeg (bundled via @ffmpeg-installer/ffmpeg — no system install needed)
if [ -d "node_modules/@ffmpeg-installer/ffmpeg" ]; then
  echo "✅ FFmpeg (bundled via @ffmpeg-installer/ffmpeg)"
else
  echo "❌ @ffmpeg-installer/ffmpeg not found. Run: npm install"
  PASS=false
fi

# Check .env file
if [ -f ".env" ]; then
  echo "✅ .env file found"
else
  echo "❌ .env file missing. Copy .env.example and fill in your keys."
  PASS=false
fi

# Check required env vars
source .env 2>/dev/null
for VAR in AZURE_OPENAI_KEY AZURE_OPENAI_ENDPOINT AZURE_OPENAI_DEPLOYMENT; do
  if [ -n "${!VAR}" ]; then
    echo "✅ $VAR is set"
  else
    echo "❌ $VAR is missing from .env"
    PASS=false
  fi
done

# Check fonts
FONTS_DIR="assets/fonts"
mkdir -p "$FONTS_DIR"
for FONT in "BebasNeue-Regular.ttf" "DMSans-Regular.ttf"; do
  if [ -f "$FONTS_DIR/$FONT" ]; then
    echo "✅ Font: $FONT"
  else
    echo "❌ Font missing: $FONTS_DIR/$FONT"
    echo "   Download from Google Fonts and place in /assets/fonts/"
    PASS=false
  fi
done

# Create required directories
mkdir -p output heres_whats_up
touch heres_whats_up/updates.log heres_whats_up/errors.log
echo "✅ Directories: /output and /heres_whats_up created"

echo ""
if [ "$PASS" = true ]; then
  echo "🚀 All checks passed. Run: npm run dev"
else
  echo "🛑 Fix the issues above before starting."
  exit 1
fi
