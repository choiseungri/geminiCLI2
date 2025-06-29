# Stage 1: Build environment
FROM node:18-bullseye AS builder

# Install Python and pip for gemini-cli, and build tools for node-pty
RUN apt-get update && \
    apt-get install -y python3 python3-pip g++ make && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package.json and package-lock.json (or yarn.lock) for installing root devDependencies (typescript, etc.)
# If the root package.json is not needed for the backend build itself, this can be skipped.
# COPY package.json ./
# COPY package-lock.json ./
# RUN npm install --ignore-scripts # Install root devDependencies if any are needed for build

# Copy backend package.json and install dependencies
COPY packages/backend/package.json packages/backend/
RUN cd packages/backend && npm install

# Copy the rest of the backend source code
COPY packages/backend/ packages/backend/

# Copy root tsconfig.json (if backend's tsconfig.json extends it or relies on it)
COPY tsconfig.json .

# Build the backend (compile TypeScript)
RUN cd packages/backend && npm run build

# Stage 2: Production environment
FROM node:18-bullseye-slim

# Install Python and pip for gemini-cli (slim image might not have it)
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    pip install google-gemini-cli && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built backend from builder stage
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules
COPY packages/backend/package.json ./packages/backend/package.json

# Copy .env file - this is NOT recommended for production.
# Environment variables should be injected into the container at runtime.
# This is just for completeness if an .env file is used directly.
# COPY .env .

# Expose port
EXPOSE 3000

# Set default environment variables (can be overridden)
ENV NODE_ENV=production
ENV BACKEND_PORT=3000
# Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set at runtime

CMD ["node", "packages/backend/dist/index.js"]
