ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile --prod=false

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/ apps/api/
COPY packages/shared-types/ packages/shared-types/
RUN pnpm --filter @idp/api exec prisma generate
RUN pnpm --filter @idp/api build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 idp
COPY --from=builder --chown=idp:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=idp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=idp:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=idp:nodejs /app/apps/api/package.json ./
USER idp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
CMD ["node", "dist/index.js"]
