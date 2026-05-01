FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# Copy source code (includes src/config)
COPY src ./src

# Create necessary directories
RUN mkdir -p uploads logs

# Build TypeScript
RUN npm run build

# Copy config files (JSON) and SQL schema to dist
RUN cp -r src/config dist/config && cp src/database/schema.sql dist/database/

# Remove dev dependencies
RUN npm prune --production

# Expose port
EXPOSE 3000

# Start server (runs migration on startup)
CMD ["npm", "start"]

