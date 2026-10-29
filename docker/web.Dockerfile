# Build context: repository root

FROM node:24-alpine AS base
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .

# Development: Vite dev server, source is bind-mounted
FROM base AS dev
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm run build

# Production: Caddy serves the built client and proxies /api to the server, over plain HTTP
# behind the HTTPS front proxy on the VM (see docs/deploy.md)
FROM caddy:2.10-alpine AS prod
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
