# Stage 1: bundle the dashboard's WebGL layer (React + R3F + shadergradient) into static/app.js.
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN mkdir -p ../static && npm run build

# Stage 2: the stdlib-only server. No Node at runtime.
FROM python:3.12-alpine
RUN adduser -D -H -u 10001 portmap && mkdir /data && chown portmap /data
WORKDIR /app
COPY server.py ./
COPY static ./static
COPY --from=web /src/static/app.js ./static/app.js
USER portmap
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["python", "-u", "server.py"]
