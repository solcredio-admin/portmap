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

## 1. Deploy the dashboard (main server)

Requires Docker with the Compose plugin.

```bash
git clone https://github.com/solcredio-admin/portmap.git && cd portmap
cp .env.example .env
```

Edit `.env`:

| Variable | What to put |
|---|---|
| `ADMIN_USER` | login username (default `admin`) |
| `ADMIN_PASSWORD` | login password, **12+ characters** |
| `AGENT_TOKEN` | shared secret for agents: `openssl rand -hex 32` |
| `BIND_ADDR` | address the dashboard listens on: `127.0.0.1`, your Tailscale/LAN IP, or `0.0.0.0` behind a TLS proxy |
| `PORTMAP_PORT` | host port for the dashboard (default `8080`) |
| `COOKIE_SECURE` | `1` when you serve it over HTTPS |
| `TRUST_PROXY` | `1` only behind a reverse proxy that sets `X-Forwarded-For` |

Then:

```bash
docker compose up -d
```

Open `http://<BIND_ADDR>:<PORTMAP_PORT>` and sign in. This compose file also starts an agent for the server itself, so its card shows up within 15 seconds.

To update: `docker compose pull && docker compose up -d`.

---

## 2. Add another Linux machine (agent)

You only need one file: [`agent/docker-compose.yml`](agent/docker-compose.yml).

```bash
mkdir portmap-agent && cd portmap-agent
curl -fsSLO https://raw.githubusercontent.com/solcredio-admin/portmap/main/agent/docker-compose.yml
printf 'SERVER_URL=http://<server-ip>:8080\nAGENT_TOKEN=<same token as the server>\n' > .env
chmod 600 .env
docker compose up -d
```

The machine appears on the dashboard under its hostname. Set `HOST_NAME=` in `.env` to override it.

No `.env` file possible (e.g. a UI that takes pasted compose YAML)? Replace the two `CHANGE-ME` values in the file directly.

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

## Development

```bash
# server, no Docker
cd server && ADMIN_PASSWORD=devpassword12 AGENT_TOKEN=$(openssl rand -hex 16) DATA_FILE=/tmp/pm.json python3 server.py
# agent: print what it sees on this machine (Linux)
python3 agent/agent.py --once
# build images locally
docker compose build
```
