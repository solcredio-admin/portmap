// Hovered port box rises as a real 3D keycap (R3F), tilts with the mouse, and a
// cursor light glints across it. Moving over the grid glides the cap from key to key.
// The DOM button stays underneath (focus, hover card, screen readers); this layer
// is pointer-events: none and draws frames only while something is moving.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, LinearFilter, MathUtils, PlaneGeometry, SRGBColorSpace } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const DEPTH = 14, LIFT = 46, POP = 1.16, TILT = 0.42;
const STIFF = 1500, DAMP = 2 * 0.82 * Math.sqrt(STIFF);  // stiff spring, slightly underdamped: snaps in with a hint of settle
const HOP = 10;          // px of extra lift while travelling between keys
const RISE = 28, TURN = 24;  // damping rates (1/s) for lift and tilt
const GAP_GRACE = 140;  // ms: crossing the gap between keys glides instead of dropping
const pointer = { x: -1e4, y: -1e4, el: null, lostAt: 0 };
const RIPPLE_R = 260, PUSH = 8, RISE_PX = 3, GROW = 0.04;  // neighbours: subtle on purpose
let field = null;  // the .keys grid currently rippling

// Neighbours drift a few px away from the cursor and rise slightly, fading with
// distance. CSS transforms on the real buttons (compositor-only), not extra WebGL.
function ripple() {
  const grid = pointer.el?.closest(".keys") || null;
  if (field && field !== grid) for (const k of field.children) k.style.transform = "";
  field = grid;
  if (!grid) return;
  const g = grid.getBoundingClientRect();
  for (const k of grid.children) {
    if (k === pointer.el) { k.style.transform = ""; continue; }
    // offset* ignores transforms, so the ripple never chases its own displacement
    const dx = g.left + k.offsetLeft + k.offsetWidth / 2 - pointer.x;
    const dy = g.top + k.offsetTop + k.offsetHeight / 2 - pointer.y;
    const d = Math.hypot(dx, dy), f = Math.max(0, 1 - d / RIPPLE_R) ** 1.5;
    if (f < 0.01) { k.style.transform = ""; continue; }
    const push = (PUSH * f) / (d || 1);
    k.style.transform = `translate(${(dx * push).toFixed(1)}px, ${(dy * push - RISE_PX * f).toFixed(1)}px) scale(${(1 + GROW * f).toFixed(3)})`;
  }
}

// Hit areas reach HIT_PAD past each key, covering the grid gap: the cap starts
// moving as soon as the pointer leaves a key instead of stalling in the gutter.
const HIT_PAD = 8;
function keyAt(x, y) {
  const hit = document.elementFromPoint(x, y);
  const direct = hit?.closest(".key");
  if (direct) return direct;
  const grid = hit?.closest(".keys") || pointer.el?.closest(".keys");
  if (!grid) return null;
  const g = grid.getBoundingClientRect();
  let best = null, bestD = HIT_PAD;
  for (const k of grid.children) {  // offset* = layout box, unaffected by the ripple transforms
    const l = g.left + k.offsetLeft, t = g.top + k.offsetTop;
    const d = Math.hypot(Math.max(l - x, 0, x - l - k.offsetWidth), Math.max(t - y, 0, y - t - k.offsetHeight));
    if (d <= bestD) { bestD = d; best = k; }
  }
  return best;
}

const faces = new Map();  // painted labels, reused: re-uploading a texture per switch hitched

// The key's face, painted from the DOM key itself so theme, .local and labels match.
function paintFace(el, w, h) {
  const cs = getComputedStyle(el), root = getComputedStyle(document.documentElement);
  const edge = root.getPropertyValue(el.classList.contains("local") ? "--cap-edge" : "--key-edge").trim();
  // Lifted, popped and seen in perspective, the cap shows ~1.3x its size: paint well above screen density.
  const s = Math.min(4, Math.ceil(devicePixelRatio * 2)), c = document.createElement("canvas");
  c.width = w * s; c.height = h * s;
  const g = c.getContext("2d");
  g.scale(s, s);
  g.fillStyle = edge; g.beginPath(); g.roundRect(0, 0, w, h, 10); g.fill();
  g.fillStyle = cs.backgroundColor; g.beginPath(); g.roundRect(0, 0, w, h - 4, 10); g.fill();
  // Liquid-glass finish, same recipe as the CSS panels: soft diagonal sheen, and a
  // thin rim around the whole outline, brightest on top and fading toward the bottom.
  g.save(); g.beginPath(); g.roundRect(0, 0, w, h - 4, 10); g.clip();
  const sheen = g.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, "rgba(255,255,255,.2)"); sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  sheen.addColorStop(0.75, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(255,255,255,.08)");
  g.fillStyle = sheen; g.fillRect(0, 0, w, h);
  g.restore();
  const rim = g.createLinearGradient(0, 0, 0, h);
  rim.addColorStop(0, "rgba(255,255,255,.75)"); rim.addColorStop(1, "rgba(255,255,255,.22)");
  g.strokeStyle = rim; g.lineWidth = 1.2;
  g.beginPath(); g.roundRect(0.6, 0.6, w - 1.2, h - 1.2, 9.5); g.stroke();
  g.fillStyle = cs.color; g.textBaseline = "alphabetic";
  const txt = (sel) => el.querySelector(sel)?.textContent || "";
  g.globalAlpha = 0.5; g.font = "500 8.5px 'Roboto Mono', monospace"; g.textAlign = "right";
  g.fillText(txt(".p").toUpperCase(), w - 9, 17);
  g.globalAlpha = 1; g.textAlign = "left"; g.font = "500 17px 'Roboto Mono', monospace";
  g.fillText(txt(".n"), 10, 27);
  g.globalAlpha = 0.7; g.font = "400 10px 'Roboto Mono', monospace";
  let label = txt(".l");
  while (label.length > 1 && g.measureText(label).width > w - 20) label = label.slice(0, -2) + "…";
  g.fillText(label, 10, h - 13);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = false;  // mipmaps soften small text; the cap is never minified much
  tex.minFilter = LinearFilter;
  tex.anisotropy = 8;
  return { tex, edge };
}

function Cap() {
  const group = useRef(), face = useRef(), body = useRef(), light = useRef();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const st = useRef({ el: null, w: 92, h: 72, lift: 0, geo: null, vx: 0, vy: 0, nextFace: null, from: 0 });
  const setFace = ({ tex, edge }) => {
    face.current.material.map = tex;
    face.current.material.needsUpdate = true;
    body.current.material.color.set(edge);
    body.current.material.emissive.set(edge);
  };

  // 1 world unit = 1 CSS pixel on the z=0 plane, with real perspective for the tilt.
  useEffect(() => {
    camera.fov = 30;
    camera.near = 10; camera.far = 10000;
    camera.position.set(0, 0, size.height / 2 / Math.tan(MathUtils.degToRad(15)));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);

  useEffect(() => {
    const pick = () => {  // also on scroll: the grid slides under a still mouse
      const k = keyAt(pointer.x, pointer.y);
      if (k && !k.classList.contains("dim")) { pointer.el = k; pointer.lostAt = 0; }
      else if (pointer.el && !pointer.lostAt) pointer.lostAt = performance.now();
      invalidate();
    };
    const move = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pick(); ripple(); };
    const out = (e) => { if (!e.relatedTarget) { pointer.el = null; pointer.lostAt = 0; ripple(); invalidate(); } };
    const wake = () => { pick(); ripple(); };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", out);
    addEventListener("scroll", wake, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", out);
      removeEventListener("scroll", wake);
    };
  }, [invalidate]);

  useFrame((_, dt) => {
    const s = st.current, g = group.current;
    if (pointer.lostAt && performance.now() - pointer.lostAt > GAP_GRACE) { pointer.el = null; pointer.lostAt = 0; ripple(); }
    let el = pointer.el;
    if (el && !el.isConnected) el = pointer.el = null;  // grid was rebuilt by a poll

    if (el !== s.el) {
      s.el?.classList.remove("lifted");
      if (el) {
        const r = el.getBoundingClientRect();
        const w = Math.round(r.width), h = Math.round(r.height);
        if (!s.geo || w !== s.w || h !== s.h) {
          s.geo?.dispose();
          s.geo = new RoundedBoxGeometry(w, h, DEPTH, 3, 9);
          body.current.geometry = s.geo;
          face.current.geometry.dispose();
          face.current.geometry = new PlaneGeometry(w, h);
          s.w = w; s.h = h;
        }
        const key = `${el.className.replace(" lifted", "")}|${el.textContent}|${w}x${h}`;
        let painted = faces.get(key);
        if (!painted) {
          if (faces.size > 200) { faces.forEach((f) => f.tex.dispose()); faces.clear(); }
          painted = paintFace(el, w, h);
          faces.set(key, painted);
        }
        const fresh = s.lift < 0.02;
        if (fresh) {  // first lift: start exactly on the DOM key, no glide
          g.position.set(r.left + w / 2 - innerWidth / 2, innerHeight / 2 - r.top - h / 2, 0);
          s.vx = s.vy = 0;
          setFace(painted);
        } else {
          s.nextFace = painted;  // swap the label halfway across, not the instant it leaves
          s.from = Math.hypot(r.left + w / 2 - innerWidth / 2 - g.position.x, innerHeight / 2 - r.top - h / 2 - g.position.y);
        }
        s.hidePending = true;  // hide the DOM key once the cap is over it
      }
      s.el = el;
    }

    let tx = g.position.x, ty = g.position.y, rx = 0, ry = 0;
    if (s.el) {
      const r = s.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      tx = cx - innerWidth / 2; ty = innerHeight / 2 - cy;
      rx = MathUtils.clamp((pointer.y - cy) / (r.height / 2), -1, 1) * TILT;
      ry = MathUtils.clamp((pointer.x - cx) / (r.width / 2), -1, 1) * TILT;
    }
    s.lift = MathUtils.damp(s.lift, s.el ? 1 : 0, RISE, dt);
    // Spring toward the target in fixed substeps (stable even after an idle gap).
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      s.vx += (STIFF * (tx - g.position.x) - DAMP * s.vx) * h;
      s.vy += (STIFF * (ty - g.position.y) - DAMP * s.vy) * h;
      g.position.x += s.vx * h;
      g.position.y += s.vy * h;
    }
    if (s.nextFace && Math.hypot(tx - g.position.x, ty - g.position.y) < s.from / 2) {
      setFace(s.nextFace);
      s.nextFace = null;
    }
    if (s.hidePending && s.el && Math.abs(g.position.x - tx) + Math.abs(g.position.y - ty) < 8) {
      s.el.classList.add("lifted");
      s.hidePending = false;
    }
    const speed = Math.hypot(s.vx, s.vy);
    g.position.z = s.lift * (LIFT + Math.min(speed * 0.012, HOP));  // a gentle hop while travelling
    g.rotation.x = MathUtils.damp(g.rotation.x, rx * s.lift, TURN, dt);
    g.rotation.y = MathUtils.damp(g.rotation.y, ry * s.lift, TURN, dt);
    g.scale.setScalar(1 + (POP - 1) * s.lift);
    g.visible = s.lift > 0.01;
    light.current.position.set(pointer.x - innerWidth / 2, innerHeight / 2 - pointer.y, 160);

    const moving = pointer.lostAt > 0 || s.hidePending || speed > 1 || Math.abs(g.position.x - tx) + Math.abs(g.position.y - ty) > 0.3
      || Math.abs(s.lift - (s.el ? 1 : 0)) > 0.005
      || Math.abs(g.rotation.x - rx * s.lift) + Math.abs(g.rotation.y - ry * s.lift) > 0.002;
    if (moving) invalidate();
  });

  return (
    <>
      <ambientLight intensity={2.6} />
      <pointLight ref={light} intensity={1.1} decay={0} distance={260} />
      <group ref={group} visible={false}>
        <mesh ref={body}>
          <boxGeometry args={[1, 1, 1]} />
          {/* Self-lit base (no dark sides) under a clear glass coat that wraps the whole model. */}
          <meshPhysicalMaterial roughness={0.5} metalness={0} emissiveIntensity={0.7}
            clearcoat={0.6} clearcoatRoughness={0.35} />
        </mesh>
        <mesh ref={face} position-z={DEPTH / 2 + 0.05}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

export default function Lift() {
  // Hover devices only; touch has no hover and reduced motion means no flourish.
  const ok = useMemo(() => matchMedia("(hover: hover) and (pointer: fine)").matches
    && !matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  if (!ok) return null;
  return (
    <Canvas frameloop="demand" flat dpr={[1, 2]} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}>
      <Cap />
    </Canvas>
  );
}
