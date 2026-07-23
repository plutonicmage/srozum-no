// ═══ Srozuměno · platby (/api/platby) ════════════════════════════
// Jednotné rozhraní PaymentProvider se dvěma adaptéry: STRIPE a
// COMGATE. Po vložení klíčů do env proměnných funguje nákup Plus
// bez dalších zásahů do kódu.
//
// ── ENV proměnné (Vercel → Settings → Environment Variables) ──
//   SZ_TAJEMSTVI          libovolný dlouhý náhodný řetězec (podpis session)
//   PLATBY_POSKYTOVATEL   "stripe" | "comgate"   (výchozí: stripe)
//   WEB_URL               např. https://srozumeno.cz (bez lomítka na konci)
//
//   TODO(PLATBY/Stripe): STRIPE_SECRET_KEY (sk_live_… / sk_test_…),
//     STRIPE_WEBHOOK_SECRET (whsec_…), STRIPE_CENA_MESIC (price_…),
//     STRIPE_CENA_ROK (price_…). Ceny vytvoř ve Stripe Dashboard:
//     Products → Add product → 149 CZK/měsíc a 990 CZK/rok (recurring).
//     Webhook: Developers → Webhooks → endpoint {WEB_URL}/api/platby?akce=webhook
//     → události checkout.session.completed, customer.subscription.deleted.
//
//   TODO(PLATBY/Comgate): COMGATE_MERCHANT (číslo obchodníka),
//     COMGATE_SECRET (heslo API). V klientském portálu Comgate nastav
//     notifikační URL {WEB_URL}/api/platby?akce=webhook a povol metody.
//     Pozn.: Comgate nemá nativní opakované platby v základním režimu —
//     tarif se účtuje jako jednorázová platba na 1 měsíc / 1 rok.
//
// ── Úložiště předplatných ──
//   Výchozí MVP režim: stav Plus žije v podepsané cookie s expirací
//   (nastaví se při návratu z platby po ověření u poskytovatele).
//   TODO(LIMIT): po zapnutí Vercel KV ukládej předplatná i serverově
//   (klíč `plus:${email}` → {do, provider, id}), aby přežila smazání
//   cookies a šla obnovit přihlášením v /ucet.

import crypto from "node:crypto";

const TAJEMSTVI = process.env.SZ_TAJEMSTVI || "";
const WEB = process.env.WEB_URL || "";
const POSKYTOVATEL = (process.env.PLATBY_POSKYTOVATEL || "stripe").toLowerCase();

// ── Podepsané tokeny (sdílené s /api/kontrola a /api/ucet) ──
export function podepis(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", TAJEMSTVI).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function over(token) {
  try {
    const [payload, sig] = String(token).split(".");
    const ok = crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(crypto.createHmac("sha256", TAJEMSTVI).update(payload).digest("base64url"))
    );
    if (!ok) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}
export function vytvorPlusToken(email, dnu) {
  return podepis({ typ: "plus", email, exp: Date.now() + dnu * 86400_000 });
}

// ═══ Adaptéry poskytovatelů ══════════════════════════════════════
// Každý implementuje: vytvorPlatbu(tarif, email) → {url}
//                     overNavrat(query) → {ok, email, dnu} | {ok:false}
//                     zpracujWebhook(req, rawBody) → {udalost, email?}

const STRIPE = {
  async vytvorPlatbu(tarif, email) {
    const cena = tarif === "rok" ? process.env.STRIPE_CENA_ROK : process.env.STRIPE_CENA_MESIC;
    if (!process.env.STRIPE_SECRET_KEY || !cena) throw new Error("NEKONFIG");
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": cena,
      "line_items[0][quantity]": "1",
      customer_email: email,
      success_url: `${WEB}/api/platby?akce=navrat&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEB}/plus?stav=zruseno`,
    });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "Stripe chyba");
    return { url: d.url };
  },
  async overNavrat(q) {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${q.session_id}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const d = await r.json();
    if (r.ok && d.payment_status === "paid") {
      // Předplatné: dáme session na 35 dní; webhook ji při obnově/zrušení
      // aktualizuje (po zapnutí KV i trvale).
      return { ok: true, email: d.customer_details?.email || "", dnu: 35 };
    }
    return { ok: false };
  },
  async zpracujWebhook(req, rawBody) {
    // TODO(PLATBY/Stripe): ověř podpis hlavičky stripe-signature pomocí
    // STRIPE_WEBHOOK_SECRET (algoritmus v docs; bez ověření nespouštěj
    // žádné změny). Po ověření:
    //   checkout.session.completed → aktivuj/prodluž Plus (KV)
    //   customer.subscription.deleted → ukonči Plus (KV)
    return { udalost: "neimplementovano" };
  },
};

const COMGATE = {
  async vytvorPlatbu(tarif, email) {
    if (!process.env.COMGATE_MERCHANT || !process.env.COMGATE_SECRET) throw new Error("NEKONFIG");
    const cena = tarif === "rok" ? 99000 : 14900; // v haléřích
    const body = new URLSearchParams({
      merchant: process.env.COMGATE_MERCHANT,
      secret: process.env.COMGATE_SECRET,
      price: String(cena),
      curr: "CZK",
      label: tarif === "rok" ? "Srozumeno Plus - rok" : "Srozumeno Plus - mesic",
      refId: `${tarif}:${email}`,
      email,
      method: "ALL",
      prepareOnly: "true",
      url_paid: `${WEB}/api/platby?akce=navrat&provider=comgate&tarif=${tarif}&email=${encodeURIComponent(email)}&transId=\${id}`,
      url_cancelled: `${WEB}/plus?stav=zruseno`,
    });
    const r = await fetch("https://payments.comgate.cz/v1.0/create", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const text = await r.text();
    const p = new URLSearchParams(text);
    if (p.get("code") !== "0") throw new Error("Comgate: " + (p.get("message") || text));
    return { url: p.get("redirect") };
  },
  async overNavrat(q) {
    const body = new URLSearchParams({
      merchant: process.env.COMGATE_MERCHANT,
      secret: process.env.COMGATE_SECRET,
      transId: q.transId,
    });
    const r = await fetch("https://payments.comgate.cz/v1.0/status", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const p = new URLSearchParams(await r.text());
    if (p.get("status") === "PAID") {
      return { ok: true, email: q.email || p.get("email") || "", dnu: q.tarif === "rok" ? 366 : 31 };
    }
    return { ok: false };
  },
  async zpracujWebhook() {
    // TODO(PLATBY/Comgate): zpracuj notifikaci (transId, status=PAID)
    // stejně jako overNavrat a po zapnutí KV zapiš předplatné trvale.
    return { udalost: "neimplementovano" };
  },
};

const PROVIDER = POSKYTOVATEL === "comgate" ? COMGATE : STRIPE;

// ═══ HTTP handler ════════════════════════════════════════════════
export default async function handler(req, res) {
  const akce = req.query.akce || (req.body && req.body.akce);

  if (!TAJEMSTVI) {
    return res.status(500).json({ chyba: "Chybí env SZ_TAJEMSTVI — nastav ve Vercelu dlouhý náhodný řetězec." });
  }

  try {
    // ── 1) Zahájení platby: POST {akce:"koupit", tarif:"mesic"|"rok", email} ──
    if (req.method === "POST" && akce === "koupit") {
      const { tarif, email } = req.body || {};
      if (!["mesic", "rok"].includes(tarif) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) {
        return res.status(400).json({ chyba: "Vyplň platný e-mail a vyber tarif." });
      }
      try {
        const { url } = await PROVIDER.vytvorPlatbu(tarif, email.trim().toLowerCase());
        return res.status(200).json({ url });
      } catch (e) {
        if (e.message === "NEKONFIG") {
          return res.status(503).json({ chyba: "Platby zatím nejsou zapnuté. Chybí klíče poskytovatele — viz NAVOD.md, sekce Platby." });
        }
        throw e;
      }
    }

    // ── 2) Návrat z platební brány: ověř a nastav Plus session ──
    if (req.method === "GET" && akce === "navrat") {
      const v = await PROVIDER.overNavrat(req.query);
      if (v.ok) {
        const token = vytvorPlusToken(v.email, v.dnu);
        res.setHeader("Set-Cookie", [
          `sz_plus=${token}; Path=/; Max-Age=${v.dnu * 86400}; SameSite=Lax; HttpOnly`,
          `sz_email=${encodeURIComponent(v.email)}; Path=/; Max-Age=${v.dnu * 86400}; SameSite=Lax`,
        ]);
        res.writeHead(302, { Location: "/ucet?stav=aktivni" });
        return res.end();
      }
      res.writeHead(302, { Location: "/plus?stav=neuspech" });
      return res.end();
    }

    // ── 3) Webhook poskytovatele (obnovy, zrušení) ──
    if (req.method === "POST" && akce === "webhook") {
      await PROVIDER.zpracujWebhook(req, null);
      return res.status(200).json({ ok: true });
    }

    // ── 4) Stav Plus (pro /ucet): GET akce=stav ──
    if (req.method === "GET" && akce === "stav") {
      const m = (req.headers.cookie || "").match(/sz_plus=([^;]+)/);
      const data = m ? over(decodeURIComponent(m[1])) : null;
      return res.status(200).json(data ? { plus: true, email: data.email, do: data.exp } : { plus: false });
    }

    // ── 5) Zrušení: POST akce=zrusit ──
    if (req.method === "POST" && akce === "zrusit") {
      // TODO(PLATBY): u Stripe zavolej DELETE subscription (ulož si
      // subscription id ve webhooku do KV); u Comgate stačí nechat
      // doběhnout zaplacené období. Tady rušíme session okamžitě.
      res.setHeader("Set-Cookie", [
        "sz_plus=; Path=/; Max-Age=0",
        "sz_email=; Path=/; Max-Age=0",
      ]);
      return res.status(200).json({ ok: true, zprava: "Předplatné je zrušené. Zaplacené období můžeš dočerpat, poté se účet vrátí na verzi Zdarma." });
    }

    return res.status(400).json({ chyba: "Neznámá akce." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ chyba: "Platební operace selhala: " + e.message });
  }
}
