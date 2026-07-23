# Srozuměno — návod na publikaci (dnes, ~1 hodina)

## Co v balíčku je
- `index.html` — celý web (nahrání → reklamní brána → analýza → brána → zpráva)
- `api/kontrola.js` — backend: drží API klíč, právní checklisty, ověřování zákonů, denní limit
- `soukromi.html`, `podminky.html` — povinné stránky (doplň žlutě označená místa: jméno/IČO/e-mail)
- Reklamní plochy jsou připravené, zapneš je později jedním kódem (krok 6)

## 1) API klíč pro analýzu (10 min)
1. Jdi na **console.anthropic.com** → zaregistruj se.
2. V **Billing** dobij kredit (stačí $5–10 na start; jedna kontrola stojí jednotky Kč).
3. V **API Keys** vytvoř klíč a zkopíruj si ho (ukáže se jen jednou).

## 2) Nahraj projekt na GitHub (10 min)
1. Zaregistruj se na **github.com** → tlačítko **New repository** → název `srozumeno`, nech Public, **Create**.
2. Klikni **uploading an existing file** → přetáhni tam VŠECHNY soubory z této složky
   (pozor: složka `api` se musí nahrát i s podsložkou — přetáhni celou složku, ne jen soubory).
3. **Commit changes**.

## 3) Publikace na Vercel (10 min)
1. Jdi na **vercel.com** → **Sign up with GitHub**.
2. **Add New… → Project** → vyber repozitář `srozumeno` → **Import**.
3. Než dáš Deploy: rozbal **Environment Variables** a přidej:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (klíč z kroku 1)
4. **Deploy**. Za minutu máš web živý na adrese `srozumeno-XXXX.vercel.app`.

## 4) Otestuj (5 min)
- Otevři adresu, nahraj testovací smlouvu (PDF do 3 MB), projdi celý tok až ke zprávě.
- Druhá kontrola tentýž den má skončit hláškou o denním limitu — to je správně.
- Když se objeví chyba o chybějícím klíči: Vercel → Settings → Environment Variables → zkontroluj název a znovu **Redeploy**.

## 5) Vlastní doména (volitelně dnes, 15 min)
1. Kup doménu (např. **srozumeno.cz**) u Wedos/Forpsi (~250 Kč/rok).
2. Vercel → projekt → **Settings → Domains** → přidej doménu a nastav DNS podle pokynů (u registrátora vložíš 1–2 záznamy). Funguje do pár hodin.

## 6) Reklamy (za pár dní až týdnů — až přijde schválení)
1. Dnes o ně jen zažádej: **adsense.google.com** → přidat web. Pro vyšší šanci schválení
   doplň na web pár článků (řekni si, napíšu je) a nech web pár dní běžet.
   Souběžně zvaž **Sklik** (sklik.cz) — na český obsah často platí líp.
2. Po schválení: vlož kód AdSense do `<head>` v `index.html`
   (místo je označené komentářem „REKLAMNÍ SÍŤ") a kódy jednotek do `div.ad-slot` ploch.
3. Nasazení změny: nahraješ upravený soubor na GitHub (Add file → Upload) — Vercel
   web sám znovu publikuje.

## Denní limit — jak funguje a co později
- Limit 1/den hlídá server přes cookie. Běžného uživatele zastaví; kdo umí mazat
  cookies, obejde ho. Až poroste návštěvnost, přidáme serverovou evidenci
  (Upstash KV, zdarma do slušného objemu) — řekni si, připravím.

## Kdyby něco nefungovalo
- Chyba „Analýza selhala" → zkontroluj kredit na console.anthropic.com.
- Prázdná stránka po Deploy → v GitHubu ověř, že `api/kontrola.js` je ve složce `api`.
- Cokoli jiného → pošli mi text chyby, opravím.
