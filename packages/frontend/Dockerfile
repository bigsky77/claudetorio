FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js inlines NEXT_PUBLIC_* env vars at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STREAM_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STREAM_URL=$NEXT_PUBLIC_STREAM_URL
ARG NEXT_PUBLIC_TWITCH_CHANNEL
ARG NEXT_PUBLIC_TWITCH_EMBED_PARENT
ENV NEXT_PUBLIC_TWITCH_CHANNEL=$NEXT_PUBLIC_TWITCH_CHANNEL
ENV NEXT_PUBLIC_TWITCH_EMBED_PARENT=$NEXT_PUBLIC_TWITCH_EMBED_PARENT
ARG NEXT_PUBLIC_DASHBOARD_PUBLIC_CONTROL
ENV NEXT_PUBLIC_DASHBOARD_PUBLIC_CONTROL=$NEXT_PUBLIC_DASHBOARD_PUBLIC_CONTROL

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
