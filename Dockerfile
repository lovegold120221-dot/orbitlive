# Orbit Meeting (LiveKit) web app for test.abitech.site.
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are baked at build time.
ARG NEXT_PUBLIC_CONN_DETAILS_ENDPOINT=/api/connection-details
ARG NEXT_PUBLIC_ORBIT_TRANSLATOR_WS=wss://test.abitech.site/orbit-translator/
ENV NEXT_PUBLIC_CONN_DETAILS_ENDPOINT=$NEXT_PUBLIC_CONN_DETAILS_ENDPOINT
ENV NEXT_PUBLIC_ORBIT_TRANSLATOR_WS=$NEXT_PUBLIC_ORBIT_TRANSLATOR_WS
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Bind all interfaces *inside* the container; public exposure is restricted by
# the loopback-only ports mapping (127.0.0.1:3000). Binding container-loopback
# here would refuse docker-proxy connections (connection reset).
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
