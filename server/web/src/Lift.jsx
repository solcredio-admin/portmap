// Hovered port box rises as a real 3D keycap (R3F), tilts with the mouse, and a
// cursor light glints across it. Moving over the grid glides the cap from key to key.
// The DOM button stays underneath (focus, hover card, screen readers); this layer
// is pointer-events: none and draws frames only while something is moving.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, LinearFilter, MathUtils, PlaneGeometry, SRGBColorSpace } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const DEPTH = 14, LIFT = 46, POP = 1.16, TILT = 0.42;
const GLIDE = 30, RISE = 18, TURN = 16;  // damping rates (1/s): higher = snappier
const GAP_GRACE = 140;  // ms: crossing the gap between keys glides instead of dropping
const pointer = { x: -1e4, y: -1e4, el: null, lostAt: 0 };
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
  const st = useRef({ el: null, w: 92, h: 72, lift: 0, geo: null, tex: null });

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
      const k = document.elementFromPoint(pointer.x, pointer.y)?.closest(".key");
      if (k && !k.classList.contains("dim")) { pointer.el = k; pointer.lostAt = 0; }
      else if (pointer.el && !pointer.lostAt) pointer.lostAt = performance.now();
      invalidate();
    };
    const move = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pick(); };
    const out = (e) => { if (!e.relatedTarget) { pointer.el = null; pointer.lostAt = 0; invalidate(); } };
    const wake = pick;
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
    if (pointer.lostAt && performance.now() - pointer.lostAt > GAP_GRACE) { pointer.el = null; pointer.lostAt = 0; }
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
        const { tex, edge } = painted;
        face.current.material.map = tex;
        face.current.material.needsUpdate = true;
        body.current.material.color.set(edge);
        if (s.lift < 0.02) {  // first lift: start exactly on the DOM key, no glide
          g.position.set(r.left + w / 2 - innerWidth / 2, innerHeight / 2 - r.top - h / 2, 0);
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
    g.position.x = MathUtils.damp(g.position.x, tx, GLIDE, dt);
    g.position.y = MathUtils.damp(g.position.y, ty, GLIDE, dt);
    if (s.hidePending && s.el && Math.abs(g.position.x - tx) + Math.abs(g.position.y - ty) < 8) {
      s.el.classList.add("lifted");
      s.hidePending = false;
    }
    g.position.z = s.lift * LIFT;
    g.rotation.x = MathUtils.damp(g.rotation.x, rx * s.lift, TURN, dt);
    g.rotation.y = MathUtils.damp(g.rotation.y, ry * s.lift, TURN, dt);
    g.scale.setScalar(1 + (POP - 1) * s.lift);
    g.visible = s.lift > 0.01;
    light.current.position.set(pointer.x - innerWidth / 2, innerHeight / 2 - pointer.y, 160);

    const moving = pointer.lostAt > 0 || s.hidePending || Math.abs(g.position.x - tx) + Math.abs(g.position.y - ty) > 0.3
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
          <meshStandardMaterial roughness={0.45} metalness={0.05} />
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
