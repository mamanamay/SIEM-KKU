# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependency-base
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./

FROM dependency-base AS build
RUN --mount=type=cache,id=siem-v2-backend-npm,target=/root/.npm,sharing=locked \
    npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=info --fetch-retries=1 --fetch-timeout=30000 \
    && node -e "require('sqlite3')"
COPY . .
RUN npm run build

# Install only runtime packages; this layer depends on manifests, not source.
FROM dependency-base AS production-deps
RUN --mount=type=cache,id=siem-v2-backend-npm,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund --loglevel=info --fetch-retries=1 --fetch-timeout=30000 \
    && node -e "for (const name of ['sqlite3', 'pg', 'puppeteer', 'pdf-lib', '@nestjs/core', 'typeorm']) require(name); console.log('Runtime dependencies: OK')"

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends chromium-sandbox && rm -rf /var/lib/apt/lists/*
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config
COPY --from=build /app/package*.json ./
RUN mkdir -p siem-logs uploads/reports && chown -R node:node siem-logs uploads
USER node
EXPOSE 5000
CMD ["sh", "-c", "node config/check-extra-ca.cjs && npm run migration:run && npm run start:prod"]
