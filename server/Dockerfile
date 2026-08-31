# syntax=docker/dockerfile:1

FROM node:20-alpine

# Tini gives us correct signal handling for graceful shutdown.
RUN apk add --no-cache tini

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first so the layer caches across code changes.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Run as the unprivileged node user; it must own the writable volumes.
RUN mkdir -p uploads database && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
