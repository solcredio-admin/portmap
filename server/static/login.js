// Login page motion.
// Sign in: the password is checked first; only when it's accepted does the screen dim
// and the logo glide from the card to the centre, landing exactly where the dashboard's
// intro starts. A wrong password never animates.
// Arrival after sign-out (/login?out): the reverse, the centred logo flies back into the card.
// Without JS the form posts normally.
(function () {
  const form = document.querySelector(".login form");
  const root = document.documentElement;
  if (!form || !window.fetch) { root.classList.remove("out"); return; }
  const ERRORS = { 1: "Wrong credentials.", 2: "Too many attempts. Try again in 15 minutes." };
  const DURATION = 750;  // matches .fly / .curtain in style.css
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const size = () => Math.min(Math.min(innerWidth, innerHeight) * 0.56, 320);  // = .liquid in the intro
  const shownLogo = () => [...form.querySelectorAll(".logo")].find((l) => l.offsetParent) || form.querySelector(".logo");

  // Logo flight between the card and the centre. The image is decoded and its start
  // state painted before anything moves, so the flight is never skipped.
  async function flight(toCentre) {
    const logo = shownLogo();
    const r = logo.getBoundingClientRect();
    const s = size();
    const atCard = `translate(${r.left + r.width / 2 - innerWidth / 2}px, ${r.top + r.height / 2 - innerHeight / 2}px) scale(${r.width / s})`;
    const curtain = document.createElement("div");
    curtain.className = "curtain";
    curtain.style.opacity = toCentre ? "0" : "1";
    const fly = document.createElement("img");
    fly.className = "fly";
    fly.alt = "";
    fly.src = logo.src;
    // Rendered at full size and scaled down at the card, so it stays sharp while growing.
    Object.assign(fly.style, {
      width: s + "px", height: s + "px",
      left: innerWidth / 2 - s / 2 + "px", top: innerHeight / 2 - s / 2 + "px",
      transform: toCentre ? atCard : "none",
    });
    try { await fly.decode(); } catch {}
    document.body.append(curtain, fly);
    logo.style.visibility = "hidden";
    if (toCentre) root.classList.add("leaving");
    root.classList.remove("out");
    await frames();
    fly.style.transform = toCentre ? "none" : atCard;
    curtain.style.opacity = toCentre ? "1" : "0";
    await wait(DURATION);
    return () => { curtain.remove(); fly.remove(); logo.style.visibility = ""; };
  }

  // Arriving from sign-out: start dimmed with the logo centred, then fly it home.
  if (root.classList.contains("out")) {
    history.replaceState(null, "", "/login");
    root.classList.add("leaving");  // form contents start hidden, fade in after the flight
    flight(false).then((cleanup) => { cleanup(); root.classList.remove("leaving"); });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    let url;
    try {
      // Follows the server's 303: to "/?intro" when signed in, "/login?e=N" when not.
      const res = await fetch("/login", { method: "POST", body: new URLSearchParams(new FormData(form)), credentials: "same-origin" });
      url = new URL(res.url);
    } catch {
      return form.submit();  // network hiccup: let the browser do a plain post
    }
    if (url.pathname === "/") {
      await flight(true);
      return location.replace("/?intro");
    }
    btn.disabled = false;
    btn.textContent = "Sign in";
    form.querySelector(".err").textContent = ERRORS[url.searchParams.get("e")] || ERRORS[1];
    const pw = form.querySelector("input[type=password]");
    pw.value = "";
    pw.focus();
  });
})();
