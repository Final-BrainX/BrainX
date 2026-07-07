# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app/brainx-next

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_WORKSPACE_API_BASE_URL
ARG NEXT_PUBLIC_COMMERCE_API_BASE_URL
ARG NEXT_PUBLIC_INGESTION_API_BASE_URL
ARG NEXT_PUBLIC_NOTES_USE_MOCK=false
ARG NEXT_PUBLIC_GRAPH_USE_MOCK=false
ARG NEXT_PUBLIC_GRAPH_CLUSTERS_USE_MOCK=false
ARG API_SERVER_URL=http://gateway-service:8088

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WORKSPACE_API_BASE_URL=$NEXT_PUBLIC_WORKSPACE_API_BASE_URL
ENV NEXT_PUBLIC_COMMERCE_API_BASE_URL=$NEXT_PUBLIC_COMMERCE_API_BASE_URL
ENV NEXT_PUBLIC_INGESTION_API_BASE_URL=$NEXT_PUBLIC_INGESTION_API_BASE_URL
ENV NEXT_PUBLIC_NOTES_USE_MOCK=$NEXT_PUBLIC_NOTES_USE_MOCK
ENV NEXT_PUBLIC_GRAPH_USE_MOCK=$NEXT_PUBLIC_GRAPH_USE_MOCK
ENV NEXT_PUBLIC_GRAPH_CLUSTERS_USE_MOCK=$NEXT_PUBLIC_GRAPH_CLUSTERS_USE_MOCK
ENV API_SERVER_URL=$API_SERVER_URL

COPY brainx-next/package.json brainx-next/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY brainx-next/app ./app
COPY brainx-next/components ./components
COPY brainx-next/lib ./lib
COPY brainx-next/scripts ./scripts
COPY brainx-next/public ./public
COPY brainx-next/next.config.mjs brainx-next/postcss.config.js brainx-next/tailwind.config.js brainx-next/tsconfig.json brainx-next/next-env.d.ts ./
COPY ["brainx-electron/release/BrainX Setup 0.1.0.exe", "../brainx-electron/release/BrainX Setup 0.1.0.exe"]
RUN npm run build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/brainx-next ./

EXPOSE 3000
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
