// Light/dark toggle. Runs in <head> so the saved theme applies before first paint.
(function () {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem("pm-theme"); } catch {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  // Just signed in (/?intro): show the loading screen from the very first paint.
  if (/[?&]intro\b/.test(location.search)) root.classList.add("intro");

  const current = () => root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "plain theme-toggle";
    const label = () => {
      const next = current() === "dark" ? "light" : "dark";
      b.textContent = next === "dark" ? "Dark" : "Light";
      b.setAttribute("aria-label", `Switch to ${next} mode`);
    };
    let fade = 0;
    b.addEventListener("click", () => {
      // Colours glide for ~0.9s while the shader gradient morphs to the new palette (Scene.jsx).
      root.classList.add("theme-anim");
      clearTimeout(fade);
      fade = setTimeout(() => root.classList.remove("theme-anim"), 950);
      root.dataset.theme = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem("pm-theme", root.dataset.theme); } catch {}
      label();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", label);
    label();
    document.body.append(b);
  });
})();
