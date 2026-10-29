# Build context: repository root

FROM node:24-alpine AS base
WORKDIR /app/server
COPY server/package*.json ./

# Development: source is bind-mounted, nodemon reloads on change
FROM base AS dev
RUN npm ci
COPY server/ .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm ci
COPY server/ .
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
