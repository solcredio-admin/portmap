// Sign-in transition: the moment the form is sent, the screen dims and the logo
// glides from the card to the centre, landing exactly where the dashboard's intro
// starts, so the page switch is invisible. Without JS (or with reduced motion)
// the form posts normally.
(function () {
  const form = document.querySelector(".login form");
  if (!form || !window.fetch || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ERRORS = { 1: "Wrong credentials.", 2: "Too many attempts. Try again in 15 minutes." };
  const DURATION = 750;  // matches .fly / .curtain in style.css

  function play() {
    const logo = form.querySelector(".logo");
    const r = logo.getBoundingClientRect();
    const size = Math.min(Math.min(innerWidth, innerHeight) * 0.56, 320);  // = .liquid in the intro
    const curtain = document.createElement("div");
    curtain.className = "curtain";
    const fly = document.createElement("img");
    fly.className = "fly";
    fly.alt = "";
    fly.src = logo.dataset.full || "/logo.png";
    // Rendered at full size and scaled down to the card logo, so it stays sharp while growing.
    Object.assign(fly.style, {
      width: size + "px", height: size + "px",
      left: innerWidth / 2 - size / 2 + "px", top: innerHeight / 2 - size / 2 + "px",
      transform: `translate(${r.left + r.width / 2 - innerWidth / 2}px, ${r.top + r.height / 2 - innerHeight / 2}px) scale(${r.width / size})`,
    });
    document.body.append(curtain, fly);
    logo.style.visibility = "hidden";
    document.documentElement.classList.add("leaving");
    fly.getBoundingClientRect();  // commit the start state before transitioning
    fly.style.transform = "none";
    curtain.style.opacity = "1";
    return {
      done: new Promise((res) => setTimeout(res, DURATION)),
      undo() {
        curtain.remove(); fly.remove();
        logo.style.visibility = "";
        document.documentElement.classList.remove("leaving");
      },
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    const anim = play();
    let url = null;
    try {
      // Follows the server's 303: to "/?intro" when signed in, "/login?e=N" when not.
      const res = await fetch("/login", { method: "POST", body: new URLSearchParams(new FormData(form)), credentials: "same-origin" });
      url = new URL(res.url);
    } catch {
      anim.undo();
      return form.submit();  // network hiccup: let the browser do a plain post
    }
    if (url.pathname === "/") {
      await anim.done;
      return location.replace("/?intro");
    }
    anim.undo();
    btn.disabled = false;
    form.querySelector(".err").textContent = ERRORS[url.searchParams.get("e")] || ERRORS[1];
    const pw = form.querySelector("input[type=password]");
    pw.value = "";
    pw.focus();
  });
})();
