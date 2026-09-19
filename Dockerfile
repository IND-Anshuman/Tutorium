# ---- build stage ----
FROM node:22-slim AS builder
# curl: Speechmatics transport execFile("curl") runs at RUNTIME too, so installed in final stage;
# python3/make/g++: better-sqlite3 native build (builder only)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 && npm config set fetch-retry-maxtimeout 90000 && npm config set fetch-timeout 600000 \
    && npm ci --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No keys at build: prerendering never calls providers; real keys injected at runtime
# via Cloud Run secrets. Health reports llmKey:false in a cold container — correct.
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runner
# curl is a RUNTIME dependency (Speechmatics batch STT shells out to it)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# standalone output: server.js + traced minimal node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# data dir for SQLite (ephemeral by design; mount a volume to persist)
RUN mkdir -p /data && chown nextjs:nodejs /data
ENV TUTORIUM_DATA_DIR=/data
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
