// ═══ Srozuměno · účet (/api/ucet) ════════════════════════════════
// Přihlášení bez hesel: magic link na e-mail.
//   POST akce=zadost {email} → pošle odkaz (TODO(EMAIL) níže)
//   GET  akce=overeni&token=… → nastaví session a přesměruje do /ucet
//   GET  akce=stav → {prihlasen, email, plus}
//   POST akce=odhlasit → smaže session
//
// ENV: SZ_TAJEMSTVI (podpisy), WEB_URL.
// TODO(EMAIL): pro odesílání napoj službu (Resend/Mailgun/SMTP) ve
//   funkci poslejEmail(). Bez konfigurace běží TESTOVACÍ REŽIM:
//   odkaz se vrátí přímo v odpovědi (ať jde vše ověřit před ostrým
//   startem) — v produkci režim vypni nastavením env EMAIL_OSTRY=1.

import { podepis, over } from "./platby.js";

const WEB = process.env.WEB_URL || "";

async function poslejEmail(email, odkaz) {
  // TODO(EMAIL): příklad pro Resend (resend.com, zdarma do 3k e-mailů/měs):
  //   await fetch("https://api.resend.com/emails", { method:"POST",
  //     headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"content-type":"application/json"},
  //     body: JSON.stringify({ from:"Srozuměno <ucet@srozumeno.cz>", to: email,
  //       subject:"Přihlášení do Srozuměno",
  //       text:`Přihlas se jedním kliknutím: ${odkaz}\nOdkaz platí 15 minut.` })});
  if (process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_OD || "Srozumeno <onboarding@resend.dev>",
        to: email,
        subject: "Přihlášení do Srozuměno",
        text: `Přihlas se jedním kliknutím: ${odkaz}\n\nOdkaz platí 15 minut. Pokud jsi o něj nežádal, ignoruj tento e-mail.`,
      }),
    });
    return true;
  }
  return false; // e-mail služba nenakonfigurována → testovací režim
}

export default async function handler(req, res) {
  const akce = req.query.akce || (req.body && req.body.akce);
  if (!process.env.SZ_TAJEMSTVI) {
    return res.status(500).json({ chyba: "Chybí env SZ_TAJEMSTVI." });
  }

  try {
    if (req.method === "POST" && akce === "zadost") {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ chyba: "Zadej platný e-mail." });
      }
      const token = podepis({ typ: "login", email, exp: Date.now() + 15 * 60_000 });
      const odkaz = `${WEB}/api/ucet?akce=overeni&token=${encodeURIComponent(token)}`;
      const odeslano = await poslejEmail(email, odkaz);
      if (odeslano || process.env.EMAIL_OSTRY === "1") {
        return res.status(200).json({ ok: true, zprava: "Poslali jsme ti přihlašovací odkaz na e-mail. Platí 15 minut." });
      }
      // Testovací režim (bez e-mail služby): vrať odkaz rovnou.
      return res.status(200).json({ ok: true, testovaci: true, odkaz, zprava: "Testovací režim (e-mail služba není napojená): použij tento odkaz." });
    }

    if (req.method === "GET" && akce === "overeni") {
      const data = over(req.query.token);
      if (!data || data.typ !== "login") {
        res.writeHead(302, { Location: "/ucet?stav=neplatny" });
        return res.end();
      }
      const session = podepis({ typ: "session", email: data.email, exp: Date.now() + 30 * 86400_000 });
      res.setHeader("Set-Cookie", [
        `sz_session=${session}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax; HttpOnly`,
        `sz_email=${encodeURIComponent(data.email)}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax`,
      ]);
      res.writeHead(302, { Location: "/ucet?stav=prihlasen" });
      return res.end();
    }

    if (req.method === "GET" && akce === "stav") {
      const c = req.headers.cookie || "";
      const s = c.match(/sz_session=([^;]+)/);
      const p = c.match(/sz_plus=([^;]+)/);
      const sess = s ? over(decodeURIComponent(s[1])) : null;
      const plus = p ? over(decodeURIComponent(p[1])) : null;
      return res.status(200).json({
        prihlasen: !!sess,
        email: sess?.email || plus?.email || null,
        plus: !!plus,
        plusDo: plus?.exp || null,
      });
    }

    if (req.method === "POST" && akce === "odhlasit") {
      res.setHeader("Set-Cookie", ["sz_session=; Path=/; Max-Age=0", "sz_email=; Path=/; Max-Age=0"]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ chyba: "Neznámá akce." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ chyba: "Operace účtu selhala." });
  }
}
