FROM node:22.16.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Until the reviewed lockfile exists this remains npm install. Release Truth keeps that limitation visible.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build:platform

FROM node:22.16.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --no-audit --no-fund --omit=dev \
  && mkdir -p /app/.tmp \
  && chown -R node:node /app/.tmp
COPY --from=build --chown=node:node /app/apps/platform/dist ./apps/platform/dist
COPY --from=build --chown=node:node /app/packages/database/migrations ./packages/database/migrations
COPY --from=build --chown=node:node /app/apps/dashboard/public ./apps/dashboard/public
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/platform/dist/index.js"]
