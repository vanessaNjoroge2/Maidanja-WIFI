# Stage 1: Build & Dependency Installation
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Stage 2: Final Light-weight Runtime Image
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy node_modules from builder and source code
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run container as a non-privileged system user for security
USER node

CMD ["node", "backend/server.js"]
