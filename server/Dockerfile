FROM python:3.12-alpine
RUN adduser -D -H -u 10001 portmap && mkdir /data && chown portmap /data
WORKDIR /app
COPY server.py ./
COPY static ./static
USER portmap
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["python", "-u", "server.py"]
