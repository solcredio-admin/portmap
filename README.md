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

## Install

You need Docker with the Compose plugin. Each machine gets two files in one folder:

- `docker-compose.yml`: what to run (no secrets, never needs editing)
- `.env`: your settings and secrets (Compose reads it automatically)

### 1. Dashboard (main server)

```bash
mkdir -p ~/portmap && cd ~/portmap
curl -fsSLO https://raw.githubusercontent.com/solcredio-admin/portmap/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/solcredio-admin/portmap/main/.env.example -o .env
chmod 600 .env
```

Edit `.env` and set at least these three:

```ini
ADMIN_PASSWORD=a-long-password-you-choose      # 12+ characters
AGENT_TOKEN=paste-output-of-openssl-rand-hex-32
BIND_ADDR=100.x.y.z                            # your Tailscale/LAN IP, or 127.0.0.1
```

To generate a token:

```bash
openssl rand -hex 32
```

All `.env` settings:

| Variable | Default | What it does |
|---|---|---|
| `ADMIN_USER` | `admin` | login username |
| `ADMIN_PASSWORD` | required | login password, 12+ characters |
| `AGENT_TOKEN` | required | shared secret agents use to report in |
| `BIND_ADDR` | `127.0.0.1` | host address the dashboard listens on |
| `PORTMAP_PORT` | `8080` | host port for the dashboard |
| `COOKIE_SECURE` | `0` | `1` when served over HTTPS |
| `TRUST_PROXY` | `0` | `1` only behind a reverse proxy that sets `X-Forwarded-For` |
| `HOST_NAME` | hostname | name shown for this machine |

Start it:

```bash
docker compose up -d
```

Open `http://<BIND_ADDR>:<PORTMAP_PORT>` and sign in. The compose file also runs an agent for this machine, so its card appears within 15 seconds.

### 2. Agent (every other Linux machine)

```bash
mkdir -p ~/portmap-agent && cd ~/portmap-agent
curl -fsSLO https://raw.githubusercontent.com/solcredio-admin/portmap/main/agent/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/solcredio-admin/portmap/main/agent/.env.example -o .env
chmod 600 .env
```

Edit `.env`:

```ini
SERVER_URL=http://100.x.y.z:8080     # the dashboard, as this machine reaches it
AGENT_TOKEN=same-token-as-the-dashboard
HOST_NAME=                           # optional; defaults to the hostname
```

Start it:

```bash
docker compose up -d
```

The machine appears on the dashboard within 15 seconds. If it doesn't, check `docker logs portmap-agent`.

### Update

In either folder:

```bash
docker compose pull && docker compose up -d
```

### Prefer a single file?

Compose can't run without the required values: it stops with `set ADMIN_PASSWORD in .env`. If your tool only takes one pasted compose file, replace each `${...}` in `docker-compose.yml` with the real value instead of using `.env`. Keep that file private.

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
