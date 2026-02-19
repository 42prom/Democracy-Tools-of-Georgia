# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for build
COPY package*.json ./
# Clean install including devDependencies for build
RUN npm ci

# Copy source
COPY . .

# Build TypeScript to dist
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy migrations to expected location (relative to compiled migrate.js)
# migrate.js is in dist/src/db, looks for ../../db/migrations -> dist/db/migrations
COPY --from=builder /app/db/migrations ./dist/db/migrations

# Create non-root user (if not exists, node image usually has it)
# We use the default 'node' user
USER node

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "dist/src/index.js"]
