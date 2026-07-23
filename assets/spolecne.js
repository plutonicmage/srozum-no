// ═══ Srozuměno · sdílené utility ═══════════════════════════════
// Cookie lišta (souhlas/odmítnutí), rok v patičce, stav Plus.

// Rok v patičce
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-rok]").forEach(el => el.textContent = new Date().getFullYear());

  // ── Cookie lišta ──
  // Souhlas se ukládá do cookie "sz_souhlas" (rok platnost).
  // TODO(REKLAMY): reklamní skripty načítej AŽ po souhlasu — viz
  // funkce nactiReklamy() níže, zavolá se jen při hodnotě "ano".
  const souhlas = ziskejCookie("sz_souhlas");
  if (!souhlas) zobrazCookieListu();
  else if (souhlas === "ano") nactiReklamy();

  // ── Stav Plus ──
  // Session cookie "sz_plus" nastavuje /api/platby po úspěšné platbě
  // (podepsaný token). Frontend jen přepíná vzhled — skutečné
  // ověření dělá vždy server.
  if (ziskejCookie("sz_plus")) document.body.classList.add("plus");
});

function ziskejCookie(nazev) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + nazev + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function zobrazCookieListu() {
  const el = document.createElement("div");
  el.id = "cookie-lista";
  el.innerHTML = `
    <span style="flex:1;min-width:200px">Používáme technické cookies a — pokud dovolíš — cookies reklamních systémů, díky kterým je Srozuměno zdarma. <a href="/cookies">Podrobnosti</a></span>
    <button class="btn svetly" id="ck-ano">Povolit</button>
    <button class="btn ghost" id="ck-ne" style="border-color:#fff;color:#fff">Jen nutné</button>`;
  document.body.appendChild(el);
  document.getElementById("ck-ano").onclick = () => { ulozSouhlas("ano"); nactiReklamy(); };
  document.getElementById("ck-ne").onclick = () => ulozSouhlas("ne");
}

function ulozSouhlas(hodnota) {
  document.cookie = `sz_souhlas=${hodnota}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.getElementById("cookie-lista")?.remove();
}

function nactiReklamy() {
  // TODO(REKLAMY): sem vlož načtení skriptu reklamní sítě, např.:
  // const s=document.createElement("script");
  // s.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXX";
  // s.async=true; s.crossOrigin="anonymous"; document.head.appendChild(s);
}
