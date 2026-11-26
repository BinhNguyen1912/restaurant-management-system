# syntax=docker/dockerfile:1

# ---------- deps: cài đủ dev deps để build ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV TZ=Asia/Ho_Chi_Minh
# openssl cần cho Prisma engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build: prisma generate + nest build (biên dịch cả src/scripts) ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV TZ=Asia/Ho_Chi_Minh
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---------- runner: chỉ prod deps + dist + prisma ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Node đọc TZ MỘT LẦN lúc khởi động -> phải có ở tầng container, không chỉ trong code
ENV TZ=Asia/Ho_Chi_Minh
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

# `prisma` là dependencies (không phải dev) nên `migrate deploy` chạy được trong image này
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Prisma client đã generate nằm trong node_modules của build stage
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# chạy bằng user không phải root
RUN chown -R node:node /app
USER node

EXPOSE 4000
# /health có sẵn trong HealthModule
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:4000/health || exit 1

# KHÔNG chạy migrate/seed ở đây: xem docs/deploy.md (bước một lần mỗi deploy)
CMD ["node", "dist/main"]
