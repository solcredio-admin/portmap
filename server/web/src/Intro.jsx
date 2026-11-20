// Post-login loading screen: the globe logo as liquid metal, then a short zoom-out
// into the dashboard. Shader adapted from github.com/collidingScopes/liquid-logo
// (MIT, (c) 2025 Alan Ang), "Galaxy" preset baked in as constants.
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { TextureLoader, Vector2 } from "three";

const MIN_SHOW = 1800;   // ms: long enough to see the effect, short enough not to annoy
const MAX_WAIT = 5000;   // never hold the dashboard back on a slow /api/hosts
const LEAVE = 800;       // ms: matches the .leave transition in style.css

const vertex = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragment = /* glsl */ `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_logo;

#define SPEED 0.44
#define ITER 8.0
#define SCALE 2.63
#define DOT_FACTOR 0.03
#define DOT_MULT 0.61
#define V_OFFSET 0.0
#define INTENSITY 0.37
#define EXP_FACTOR 0.5
#define COLOR_FACTORS vec3(1.0, -0.3, 1.6)
#define COLOR_SHIFT 0.1
#define NOISE 4.0
#define INTERACT 0.1
#define LOGO_SCALE 0.92

float random(vec2 st) { return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123); }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float edges(vec2 uv) {
  vec2 d = 1.0 / u_resolution;
  vec4 c = texture2D(u_logo, uv);
  float diff = length(c - texture2D(u_logo, uv - vec2(d.x, 0.0))) + length(c - texture2D(u_logo, uv + vec2(d.x, 0.0)))
             + length(c - texture2D(u_logo, uv - vec2(0.0, d.y))) + length(c - texture2D(u_logo, uv + vec2(0.0, d.y)));
  return smoothstep(0.0, 0.2, diff);
}

void main() {
  vec2 r = u_resolution;
  vec2 FC = gl_FragCoord.xy;
  float time = u_time * SPEED;
  vec2 uv = (FC / r - 0.5) / LOGO_SCALE + 0.5;   // three flips textures on load: no y-flip here
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  float alpha = texture2D(u_logo, uv).a;
  if (alpha <= 0.1) discard;

  float edge = edges(uv) * INTERACT;
  vec2 p = (FC * 2.0 - r) / r.y;
  float lx = abs(DOT_FACTOR - dot(p, p)) * DOT_MULT;
  vec2 v = p * (1.0 - lx) / SCALE;
  v += vec2(sin(edge * 10.0), cos(edge * 8.0)) * edge * 20.0;
  float flow = snoise(vec3(p * 2.0, time * 0.15)) * NOISE;
  v += vec2(flow, flow * 0.7);

  vec4 o = vec4(0.0);
  for (float i = 0.0; i < ITER; i++) {
    float idx = i + 1.0;
    vec2 offset = cos(v.yx * idx + vec2(0.0, idx) + time) / idx + V_OFFSET;
    if (edge > 0.1) offset *= 1.0 + edge * 4.0;
    v += offset;
    o += (sin(vec4(v.x, v.y, v.y, v.x)) + 1.0) * abs(v.x - v.y) * INTENSITY;
  }
  o = o.wxyz * COLOR_SHIFT + o * (1.0 - COLOR_SHIFT);
  vec4 ratio = exp(p.y * vec4(COLOR_FACTORS, 0.0)) * exp(-EXP_FACTOR * lx) / o;
  vec4 e2 = exp(2.0 * ratio);
  o = (e2 - 1.0) / (e2 + 1.0);   // tanh
  o += vec4(random(FC / 1.5 + time * 0.0004) * 0.12 - 0.075);
  float hl = pow(0.5 + 0.5 * sin(edge * 6.0), 8.0) * edge;
  o.rgb += hl * vec3(0.4, 0.3, 0.5);
  o = clamp(o, 0.0, 1.0);

  vec4 col = mix(o, vec4(o.rgb * 0.8 + 0.2, alpha), 0.3);
  col.rgb += pow(edge * 1.2, 4.0) * vec3(0.6, 0.7, 0.8);
  col.a = min(col.a + 0.4, 1.0);
  gl_FragColor = col;
}`;

function Liquid({ onReady }) {
  const logo = useLoader(TextureLoader, "/logo.png");
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_resolution: { value: new Vector2() }, u_logo: { value: logo },
  }), [logo]);
  const first = useRef(true);
  useFrame(({ clock }) => {
    uniforms.u_time.value = clock.elapsedTime;
    uniforms.u_resolution.value.set(size.width * dpr, size.height * dpr);
    if (first.current) { first.current = false; onReady(); }
  });
  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthTest={false} />
    </mesh>
  );
}

export default function Intro({ onDone }) {
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t0 = performance.now();
    let timer;
    const loaded = () => {
      removeEventListener("pm:loaded", loaded);
      clearTimeout(cap);
      timer = setTimeout(() => setLeaving(true), Math.max(0, MIN_SHOW - (performance.now() - t0)));
    };
    const cap = setTimeout(loaded, MAX_WAIT);
    if (window.pmLoaded) loaded(); else addEventListener("pm:loaded", loaded);
    return () => { removeEventListener("pm:loaded", loaded); clearTimeout(cap); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    document.getElementById("intro").classList.add("leave");
    const t = setTimeout(onDone, LEAVE);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div className="intro-stage">
      <div className="liquid">
        <img className={ready ? "gone" : ""} src="/logo.png" alt="" />
        <Canvas flat linear dpr={[1, 2]} gl={{ antialias: false, alpha: true }}>
          <Suspense fallback={null}><Liquid onReady={() => setReady(true)} /></Suspense>
        </Canvas>
      </div>
      <div className="cap" role="status">Mapping ports…</div>
    </div>
  );
}
