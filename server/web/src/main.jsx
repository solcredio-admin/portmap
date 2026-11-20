// Dashboard logic stays plain DOM (dashboard.js); React + R3F only draw the
// WebGL layers: the scroll-driven gradient behind it and the post-login intro.
import "./dashboard.js";
import { Component } from "react";
import { createRoot } from "react-dom/client";
import Scene from "./Scene.jsx";
import Intro from "./Intro.jsx";

// No WebGL (old GPU, disabled, context lost) → render nothing; CSS background remains.
class Quiet extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

createRoot(document.getElementById("scene")).render(<Quiet><Scene /></Quiet>);

const introEl = document.getElementById("intro");
if (location.search) history.replaceState(null, "", location.pathname);  // drop ?intro: a reload skips it
if (document.documentElement.classList.contains("intro")) {
  const done = () => {
    document.documentElement.classList.remove("intro");
    document.body.classList.add("reveal");
    setTimeout(() => document.body.classList.remove("reveal"), 1600);  // polls rebuild cards; don't replay
    root.unmount();  // frees the intro's WebGL context
    introEl.remove();
  };
  const root = createRoot(introEl);
  root.render(<Quiet onFail={() => setTimeout(done)}><Intro onDone={done} /></Quiet>);
} else {
  introEl.remove();
}
