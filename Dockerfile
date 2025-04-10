FROM node:22-alpine AS base

RUN apk add --no-cache python3 

FROM base AS builder
WORKDIR /app

COPY .npmrc ./
COPY package*.json ./
RUN npm ci --verbose --cache ./cache && \
  rm -rf ./cache

COPY . .
RUN npm run build

FROM base
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY .npmrc ./
COPY package*.json ./
RUN npm ci --omit=dev --cache ./cache && \
  rm -rf ./cache

COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]


