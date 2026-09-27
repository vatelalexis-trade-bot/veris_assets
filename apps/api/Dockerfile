# Image of the API (and of its database and backup commands), built from the repository root:
#   docker build -f apps/api/Dockerfile .
# Development dependencies are kept: the pre-deploy command (pnpm db:setup) and the backup job
# run the TypeScript scripts of apps/api/scripts with tsx (D-106).
FROM node:24-alpine
# pg_dump and pg_restore of the same major version as the database (backups, D-102).
RUN apk add --no-cache postgresql18-client && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@veris/api..." \
  && pnpm --filter @veris/shared build \
  && pnpm --filter @veris/api build
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
