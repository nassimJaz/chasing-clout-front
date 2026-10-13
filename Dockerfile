# The front built for production and served by nginx, used by the API repo's docker-compose.demo.yml.
FROM node:20-slim AS build
WORKDIR /app
ENV NG_CLI_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/front-skeleton /usr/share/nginx/html
