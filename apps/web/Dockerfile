# Image of the web app, built from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api.railway.internal:4000 .
# The API address is read when the app is built (rewrites of next.config.ts), hence the build
# argument (D-106).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
ARG API_INTERNAL_URL=http://127.0.0.1:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter "@veris/web..." \
  && pnpm --filter @veris/shared build \
  && NODE_ENV=production pnpm --filter @veris/web build

FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
EXPOSE 3000
# Railway gives the port to listen on in PORT.
CMD ["sh", "-c", "exec node_modules/.bin/next start --port ${PORT:-3000}"]
