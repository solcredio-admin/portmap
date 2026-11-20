"""Portmap agent: reads listening sockets from /proc (+ Docker published ports) and pushes to the server.
Stdlib only. Run with host network + host pid so /proc reflects the host."""
import http.client, ipaddress, json, os, platform, socket, struct, sys, time, urllib.request

SERVER_URL = os.environ.get("SERVER_URL", "").rstrip("/")
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
HOST_NAME = os.environ.get("HOST_NAME") or socket.gethostname()
INTERVAL = int(os.environ.get("INTERVAL", "15"))
DOCKER_SOCK = os.environ.get("DOCKER_SOCK", "/var/run/docker.sock")
PROC = os.environ.get("PROC", "/proc")
VERSION = "1.0"


def hex_addr(h):
    """Decode /proc/net address hex (host byte order words) to an IP string."""
    b = bytes.fromhex(h)
    if len(b) == 4:
        return str(ipaddress.IPv4Address(struct.pack("<I", struct.unpack(">I", b)[0])))
    words = struct.unpack(">4I", b)
    ip = ipaddress.IPv6Address(b"".join(struct.pack("<I", w) for w in words))
    return str(ip.ipv4_mapped or ip)


def sockets():
    """Return {inode: (proto, addr, port)} for listening TCP and bound UDP sockets."""
    out = {}
    for proto, fname, want in (("tcp", "tcp", "0A"), ("tcp", "tcp6", "0A"), ("udp", "udp", "07"), ("udp", "udp6", "07")):
        try:
            lines = open(f"{PROC}/net/{fname}").read().splitlines()[1:]
        except OSError:
            continue
        for ln in lines:
            f = ln.split()
            if f[3] != want:
                continue
            if proto == "udp" and int(f[2].split(":")[1], 16) != 0:
                continue  # connected client socket, not a listener
            a, p = f[1].split(":")
            out[f[9]] = (proto, hex_addr(a), int(p, 16))
    return out


def procs_by_inode(inodes):
    found = {}
    for pid in os.listdir(PROC):
        if not pid.isdigit():
            continue
        try:
            fds = os.listdir(f"{PROC}/{pid}/fd")
        except OSError:
            continue
        hit = None
        for fd in fds:
            try:
                link = os.readlink(f"{PROC}/{pid}/fd/{fd}")
            except OSError:
                continue
            if link.startswith("socket:[") and link[8:-1] in inodes:
                if hit is None:
                    try:
                        name = open(f"{PROC}/{pid}/comm").read().strip()
                        cmd = open(f"{PROC}/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode(errors="replace").strip()
                        uid = next(l.split()[1] for l in open(f"{PROC}/{pid}/status") if l.startswith("Uid:"))
                    except (OSError, StopIteration):
                        name, cmd, uid = "?", "", ""
                    hit = {"pid": int(pid), "name": name, "cmd": cmd[:300], "uid": uid}
                found.setdefault(link[8:-1], []).append(hit)
    return found


class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect(DOCKER_SOCK)


def docker_ports():
    """{(port, proto): container info} from Docker's published ports. Empty if no socket."""
    if not os.path.exists(DOCKER_SOCK):
        return {}
    try:
        c = UnixHTTP("localhost")
        c.request("GET", "/containers/json")
        data = json.loads(c.getresponse().read())
    except (OSError, ValueError, http.client.HTTPException) as e:
        print(f"docker: {e}", file=sys.stderr)
        return {}
    out = {}
    for ct in data:
        for p in ct.get("Ports", []):
            if p.get("PublicPort"):
                out[(p["PublicPort"], p["Type"])] = {
                    "name": (ct.get("Names") or ["?"])[0].lstrip("/"), "image": ct.get("Image", ""),
                    "private": str(p.get("PrivatePort", "")), "status": ct.get("Status", ""),
                    "ip": p.get("IP", "")}
    return out


def is_exposed(addr):
    return not ipaddress.ip_address(addr).is_loopback


def collect():
    socks = sockets()
    owners = procs_by_inode(set(socks))
    dock = docker_ports()
    merged = {}
    for inode, (proto, addr, port) in socks.items():
        e = merged.setdefault((port, proto), {"port": port, "proto": proto, "addrs": [], "procs": []})
        if addr not in e["addrs"]:
            e["addrs"].append(addr)
        for pr in owners.get(inode, []):
            if pr["pid"] not in [x["pid"] for x in e["procs"]]:
                e["procs"].append(pr)
    # Ports Docker publishes via iptables only (userland-proxy off) never show in /proc.
    for (port, proto), ct in dock.items():
        e = merged.setdefault((port, proto), {"port": port, "proto": proto, "addrs": [], "procs": []})
        ip = ct.pop("ip") or "0.0.0.0"
        if ip not in e["addrs"] and not e["procs"]:
            e["addrs"].append(ip)
        e["container"] = ct
    for e in merged.values():
        e["exposed"] = any(is_exposed(a) for a in e["addrs"])
        e.setdefault("container", None)
    return sorted(merged.values(), key=lambda e: (e["port"], e["proto"]))


def host_info():
    info = {"kernel": platform.release()}
    try:
        info["uptime"] = int(float(open(f"{PROC}/uptime").read().split()[0]))
    except OSError:
        pass
    for path in ("/host/os-release", "/etc/os-release"):
        try:
            info["os"] = next(l.split("=", 1)[1].strip().strip('"') for l in open(path) if l.startswith("PRETTY_NAME="))
            break
        except (OSError, StopIteration):
            continue
    return info


def push(report):
    req = urllib.request.Request(f"{SERVER_URL}/api/report", data=json.dumps(report).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {AGENT_TOKEN}", "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10).read()


def main():
    if not SERVER_URL or not AGENT_TOKEN:
        raise SystemExit("SERVER_URL and AGENT_TOKEN are required")
    print(f"portmap agent {VERSION} -> {SERVER_URL} as {HOST_NAME}", flush=True)
    while True:
        try:
            ports = collect()
            push({"host": HOST_NAME, "ports": ports, "agent": VERSION, **host_info()})
            print(f"pushed {len(ports)} ports", flush=True)
        except Exception as e:  # keep looping; server may be restarting
            print(f"push failed: {e}", file=sys.stderr, flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    if sys.argv[1:] == ["--once"]:
        print(json.dumps(collect(), indent=1))
    else:
        main()
