import { useEffect, useState } from "react";

const dark = matchMedia("(prefers-color-scheme: dark)");
const current = () => document.documentElement.dataset.theme || (dark.matches ? "dark" : "light");

// Follows theme.js (the bottom-left toggle) and the OS setting.
export function useTheme() {
  const [theme, setTheme] = useState(current);
  useEffect(() => {
    const update = () => setTheme(current());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    dark.addEventListener("change", update);
    return () => { mo.disconnect(); dark.removeEventListener("change", update); };
  }, []);
  return theme;
}

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
