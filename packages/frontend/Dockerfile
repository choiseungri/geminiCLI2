# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy root package.json and package-lock.json (or yarn.lock)
# This is to leverage npm workspaces if frontend depends on any local packages from root or other workspaces.
# If not, just copying packages/frontend/package.json might be enough.
COPY package.json ./
COPY package-lock.json ./
# If you have a yarn.lock or pnpm-lock.yaml, copy that instead of package-lock.json

# Install all dependencies for the monorepo (or at least for the frontend workspace)
RUN npm install --ignore-scripts # --ignore-scripts can speed up if not needed

# Copy frontend package.json to ensure its scripts are available, though dependencies are already installed.
COPY packages/frontend/package.json packages/frontend/
# Copy the rest of the frontend source code
COPY packages/frontend/ packages/frontend/

# Copy root tsconfig.json (if frontend's tsconfig.json extends it)
COPY tsconfig.json .
# Copy vite.config.ts from the frontend package
COPY packages/frontend/vite.config.ts packages/frontend/vite.config.ts


# Set environment variables for the build stage (if any)
# Example: ARG VITE_API_URL
# ENV VITE_API_URL=$VITE_API_URL

# Build the frontend application
# The build command should be run from the workspace directory or use `npm run build -w frontend`
RUN npm run build --workspace=packages/frontend
# Or, if "npm install" was run inside packages/frontend:
# RUN cd packages/frontend && npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:1.25-alpine-slim

# Remove default Nginx server configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
# We'll create nginx.conf next.

# Copy the built static files from the builder stage
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Expose port 80 for Nginx
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
