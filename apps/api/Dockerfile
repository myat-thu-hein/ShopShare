# Build context: repository root.  docker build -f apps/api/Dockerfile .
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@shopsense/api..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @shopsense/shared build && pnpm --filter @shopsense/api build

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
WORKDIR /app/apps/api
# Apply migrations, seed demo data on an empty database, then start.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts --if-empty && node dist/main.js"]
