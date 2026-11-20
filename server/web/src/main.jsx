// Dashboard logic stays plain DOM (dashboard.js); React + R3F only draw the
// WebGL layers: the scroll-driven gradient behind it and the post-login intro.
import "./dashboard.js";
import { Component } from "react";
import { createRoot } from "react-dom/client";
import Scene from "./Scene.jsx";
import Intro from "./Intro.jsx";
import Lift from "./Lift.jsx";

// Paper Shaders injects an inline <style> unless one tagged data-paper-shader exists;
// our CSP forbids inline styles, so claim the slot with an empty tag (rules are in style.css).
const paperSlot = document.createElement("style");
paperSlot.setAttribute("data-paper-shader", "");
document.head.append(paperSlot);

// No WebGL (old GPU, disabled, context lost) → render nothing; CSS background remains.
class Quiet extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

let sceneMounted = false;
const mountScene = () => {
  if (sceneMounted) return;
  sceneMounted = true;
  const scene = document.getElementById("scene");
  createRoot(scene).render(<Quiet><Scene /></Quiet>);
  createRoot(document.getElementById("lift")).render(<Quiet><Lift /></Quiet>);
  // Fade the WebGL gradient in over its CSS stand-in (body background) once it has drawn.
  setTimeout(() => scene.classList.add("on"), 120);
};

const introEl = document.getElementById("intro");
if (location.search) history.replaceState(null, "", location.pathname);  // drop ?intro: a reload skips it
if (document.documentElement.classList.contains("intro")) {
  // The dashboard stays invisible under the intro (style.css) and rises in exactly when
  // the logo starts clearing, beneath the fading overlay: one motion, never shown twice.
  // The WebGL gradient mounts only after the rise: its shader compile blocks the main
  // thread, which delayed the rise and made it look like a second, late pull-up.
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    document.body.classList.add("reveal");
    setTimeout(() => document.body.classList.remove("reveal"), 1500);  // after the rise ends
    setTimeout(mountScene, 1300);
  };
  const done = () => {
    document.documentElement.classList.remove("intro");
    root.unmount();  // frees the intro's WebGL context
    introEl.remove();
  };
  const root = createRoot(introEl);
  root.render(<Quiet onFail={() => setTimeout(() => { reveal(); done(); })}><Intro onLeave={reveal} onDone={done} /></Quiet>);
} else {
  introEl.remove();
  mountScene();
}
