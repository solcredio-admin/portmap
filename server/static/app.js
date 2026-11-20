// All agent data is untrusted: build DOM with textContent only, never innerHTML.
const $ = (id) => document.getElementById(id);
const STALE_AFTER = 60;
let data = { now: 0, hosts: [] };
let hideLocal = false;
try { hideLocal = localStorage.getItem("pm-hide-local") === "1"; } catch {}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function scope(addr) {
  if (addr === "0.0.0.0" || addr === "::") return "all interfaces";
  if (addr.startsWith("127.") || addr === "::1") return "loopback";
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(addr) || addr.startsWith("fd7a:115c")) return "tailnet";
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr) || /^f[cd]/.test(addr)) return "private";
  return "public ip";
}

function ago(s) {
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function uptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return d ? `up ${d}d ${h}h` : `up ${h}h`;
}

function label(p) {
  if (p.container) return p.container.name;
  if (p.procs.length) return p.procs[0].name;
  return "—";
}

// 1-1023 | 1024-49151 | 49152-65535 → [segment index, percent within]
function where(port) {
  if (port < 1024) return [0, ((port - 1) / 1023) * 100];
  if (port < 49152) return [1, ((port - 1024) / 48128) * 100];
  return [2, ((port - 49152) / 16384) * 100];
}

function probePort() {
  const n = parseInt($("probe").value, 10);
  return n >= 1 && n <= 65535 ? n : null;
}

function tick(seg, pct, cls) {
  const t = el("span", cls);
  t.style.left = `${pct}%`;
  seg.append(t);
}

function render() {
  hideTicket();
  const probe = probePort();
  const root = $("cards");
  root.replaceChildren();
  const hosts = [...data.hosts].sort((a, b) => a.host.localeCompare(b.host));
  $("host-count").textContent = hosts.length === 1 ? hosts[0].host : `${hosts.length || "your"} machines`;
  $("hide-local").setAttribute("aria-pressed", String(hideLocal));

  if (!hosts.length) root.append(el("div", "cap empty", "No agents have reported yet."));

  for (const h of hosts) {
    const age = data.now - h.seen;
    const ports = h.ports.filter((p) => !hideLocal || p.exposed);
    const host = el("section", "host" + (age > STALE_AFTER ? " stale" : ""));

    const head = el("div", "host-head");
    head.append(el("div", "cap",
      `${h.os || "linux"} · ${uptime(h.uptime)} · ${h.ports.filter((p) => p.exposed).length} exposed / ${h.ports.length} bound · ${ago(age)}`));
    head.append(el("h2", null, h.host));
    if (probe) {
      const hit = h.ports.filter((p) => p.port === probe);
      head.append(el("span", "pill " + (hit.length ? "taken" : "free"),
        hit.length ? `${probe} taken by ${label(hit[0])}` : `${probe} is free`));
    }
    host.append(head);

    const panel = el("div", "panel");
    const strip = el("div", "strip");
    const segs = [0, 1, 2].map(() => el("div", "seg"));
    for (const p of ports) {
      const [i, pct] = where(p.port);
      tick(segs[i], pct, p.port === probe ? "hit" : p.exposed ? "" : "local");
    }
    if (probe && !ports.some((p) => p.port === probe)) {
      const [i, pct] = where(probe);
      tick(segs[i], pct, "hit");
    }
    strip.append(...segs);
    const legend = el("div", "legend");
    legend.append(el("span", null, "1 — 1023"), el("span", null, "1024 — 49151"), el("span", null, "49152+"));
    panel.append(strip, legend);

    const keys = el("div", "keys");
    for (const p of ports) {
      const b = el("button", "key" + (p.exposed ? "" : " local") + (probe ? (p.port === probe ? " hit" : " dim") : ""));
      b.type = "button";
      b.append(el("span", "p", p.proto), el("span", "n", String(p.port)), el("span", "l", label(p)));
      b.setAttribute("aria-label", `port ${p.port} ${p.proto} ${label(p)}`);
      const show = () => showTicket(b, h, p);
      b.addEventListener("mouseenter", show);
      b.addEventListener("focus", show);
      b.addEventListener("mouseleave", hideTicket);
      b.addEventListener("blur", hideTicket);
      keys.append(b);
    }
    panel.append(keys);
    host.append(panel);
    root.append(host);
  }
  renderProbe(probe, hosts);
}

function renderProbe(probe, hosts) {
  const out = $("probe-out");
  out.replaceChildren();
  const used = hosts.reduce((n, h) => n + h.ports.length, 0);
  if (!probe && $("probe").value) { out.textContent = "Ports run from 1 to 65535"; return; }
  if (!probe) {
    out.textContent = `${used} ports bound across ${hosts.length} machine${hosts.length === 1 ? "" : "s"} · type a port`;
    return;
  }
  const takenOn = hosts.filter((h) => h.ports.some((p) => p.port === probe)).map((h) => h.host);
  if (!takenOn.length) {
    out.append(el("b", "free", "Free"), " on every machine");
    return;
  }
  const all = new Set(hosts.flatMap((h) => h.ports.map((p) => p.port)));
  let next = probe + 1;
  while (next <= 65535 && all.has(next)) next++;
  out.append(el("b", "taken", "Taken"), ` on ${takenOn.join(", ")} · next free everywhere: `, el("b", null, String(next)));
}

function showTicket(anchor, h, p) {
  const tk = $("ticket");
  tk.replaceChildren();
  tk.append(el("div", "cap", `${h.host} · ${p.proto} · ${p.exposed ? "exposed" : "loopback only"}`));
  tk.append(el("h3", null, String(p.port)));
  const dl = el("dl");
  const row = (k, v) => { if (v) dl.append(el("dt", null, k), el("dd", null, v)); };
  row("bind", p.addrs.map((a) => `${a} (${scope(a)})`).join("\n") || "—");
  if (p.container) {
    row("container", p.container.name);
    row("image", p.container.image);
    row("maps to", p.container.private ? `${p.container.private}/${p.proto} inside` : "");
    row("status", p.container.status);
  }
  for (const pr of p.procs) {
    row("process", `${pr.name}  pid ${pr.pid}${pr.uid ? "  uid " + pr.uid : ""}`);
    row("command", pr.cmd);
  }
  if (!p.container && !p.procs.length) row("owner", "unknown (agent lacks permission?)");
  tk.append(dl);
  tk.hidden = false;

  const r = anchor.getBoundingClientRect();
  const w = tk.offsetWidth, hgt = tk.offsetHeight;
  let x = r.right + 12, y = r.top;
  if (x + w > innerWidth - 16) x = Math.max(16, r.left - w - 12);
  if (y + hgt > innerHeight - 16) y = Math.max(16, innerHeight - hgt - 16);
  tk.style.left = `${x}px`;
  tk.style.top = `${y}px`;
}
function hideTicket() { $("ticket").hidden = true; }

async function load() {
  try {
    const r = await fetch("/api/hosts", { credentials: "same-origin" });
    if (r.status === 401) { location.href = "/login"; return; }
    data = await r.json();
    render();
  } catch (e) {
    $("probe-out").textContent = "Connection lost — retrying";
  }
}

$("probe").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "");
  render();
});
$("hide-local").addEventListener("click", () => {
  hideLocal = !hideLocal;
  try { localStorage.setItem("pm-hide-local", hideLocal ? "1" : "0"); } catch {}
  render();
});
addEventListener("scroll", hideTicket, { passive: true });

load();
setInterval(load, 10000);
