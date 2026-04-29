# ── Stage 1: Build React SPA ─────────────────────────────────────────────────
# Uses all deps (including devDeps) so tsc + vite have what they need.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production proxy server ─────────────────────────────────────────
# Lean image — only production deps (express, http-proxy-middleware).
# Bypasses nixpacks and the nix-collect-garbage -d failure entirely.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server.cjs .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.cjs"]