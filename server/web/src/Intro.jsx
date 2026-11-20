// Post-login loading screen: the logo turns to liquid metal, then clears into the
// dashboard. The metal is Paper Shaders' liquidMetal shader (github.com/paper-design/shaders,
// Apache-2.0), the engine behind paper-design/liquid-logo. Its logo pre-processing
// (a ~700 ms Poisson solve) is done once at build time: static/logo-liquid.png holds
// the result (R = edge gradient, G = opacity), so nothing heavy runs during sign-in.
import { ShaderMount } from "@paper-design/shaders-react";
import { getShaderColorFromString, liquidMetalFragmentShader, ShaderFitOptions } from "@paper-design/shaders";
import { useEffect, useState } from "react";

const HOLD = 2000;      // ms of liquid metal on screen before clearing out
const FAIL_HOLD = 1200; // ms if the metal can't load: still a proper beat, never a skip
const LEAVE = 800;      // ms: matches the .leave transition in style.css

// Versioned URLs from the page's placeholder markup, read before React replaces it.
const stage = document.getElementById("intro");
const LIQUID = stage?.dataset.liquid || "/logo-liquid.png";
const MARKS = [...(stage?.querySelectorAll("img.mark") || [])].map((i) => ({ src: i.getAttribute("src"), cls: i.className }));

const UNIFORMS = {
  u_image: LIQUID,
  u_isImage: true,
  u_shape: 0,
  u_colorBack: getShaderColorFromString("#00000000"),
  u_colorTint: getShaderColorFromString("#ffffff"),
  u_repetition: 2,
  u_softness: 0.1,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_distortion: 0.07,
  u_contour: 0.4,
  u_angle: 70,
  // sizing: fill the same square as the <img> it replaces
  u_fit: ShaderFitOptions.contain, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0,
  u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0,
};

export default function Intro({ onLeave, onDone }) {
  const [metal, setMetal] = useState(false);      // decoded and mounted: fade it in
  const [held, setHeld] = useState(false);
  const [loaded, setLoaded] = useState(() => !!window.pmLoaded);
  const leaving = held && loaded;

  useEffect(() => {
    const onLoaded = () => setLoaded(true);
    addEventListener("pm:loaded", onLoaded);
    const cap = setTimeout(() => setLoaded(true), 6000);  // slow /api/hosts: don't wait forever
    // Decode the metal's texture before showing it, so the cross-fade never stutters.
    const img = new Image();
    img.src = LIQUID;
    let t;
    img.decode()
      .then(() => requestAnimationFrame(() => requestAnimationFrame(() => setMetal(true))))
      .catch(() => { t = setTimeout(() => setHeld(true), FAIL_HOLD); });
    return () => { removeEventListener("pm:loaded", onLoaded); clearTimeout(cap); clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (!metal) return;
    const t = setTimeout(() => setHeld(true), HOLD);
    return () => clearTimeout(t);
  }, [metal]);

  useEffect(() => {
    if (!leaving) return;
    stage.classList.add("leave");
    onLeave();
    const t = setTimeout(onDone, LEAVE);
    return () => clearTimeout(t);
  }, [leaving, onLeave, onDone]);

  return (
    <div className="intro-stage">
      <div className="liquid">
        {MARKS.map((m) => <img key={m.src} className={m.cls + (metal ? " gone" : "")} src={m.src} alt="" decoding="sync" />)}
        <ShaderMount
          className={"metal" + (metal ? " on" : "")}
          fragmentShader={liquidMetalFragmentShader}
          uniforms={UNIFORMS}
          mipmaps={["u_image"]}
          speed={1}
        />
      </div>
      <div className="cap" role="status">Mapping ports…</div>
    </div>
  );
}
