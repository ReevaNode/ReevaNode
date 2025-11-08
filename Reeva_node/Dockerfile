# syntax=docker/dockerfile:1.7-labs

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
FROM base AS src
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run as non-root for security
USER node
ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]

