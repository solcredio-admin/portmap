"""Portmap server: login-protected dashboard + agent ingest. Stdlib only."""
import gzip, hashlib, hmac, json, os, re, secrets, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
PORT = int(os.environ.get("PORT", "8080"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "0") == "1"
DATA_FILE = os.environ.get("DATA_FILE", "/data/hosts.json")
TRUST_PROXY = os.environ.get("TRUST_PROXY", "0") == "1"
SESSION_TTL = 12 * 3600
ACTIVE_INTERVAL, IDLE_INTERVAL = 15, 60   # agent report interval while watched / idle
IDLE_AFTER = 300                          # dashboard unviewed this long = idle
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

if len(ADMIN_PASSWORD) < 12:
    raise SystemExit("ADMIN_PASSWORD must be set and at least 12 characters")
if len(AGENT_TOKEN) < 24:
    raise SystemExit("AGENT_TOKEN must be set and at least 24 characters")

_SALT = secrets.token_bytes(16)
def _hash(pw: str) -> bytes:
    return hashlib.scrypt(pw.encode(), salt=_SALT, n=2**14, r=8, p=1)
_PW_HASH = _hash(ADMIN_PASSWORD)
del ADMIN_PASSWORD  # keep only the hash in memory

lock = threading.Lock()
sessions = {}   # token -> expiry
failures = {}   # ip -> [timestamps]
hosts = {}      # name -> report
last_view = 0.0
last_persist = 0.0
try:
    with open(DATA_FILE) as f:
        hosts = json.load(f)
except (OSError, ValueError):
    pass

# Served without login: what the sign-in page itself needs.
PUBLIC = {
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/theme.js": ("theme.js", "text/javascript; charset=utf-8"),
    "/favicon.png": ("favicon.png", "image/png"),
    "/icon.png": ("icon.png", "image/png"),
    "/apple-touch-icon.png": ("apple-touch-icon.png", "image/png"),
    "/logo.png": ("logo.png", "image/png"),
    "/fonts/cormorant-garamond.woff2": ("fonts/cormorant-garamond.woff2", "font/woff2"),
    "/fonts/roboto-mono.woff2": ("fonts/roboto-mono.woff2", "font/woff2"),
}

HOST_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

def _s(v, n=200):
    return str(v)[:n] if v is not None else ""

def clean_report(r):
    """Validate untrusted agent payload; return sanitized copy or None."""
    if not isinstance(r, dict) or not HOST_RE.match(str(r.get("host", ""))):
        return None
    ports = r.get("ports")
    if not isinstance(ports, list) or len(ports) > 5000:
        return None
    out = []
    for p in ports:
        if not isinstance(p, dict):
            return None
        port = p.get("port")
        if not isinstance(port, int) or not 1 <= port <= 65535 or p.get("proto") not in ("tcp", "udp"):
            return None
        c = p.get("container") if isinstance(p.get("container"), dict) else None
        out.append({
            "port": port, "proto": p["proto"],
            "addrs": [_s(a, 64) for a in (p.get("addrs") or [])[:16]],
            "exposed": bool(p.get("exposed")),
            "procs": [{"pid": int(x.get("pid", 0)) if str(x.get("pid", "0")).isdigit() else 0,
                       "name": _s(x.get("name"), 64), "cmd": _s(x.get("cmd"), 300), "uid": _s(x.get("uid"), 10)}
                      for x in (p.get("procs") or [])[:8] if isinstance(x, dict)],
            "container": {k: _s(c.get(k), 200) for k in ("name", "image", "private", "status")} if c else None,
        })
    return {"host": r["host"], "ports": out, "os": _s(r.get("os"), 100),
            "kernel": _s(r.get("kernel"), 100), "uptime": int(r.get("uptime") or 0) if str(r.get("uptime") or 0).isdigit() else 0,
            "agent": _s(r.get("agent"), 20), "seen": int(time.time())}

def persist():
    tmp = DATA_FILE + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump(hosts, f)
        os.replace(tmp, DATA_FILE)
    except OSError:
        pass  # dashboard still works from memory


class H(BaseHTTPRequestHandler):
    server_version = "portmap"
    sys_version = ""

    def log_message(self, fmt, *a):
        print(f"{self.ip()} {fmt % a}", flush=True)

    def ip(self):
        if TRUST_PROXY and self.headers.get("X-Forwarded-For"):
            return self.headers["X-Forwarded-For"].split(",")[0].strip()
        return self.client_address[0]

    def send(self, code, body=b"", ctype="text/plain; charset=utf-8", headers=(), cache="no-store"):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", cache)
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def authed(self):
        m = re.search(r"(?:^|;\s*)pm_session=([A-Za-z0-9_-]+)", self.headers.get("Cookie", ""))
        if not m:
            return False
        with lock:
            exp = sessions.get(m.group(1))
            if exp and exp > time.time():
                return True
            sessions.pop(m.group(1), None)
        return False

    def static(self, name, ctype):
        # Images and fonts never change between releases often enough to matter; CSS/JS stay fresh.
        cache = "public, max-age=86400" if ctype.startswith(("image/", "font/")) else "no-store"
        with open(os.path.join(STATIC, name), "rb") as f:
            self.send(200, f.read(), ctype, cache=cache)

    _bundle = None  # (version, raw, gzipped): the 1.3 MB app.js, compressed once

    @staticmethod
    def load_bundle():
        if H._bundle is None:
            try:
                with open(os.path.join(STATIC, "app.js"), "rb") as f:
                    raw = f.read()
            except OSError:  # not built (bare checkout): pages still render
                raw = b""
            H._bundle = (hashlib.sha256(raw).hexdigest()[:12], raw, gzip.compress(raw, 9))
        return H._bundle

    def bundle(self):
        """app.js, gzipped. Pages link /app.js?v=<hash>, so it caches forever and the
        login page can prefetch it: signing in then starts the intro with no download."""
        ver, raw, gz = self.load_bundle()
        fresh = parse_qs(urlparse(self.path).query).get("v", [""])[0] == ver
        cache = "public, max-age=31536000, immutable" if fresh else "no-cache"
        hdrs = [("Vary", "Accept-Encoding")]
        if "gzip" in self.headers.get("Accept-Encoding", ""):
            return self.send(200, gz, "text/javascript; charset=utf-8", hdrs + [("Content-Encoding", "gzip")], cache)
        self.send(200, raw, "text/javascript; charset=utf-8", hdrs, cache)

    def page(self, name, **subs):
        with open(os.path.join(STATIC, name)) as f:
            html = f.read().replace("{{V}}", self.load_bundle()[0])
        for k, v in subs.items():
            html = html.replace("{{%s}}" % k, v)
        self.send(200, html, "text/html; charset=utf-8")

    def body(self, limit):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            return None
        return self.rfile.read(n)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            return self.send(200, "ok")
        if path in PUBLIC:
            return self.static(*PUBLIC[path])
        if path == "/app.js":  # public on purpose: library code only, no data or secrets
            return self.bundle()
        if path == "/login":
            if self.authed():
                return self.send(303, headers=[("Location", "/")])
            err = parse_qs(urlparse(self.path).query).get("e", [""])[0]
            msg = {"1": "Wrong credentials.", "2": "Too many attempts. Try again in 15 minutes."}.get(err, "")
            return self.page("login.html", ERR=msg)
        if not self.authed():
            if path.startswith("/api/"):
                return self.send(401, "unauthorized")
            return self.send(303, headers=[("Location", "/login")])
        if path == "/":
            return self.page("index.html")
        if path == "/api/agent-setup":  # signed-in admin only; fills the "Add agent" popup
            return self.send(200, json.dumps({"token": AGENT_TOKEN}), "application/json")
        if path == "/api/hosts":
            global last_view
            with lock:
                last_view = time.time()
                data = json.dumps({"now": int(time.time()), "hosts": list(hosts.values())})
            return self.send(200, data, "application/json")
        self.send(404, "not found")

    do_HEAD = do_GET

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/login":
            return self.login()
        if path == "/logout":
            m = re.search(r"pm_session=([A-Za-z0-9_-]+)", self.headers.get("Cookie", ""))
            if m:
                with lock:
                    sessions.pop(m.group(1), None)
            return self.send(303, headers=[("Location", "/login"),
                                           ("Set-Cookie", "pm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict")])
        if path == "/api/report":
            return self.report()
        self.send(404, "not found")

    def login(self):
        ip, now = self.ip(), time.time()
        with lock:
            recent = [t for t in failures.get(ip, []) if now - t < 900]
            failures[ip] = recent
        if len(recent) >= 5:
            return self.send(303, headers=[("Location", "/login?e=2")])
        raw = self.body(4096)
        form = parse_qs(raw.decode(errors="replace")) if raw else {}
        user = form.get("username", [""])[0]
        pw = form.get("password", [""])[0][:256]
        ok_user = hmac.compare_digest(user.encode(), ADMIN_USER.encode())
        ok_pw = hmac.compare_digest(_hash(pw), _PW_HASH)
        if not (ok_user and ok_pw):
            with lock:
                failures[ip].append(now)
            return self.send(303, headers=[("Location", "/login?e=1")])
        token = secrets.token_urlsafe(32)
        with lock:
            failures.pop(ip, None)
            for t in [t for t, e in sessions.items() if e < now]:
                del sessions[t]
            sessions[token] = now + SESSION_TTL
        cookie = f"pm_session={token}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Strict"
        if COOKIE_SECURE:
            cookie += "; Secure"
        self.send(303, headers=[("Location", "/?intro"), ("Set-Cookie", cookie)])  # ?intro: play the loading animation once

    def report(self):
        auth = self.headers.get("Authorization", "")
        if not hmac.compare_digest(auth.encode(), f"Bearer {AGENT_TOKEN}".encode()):
            return self.send(401, "unauthorized")
        raw = self.body(2 * 1024 * 1024)
        if raw is None:
            return self.send(413, "too large")
        try:
            rep = clean_report(json.loads(raw))
        except ValueError:
            rep = None
        if not rep:
            return self.send(400, "bad report")
        global last_persist
        now = time.time()
        with lock:
            old = hosts.get(rep["host"])
            hosts[rep["host"]] = rep
            # Disk only when ports change; "seen" alone isn't worth a write.
            if not old or old["ports"] != rep["ports"] or now - last_persist > 600:
                persist()
                last_persist = now
            interval = ACTIVE_INTERVAL if now - last_view < IDLE_AFTER else IDLE_INTERVAL
        self.send(200, json.dumps({"interval": interval}), "application/json")


if __name__ == "__main__":
    H.load_bundle()  # compress once at startup, not on the first visitor's request
    print(f"portmap listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
