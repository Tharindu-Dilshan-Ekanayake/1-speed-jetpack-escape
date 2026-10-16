# Game backend image for Boxity Legion hosting.
# Build from the REPOSITORY ROOT (the server imports ../shared):
#   docker build -f server/Dockerfile -t jetpack-escape-server .

# --- dependencies -----------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- runtime ----------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production
# The game never runs npm/yarn at runtime; dropping them removes their CVEs.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
COPY shared ./shared
COPY server/src ./server/src

# Run as the image's non-root "node" user (uid 1000). Numeric, so Kubernetes'
# runAsNonRoot check can verify it. data/ is only used without MONGODB_URI.
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER 1000
WORKDIR /app/server

# Legion injects PORT (2567); HTTP and WebSocket share it.
EXPOSE 2567
# Exec form: node is PID 1 and receives SIGTERM directly, so rooms can drain.
CMD ["node", "src/index.js"]
