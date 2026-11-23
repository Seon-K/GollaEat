FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_KAKAO_MAP_APP_KEY
ENV VITE_KAKAO_MAP_APP_KEY=${VITE_KAKAO_MAP_APP_KEY}
RUN npm run build

FROM caddy:2-alpine
WORKDIR /app
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /app/dist
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
