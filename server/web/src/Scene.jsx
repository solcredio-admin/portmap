// Full-page ShaderGradient (github.com/ruucm/shadergradient, MIT) on an R3F canvas.
// frameloop="demand": frames are drawn only while the page scrolls (or the theme
// changes), so an open dashboard that nobody touches costs no GPU at all.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ShaderGradient } from "@shadergradient/react";
import { useEffect } from "react";
import { MathUtils, ShaderChunk } from "three";
import { reducedMotion, useTheme } from "./theme.js";

// Same shim ShaderGradientCanvas applies: its shaders still #include chunks newer three removed.
Object.assign(ShaderChunk, { uv2_pars_vertex: "", uv2_vertex: "", uv2_pars_fragment: "", encodings_fragment: "" });

const LOOK = {
  light: { color1: "#c6f36b", color2: "#f3efe6", color3: "#a9b8ff", brightness: 1.2 },
  dark: { color1: "#2c4207", color2: "#050607", color3: "#182452", brightness: 0.9 },
};

function ScrollDriver({ theme }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let until = 0, raf = 0;
    const loop = () => {
      invalidate();
      raf = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    const kick = (ms) => {
      until = Math.max(until, performance.now() + ms);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    kick(reducedMotion ? 0 : 2200);  // first paint + the camera settling in
    if (reducedMotion) return () => cancelAnimationFrame(raf);
    const onScroll = () => kick(900);
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [invalidate, theme]);

  // Scroll position turns and lifts the whole gradient; damped so it glides.
  useFrame(({ scene }, delta) => {
    if (reducedMotion) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? scrollY / max : 0;
    scene.rotation.z = MathUtils.damp(scene.rotation.z, p * 0.9, 4, delta);
    scene.position.y = MathUtils.damp(scene.position.y, p * 1.2, 4, delta);
  });
  return null;
}

export default function Scene() {
  const theme = useTheme();
  return (
    <Canvas
      frameloop="demand"
      dpr={0.8}  /* a soft gradient needs no retina pixels; ~3x cheaper per frame */
      camera={{ fov: 45 }}
      linear
      flat
      resize={{ offsetSize: true }}
      gl={{ antialias: false, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
    >
      <ScrollDriver theme={theme} />
      <ShaderGradient
        control="props"
        type="plane"
        animate={reducedMotion ? "off" : "on"}
        uSpeed={0.25}
        uStrength={3}
        uDensity={1.2}
        uFrequency={5.5}
        uAmplitude={1}
        positionX={-1.4}
        positionY={0}
        positionZ={0}
        rotationX={0}
        rotationY={10}
        rotationZ={50}
        cAzimuthAngle={180}
        cPolarAngle={90}
        cDistance={3.6}
        cameraZoom={1}
        reflection={0.1}
        lightType="3d"
        grain="off"
        {...LOOK[theme]}
      />
    </Canvas>
  );
}
