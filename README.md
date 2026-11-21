<p align="center"><img src="docs/logo.png" width="120" alt="portmap logo"></p>

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
| `SEND_CMDLINE` | `1` | `0` sends process names only, not full command lines |

Start it:

```bash
docker compose up -d
```

Open `http://<BIND_ADDR>:<PORTMAP_PORT>` and sign in. The compose file also runs an agent for this machine, so its card appears within 15 seconds.

### 2. Agent (every other Linux machine)

The same three steps as the dashboard's **+ Add agent** popup (bottom right), which fills in your server address and token for you, each with a Copy button.

**Step 1: create the compose file.** Make a folder, open the editor, paste this in, then save (Ctrl+O, Enter, Ctrl+X).

```bash
mkdir -p ~/portmap-agent && cd ~/portmap-agent
nano compose.yaml
```

```yaml
# portmap agent: run on every other Linux machine.
# Settings live in .env next to this file (see .env.example).
services:
  portmap-agent:
    image: ghcr.io/solcredio-admin/portmap-agent:latest
    container_name: portmap-agent
    restart: unless-stopped
    mem_limit: 64m
    cpus: 0.25
    pids_limit: 16
    logging: {driver: json-file, options: {max-size: 1m, max-file: "2"}}
    network_mode: host      # see the host's sockets
    pid: host               # see the host's processes
    cap_drop: [ALL]
    cap_add: [SYS_PTRACE, DAC_READ_SEARCH]
    security_opt: [no-new-privileges:true, apparmor:unconfined]
    read_only: true
    environment:
      SERVER_URL: ${SERVER_URL:?set SERVER_URL in .env}
      AGENT_TOKEN: ${AGENT_TOKEN:?set AGENT_TOKEN in .env}
      HOST_NAME: ${HOST_NAME:-}
      SEND_CMDLINE: ${SEND_CMDLINE:-1}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro   # optional: shows container names. Remove to skip Docker.
      - /etc/os-release:/host/os-release:ro
```

**Step 2: point it at your server.** `SERVER_URL` is the dashboard's address as this machine reaches it; `AGENT_TOKEN` must match the dashboard's.

```bash
nano .env
```

```ini
# The portmap dashboard, as this machine reaches it
SERVER_URL=https://portmap.example.com
# Shared secret; must match the dashboard's AGENT_TOKEN
AGENT_TOKEN=paste-the-dashboards-token
# Optional: name on the dashboard (defaults to the hostname)
HOST_NAME=
```

```bash
chmod 600 .env
```

**Step 3: start it.** The machine shows up on the dashboard within 15 seconds. If not, check the logs.

```bash
docker compose up -d
```

```bash
docker logs portmap-agent
```

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

- Machines that stop reporting fade out after 150 seconds. They stay listed until the server's data volume is cleared.
- **Idle mode:** while nobody has opened the dashboard for 5 minutes, agents report every 60s instead of every 15s, and they speed back up once someone looks. Agents only re-walk processes and query Docker when a socket opens or closes (plus a full rescan every 5 minutes). The browser stops polling while the tab is hidden.
- **Resource caps:** each container is capped at 64 MB of memory and a fraction of one CPU, with logs capped at 2 MB. Typical use is about 20 MB and well under 1% CPU.
- Ports that Docker publishes through iptables only (`userland-proxy: false`) are still detected through the Docker API.
- If an auto-updater (WUD, Watchtower, Tugtainer) manages your hosts, it will update the agent image like any other container.

## Privacy and data protection

portmap is self-hosted. Whoever runs it is the data controller (GDPR and similar laws); the authors receive nothing.

- **No telemetry, analytics or tracking.** Nothing is sent anywhere except from your agents to your own dashboard.
- **No third-party requests from the browser.** Fonts and icons are served by the dashboard itself, so visitors' IP addresses never go to Google or a CDN.
- **One strictly necessary cookie:** `pm_session`, which keeps you signed in. It's exempt from consent requirements (EU ePrivacy Directive Art. 5(3)), so no cookie banner is needed. A `localStorage` entry also remembers your theme and loopback filter on your own device.
- **What's processed:** hostnames, IP addresses, port numbers, process names, user IDs, process command lines and Docker container names from your machines, plus failed-login IP addresses (in memory for 15 minutes). Command lines can contain usernames or secrets, so set `SEND_CMDLINE=0` on an agent to send process names only.
- **Retention:** only the latest snapshot per machine is kept (in the `portmap-data` volume). Delete a machine's data by removing that volume.
- **Logs:** the dashboard logs requests with the client IP to the container log, capped at 2 MB.

## License

[MIT](LICENSE). You may use, modify and redistribute it, including commercially, as long as you keep the copyright and license notice. It comes with **no warranty**.

Bundled fonts are under the SIL Open Font License 1.1; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

The software uses only standard, publicly available cryptography from the Python standard library (password hashing and random tokens). As publicly available open source, it's generally outside export-control licensing requirements; check your local rules if you redistribute it in restricted jurisdictions.

