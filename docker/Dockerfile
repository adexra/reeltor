# ─────────────────────────────────────────────────────────────────────────────
# Reelator Render Server
# Target: Azure Container Apps (Linux/amd64)
#
# Build (from repo root — gives ACR access to schema.ts and skills/):
#   az acr build --registry reelatorreg8899 \
#     --image reelator-render-server:latest \
#     --file docker/Dockerfile .
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Install dependencies
FROM node:18-bullseye-slim AS deps

WORKDIR /app

# Install Chromium + all system libs required by @remotion/renderer + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    ffmpeg \
    ca-certificates \
    wget \
  && rm -rf /var/lib/apt/lists/*

COPY docker/package.json ./

RUN npm install --omit=dev --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:18-bullseye-slim AS runtime

# Install runtime system libs (same set — no dev headers needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    ffmpeg \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Non-root user for Azure Container Apps security policy
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

WORKDIR /app

# node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Server entrypoint
COPY docker/server.js ./

# Remotion composition source (skills/ from repo root)
# Placed at /app/skills so the relative import from server.js resolves correctly
COPY docker/skills/ ./skills/

# schema.ts lives at repo root — server.js and the composition both import it
COPY schema.ts ./schema.ts

# Port
EXPOSE 3001

# Tmp dir for render artefacts — writable by appuser
RUN mkdir -p /tmp/remotion && chown appuser:appgroup /tmp/remotion

USER appuser

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
