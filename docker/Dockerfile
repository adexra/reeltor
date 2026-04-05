# ─────────────────────────────────────────────────────────────────────────────
# Reelator Render Server
# Target: Azure Container Apps (Linux/amd64)
#
# Build:
#   docker build -t reelator-render .
# Run locally:
#   docker run --env-file .env -p 3001:3001 reelator-render
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Dependency installer
# Use the official Remotion base image — it ships with Chrome, FFmpeg, and all
# system libs that @remotion/renderer needs. Saves ~2 GB of apt installs.
FROM ghcr.io/remotion-dev/base:latest AS deps

WORKDIR /app

# Copy only package manifests first so Docker layer-caches npm install
COPY package.json ./

# Install production deps only
RUN npm install --omit=dev --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM ghcr.io/remotion-dev/base:latest AS runtime

# Non-root user for Azure Container Apps security policy
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

WORKDIR /app

# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy server source
COPY server.js ./

# Copy the Remotion composition source from the Next.js project.
# The server bundles this at first-request time.
# We keep it at the same relative path the server expects:
#   /app/../skills/dynamic-video-editor  →  /skills/dynamic-video-editor
COPY --from=build-context . /skills

# Copy schema — the composition imports from it
COPY ../schema.ts /schema.ts

# Port
EXPOSE 3001

# Tmp dir for render artefacts — writable by appuser
RUN mkdir -p /tmp/remotion && chown appuser:appgroup /tmp/remotion

USER appuser

# Health check — Azure Container Apps polls this to determine readiness
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
