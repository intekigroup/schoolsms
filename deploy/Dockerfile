# Shule SMS — production image.
# Full (non-standalone) Next.js build so `prisma migrate deploy`, the seed and the
# backup scripts all work inside the container with the same node_modules.
FROM node:22-bookworm-slim AS build
# No NODE_ENV here: a non-standard value at build time makes Next load mismatched React
# builds and the /_global-error prerender dies with "Cannot read properties of null (useContext)".
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false --network-timeout 600000
COPY . .
# Prisma client is generated from the schema; the build never opens a database connection
# (every data page is force-dynamic), so a placeholder URL is enough here.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && yarn build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /app/backups && chown -R node:node /app
USER node
EXPOSE 3000
# Apply pending migrations on every start, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && yarn start -p 3000"]
