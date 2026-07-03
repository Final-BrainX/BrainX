# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY next.config.mjs tsconfig.json ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=build /app ./

EXPOSE 3001
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3001"]
