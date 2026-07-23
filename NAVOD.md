# Srozuměno — NÁVOD: nasazení a spuštění

## Rychlé nasazení (nová verze webu)
1. GitHub → repozitář → **Add file → Upload files** → přetáhni VŠECHNY soubory
   a složky (`api`, `assets`, `rady`, všechna `.html`, `vercel.json`) → **Commit**.
   Pozor: složky se musí nahrát jako složky (api/kontrola.js, assets/styl.css).
2. Vercel se přenasadí sám (Deployments → Ready).
3. Ověř: `/` (landing) · `/kontrola` (tok) · `/vzory` · `/plus` · `/ucet`
   · `/api/kontrola` → `{"chyba":"Použij metodu POST."}`

## Env proměnné (Vercel → Settings → Environment Variables)
| Proměnná | Povinná | K čemu |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ hned | motor kontroly (console.anthropic.com) |
| `SZ_TAJEMSTVI` | ✅ hned | podpis sessions — vlož dlouhý náhodný řetězec (např. 40+ znaků) |
| `WEB_URL` | ✅ hned | adresa webu bez lomítka, např. `https://srozum-no.vercel.app` |
| `PLATBY_POSKYTOVATEL` | při platbách | `stripe` nebo `comgate` |
| `STRIPE_SECRET_KEY`, `STRIPE_CENA_MESIC`, `STRIPE_CENA_ROK`, `STRIPE_WEBHOOK_SECRET` | Stripe | viz TODO(PLATBY/Stripe) v `api/platby.js` |
| `COMGATE_MERCHANT`, `COMGATE_SECRET` | Comgate | viz TODO(PLATBY/Comgate) v `api/platby.js` |
| `RESEND_API_KEY`, `EMAIL_OD`, `EMAIL_OSTRY=1` | e-maily | magic link přihlášení (resend.com); bez nich běží testovací režim |

Po každé změně env: Deployments → ⋯ → **Redeploy**.

## Platby — zapnutí krok za krokem
**Stripe (rychlejší start, karta):**
1. stripe.com → účet → aktivace plateb (IČO, účet).
2. Products → Add product → „Srozuměno Plus“ → dvě ceny: 149 CZK/month,
   990 CZK/year (recurring) → zkopíruj `price_…` do env.
3. Developers → API keys → `sk_…` do `STRIPE_SECRET_KEY`.
4. Developers → Webhooks → Add endpoint `WEB_URL/api/platby?akce=webhook`,
   události `checkout.session.completed` a `customer.subscription.deleted`
   → `whsec_…` do `STRIPE_WEBHOOK_SECRET` → dokonči TODO(PLATBY/Stripe)
   ověření podpisu ve `zpracujWebhook` (návod v komentáři).
5. Test: Stripe „Test mode“ + testovací karta 4242 4242 4242 4242 →
   nákup na /plus musí skončit na /ucet?stav=aktivni a odemknout vzory.

**Comgate (české metody, bez recurring):**
1. comgate.cz → registrace obchodníka (IČO), schválení pár dní.
2. Portál → propojení obchodu → `COMGATE_MERCHANT` + `COMGATE_SECRET` do env,
   notifikační URL `WEB_URL/api/platby?akce=webhook`.
3. `PLATBY_POSKYTOVATEL=comgate`. Tarify se účtují jako jednorázové platby
   na 1 měsíc / 1 rok (bez automatické obnovy).

## Reklamy — TODO(REKLAMY)
1. Požádej: adsense.google.com (a zvaž sklik.cz). Schválení dny až týdny;
   pomáhá obsah (Fáze 3 — články) a pár dní provozu.
2. Po schválení: kód sítě vlož do `assets/spolecne.js` → funkce
   `nactiReklamy()` (načítá se až po souhlasu s cookies — nutné pro GDPR).
3. Kódy jednotek vlož do jednotlivých `div.ad-slot` (označené TODO(REKLAMY)
   v HTML). Plus uživatelům se plochy skrývají samy.

## Denní limit — TODO(LIMIT)
Výchozí: cookie (obejitelná smazáním). Pro ostrý provoz: Vercel → Storage →
Create KV → propojit s projektem → v `api/kontrola.js` doplň KV větev dle
komentáře TODO(LIMIT) (klíč `limit:{ip}:{den}`, TTL 86400).

## E-maily (magic link) — TODO(EMAIL)
resend.com → API key → `RESEND_API_KEY` + `EMAIL_OD` (ověřená doména) +
`EMAIL_OSTRY=1`. Do té doby /ucet běží v testovacím režimu (odkaz se ukáže
přímo na stránce — pro vývoj OK, pro ostrý provoz vypnout nastavením env).

## Checklist před ostrým startem
- [ ] `[DOPLŇ: …]` v podminky/soukromi/kontakt nahrazeno (jméno, IČO, e-mail)
- [ ] Vlastní doména připojená (Vercel → Domains) a v `WEB_URL`
- [ ] Platby otestované v test režimu (nákup → aktivace → zrušení)
- [ ] `EMAIL_OSTRY=1` nastaveno (testovací odkazy se nezobrazují)
- [ ] KV limit zapnutý
- [ ] Reklamní kódy vložené (po schválení)
- [ ] Fáze 3: články /rady doplněné (pomáhá i schválení AdSense)

## Když něco nejde
- 404 na /api → složka `api` chybí v kořenu repozitáře
- „Chybí SZ_TAJEMSTVI / ANTHROPIC_API_KEY“ → env + Redeploy
- „Platby zatím nejsou zapnuté“ → chybí klíče poskytovatele (viz výše)
- Web ukazuje kód místo stránky → zkontroluj, že index.html začíná
  `<!DOCTYPE html>` a Root Directory ve Vercelu je prázdné
