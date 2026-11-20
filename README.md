# portmap

**Every listening port, on every Linux machine, on one page.**

Before you deploy a new app, open portmap and see which ports are already taken on each server. Type a port into the probe box and every machine shows **FREE** or **TAKEN**, along with the next port that's free everywhere.

- Each machine is a card. Each bound port is a slot: **solid green** means it's reachable from outside the machine, **dashed** means it only listens on localhost.
- Hover any slot to see the bind address (all interfaces / Tailscale / LAN / loopback), process, PID, command line, and the Docker container, image and internal port behind it.
- A strip on each card maps ports 1 to 65535 so you can see the gaps at a glance.
- Login-protected. No database and no dependencies (Python standard library only).

```
┌──────────────┐   push every 15s    ┌─────────────────────┐
│ agent        │ ──────────────────▶ │ portmap server      │ ◀── you, in a browser
│ (each host)  │   Bearer token      │ dashboard + login   │
└──────────────┘                     └─────────────────────┘
```

Images are built by GitHub Actions on every push to `main`:

| Image | |
|---|---|
| `ghcr.io/solcredio-admin/portmap-server:latest` | dashboard |
| `ghcr.io/solcredio-admin/portmap-agent:latest` | agent |

Both are built for `linux/amd64` and `linux/arm64`. Tags: `latest`, the short commit SHA, and `X.Y.Z` for `vX.Y.Z` git tags.

---

## 1. Dashboard (main server)

Save this as `docker-compose.yml`, change the three `CHANGE-ME` values, then run `docker compose up -d`.

```yaml
services:
  portmap:
    image: ghcr.io/solcredio-admin/portmap-server:latest
    container_name: portmap
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"          # use your Tailscale/LAN IP instead of 127.0.0.1 to reach it from other machines
    environment:
      ADMIN_USER: admin
      ADMIN_PASSWORD: CHANGE-ME        # 12+ characters
      AGENT_TOKEN: CHANGE-ME           # openssl rand -hex 32
      COOKIE_SECURE: "0"               # "1" when served over HTTPS
    volumes:
      - portmap-data:/data
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp]

  portmap-agent:                       # reports this server's own ports
    image: ghcr.io/solcredio-admin/portmap-agent:latest
    container_name: portmap-agent
    restart: unless-stopped
    network_mode: host
    pid: host
    cap_drop: [ALL]
    cap_add: [SYS_PTRACE, DAC_READ_SEARCH]
    security_opt: [no-new-privileges:true, apparmor:unconfined]
    read_only: true
    environment:
      SERVER_URL: http://127.0.0.1:8080  # match the address in "ports" above
      AGENT_TOKEN: CHANGE-ME             # same as above
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc/os-release:/host/os-release:ro
    depends_on: [portmap]

volumes:
  portmap-data:
```

Open `http://127.0.0.1:8080` (or the IP you bound to) and sign in. Update with `docker compose pull && docker compose up -d`.

---

## 2. Agent (every other Linux machine)

Save this as `docker-compose.yml` on the machine, change the two `CHANGE-ME` values, then run `docker compose up -d`.

```yaml
services:
  portmap-agent:
    image: ghcr.io/solcredio-admin/portmap-agent:latest
    container_name: portmap-agent
    restart: unless-stopped
    network_mode: host      # see the host's sockets
    pid: host               # see the host's processes
    cap_drop: [ALL]
    cap_add: [SYS_PTRACE, DAC_READ_SEARCH]
    security_opt: [no-new-privileges:true, apparmor:unconfined]
    read_only: true
    environment:
      SERVER_URL: http://CHANGE-ME:8080   # the dashboard's address
      AGENT_TOKEN: CHANGE-ME              # same token as the dashboard
      HOST_NAME: ""                       # optional; defaults to the machine's hostname
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro   # optional: shows container names
      - /etc/os-release:/host/os-release:ro
```

The machine shows up on the dashboard within 15 seconds.

---

## Security

- **Login:** one admin account. The password is scrypt-hashed in memory and never stored. 5 failed attempts lock that IP out for 15 minutes.
- **Sessions:** random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` with `COOKIE_SECURE=1`). 12-hour lifetime. Sign-out revokes it on the server.
- **Browser:** strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`. Agent data is only ever rendered as text, never as HTML.
- **Agents:** reports need `AGENT_TOKEN` (compared in constant time). The server validates every field and caps sizes.
- **Containers:** the server runs as a non-root user on a read-only filesystem with all capabilities dropped.
- **Exposure:** serve the dashboard on a private network (Tailscale/LAN) or behind an HTTPS reverse proxy. Don't publish plain HTTP to the internet.
- **What the agent can access:** it needs host PID and network namespaces plus `SYS_PTRACE`/`DAC_READ_SEARCH` to map sockets to processes, and optionally the Docker socket for container names. That's close to root on the host. Remove the socket mount if you don't need container names.

## Notes

- Machines that stop reporting fade out after 60 seconds. They stay listed until the server's data volume is cleared.
- Ports that Docker publishes through iptables only (`userland-proxy: false`) are still detected through the Docker API.
- If an auto-updater (WUD, Watchtower, Tugtainer) manages your hosts, it will update the agent image like any other container.
