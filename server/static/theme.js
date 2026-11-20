// Light/dark toggle. Runs in <head> so the saved theme applies before first paint.
(function () {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem("pm-theme"); } catch {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

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
    b.addEventListener("click", () => {
      root.dataset.theme = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem("pm-theme", root.dataset.theme); } catch {}
      label();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", label);
    label();
    document.body.append(b);
  });
})();
