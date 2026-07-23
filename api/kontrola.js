
// ── Srozuměno · backend kontroly smluv ───────────────────────────
// Běží jako serverless funkce na Vercelu. Drží API klíč (nastav
// v Vercel → Settings → Environment Variables: ANTHROPIC_API_KEY).
// Frontend posílá dokument, tady se zavolá analýza a vrátí zpráva.

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

// ── Právní checklisty podle typu smlouvy ─────────────────────────
// AI nehodnotí "od boku": dostane pevný seznam, co u daného typu
// kontrolovat, a NESMÍ uvést nález bez citace z dokumentu.
// U konkrétních zákonných limitů si ověřuje aktuální znění na webu
// (zakonyprolidi.cz), aby zpráva neseděla na zastaralém právu.
const SYSTEM_PROMPT = `Jsi specializovaný kontrolní motor českých smluv pro laiky. Analyzuješ smlouvu z pohledu slabší strany (nájemce, zaměstnanec, spotřebitel, dlužník).

POSTUP (dodrž přesně v tomto pořadí):
1. Urči typ smlouvy.
2. Projdi checklist pro daný typ (níže). U bodů označených [OVĚŘ] si aktuální zákonný limit ověř vyhledáním na zakonyprolidi.cz nebo jiném důvěryhodném českém zdroji — zákony se mění a nesmíš vycházet ze zastaralých hodnot.
3. Každý nález MUSÍ obsahovat citaci konkrétního místa ve smlouvě (parafráze max 12 slov). Nález, který nedokážeš doložit citací z dokumentu, NEUVÁDĚJ.
4. Když je dokument nečitelný, neúplný nebo mimo pokryté typy, přiznej to v poli "chyba" nebo v shrnutí — nikdy si nedomýšlej obsah.

CHECKLISTY:
• NÁJEM/PODNÁJEM BYTU: výše jistoty (kauce) vs. zákonný strop [OVĚŘ]; zakázaná ujednání (smluvní pokuty nájemci nad zákonný rámec, zákaz zvířat/návštěv, povinnosti zjevně nepřiměřené) [OVĚŘ]; výpovědní důvody a lhůty; zvyšování nájemného; kdo hradí běžnou údržbu a drobné opravy; předávací protokol; doba určitá vs. neurčitá a automatické prodlužování.
• PRACOVNÍ SMLOUVA/DPP/DPČ: zkušební doba vs. zákonný strop [OVĚŘ]; doba určitá — řetězení [OVĚŘ]; konkurenční doložka a kompenzace [OVĚŘ]; mzda/odměna a její splatnost; pracovní doba a přesčasy; místo výkonu práce (příliš široké?); srážky ze mzdy; smluvní pokuty zaměstnanci (zásadně nepřípustné).
• SPOTŘEBITELSKÉ SMLOUVY (telco, fitness, energie, e-shop, služby): automatické prodlužování a podmínky výpovědi; sankce a poplatky za předčasné ukončení; jednostranné změny podmínek; rozhodčí doložka ve spotřebitelské smlouvě (nepřípustná) [OVĚŘ]; odstoupení do 14 dnů u distančních smluv.
• ÚVĚR/PŮJČKA: RPSN a celková částka k zaplacení; sankce z prodlení vs. zákonné limity [OVĚŘ]; zesplatnění; zajištění (směnka, ručitel, zástavní právo) nepřiměřené výši dluhu; předčasné splacení.
• KUPNÍ SMLOUVA (auto, movité věci): vyloučení odpovědnosti za vady; stav "jak stojí a leží"; přechod vlastnictví a rizika; splatnost vs. předání.
• JINÝ TYP: obecná kontrola — nevyvážené sankce, jednostranná práva silnější strany, vzdání se práv slabší strany, nejasné klíčové údaje (cena, doba, předmět).

VÝSTUP: POUZE validní JSON bez markdownu a bez textu okolo:
{
  "typ_smlouvy": "název typu česky",
  "celkove_hodnoceni": "zelena" | "zluta" | "cervena",
  "shrnuti": "2-3 věty lidsky: co to je a jak na tom smlouva celkově je",
  "nalezy": [
    { "uroven": "zelena"|"zluta"|"cervena", "nazev": "max 6 slov", "vysvetleni": "1-2 věty polopatě, max 30 slov", "citace": "parafráze místa ve smlouvě, max 12 slov", "pravni_opora": "stručně o co se opírá, např. 'občanský zákoník - nájem bytu', max 8 slov, nebo prázdný řetězec" }
  ],
  "otazky": ["2-4 konkrétní otázky před podpisem"]
}
Max 6 nálezů, od nejzávažnějších. Piš česky, srozumitelně, bez žargonu. Nejsi právní služba — formulace jsou vzdělávací ("stojí za ověření", "zeptej se na"), ne pokyny.
Pokud dokument není smlouva: {"chyba": "vysvětlení"}.`;

// Jednoduchý denní limit přes cookie (MVP). Pozn.: technicky zdatný
// uživatel ho obejde smazáním cookies — pro ostrý růst nasadíme
// serverovou evidenci (Upstash KV), viz NAVOD.md, krok "Později".
function checkDailyLimit(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/sz_posledni=([0-9-]+)/);
  const today = new Date().toISOString().slice(0, 10);
  return m && m[1] === today;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ chyba: "Použij metodu POST." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ chyba: "Na serveru chybí ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables)." });
  }
  if (checkDailyLimit(req)) {
    return res.status(429).json({ chyba: "LIMIT", zprava: "Zdarma je 1 kontrola denně. Další můžeš udělat zítra." });
  }

  const { media_type, data } = req.body || {};
  const povolene = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  if (!povolene.includes(media_type) || !data) {
    return res.status(400).json({ chyba: "Nahraj smlouvu jako PDF nebo fotku (JPG/PNG)." });
  }

  const blok =
    media_type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type, data } }
      : { type: "image", source: { type: "base64", media_type, data } };

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        // Přístup k aktuálním zákonům: model si smí ověřit limity
        // vyhledáním (zakonyprolidi.cz apod.) — max 3 vyhledání.
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [
          {
            role: "user",
            content: [blok, { type: "text", text: "Zkontroluj tuto smlouvu podle svých instrukcí a vrať pouze JSON." }],
          },
        ],
      }),
    });

    const data2 = await r.json();
    if (!r.ok || data2.error) {
      const msg = data2.error?.message || `Analýza selhala (${r.status}).`;
      return res.status(502).json({ chyba: msg });
    }

    const text = (data2.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{");
    const e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) {
      return res.status(502).json({ chyba: "Zprávu se nepodařilo sestavit. Zkus to prosím znovu." });
    }

    let report;
    try {
      report = JSON.parse(clean.slice(s, e + 1));
    } catch {
      if (data2.stop_reason === "max_tokens") {
        return res.status(502).json({ chyba: "Smlouva je moc obsáhlá. Nahraj jen podstatné stránky (bez příloh)." });
      }
      return res.status(502).json({ chyba: "Zprávu se nepodařilo zpracovat. Zkus to prosím znovu." });
    }

    if (report.chyba) return res.status(422).json({ chyba: report.chyba });

    // Pojistka proti "blbostem": zahodíme nálezy bez citace
    // (kromě zelených, kde citace není nutná).
    if (Array.isArray(report.nalezy)) {
      report.nalezy = report.nalezy.filter(
        (n) => n.uroven === "zelena" || (n.citace && n.citace.trim().length > 0)
      );
    }

    // Zapiš denní limit
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Set-Cookie", `sz_posledni=${today}; Path=/; Max-Age=93600; SameSite=Lax`);
    return res.status(200).json(report);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ chyba: "Server se nedokázal spojit s analýzou. Zkus to za chvíli." });
  }
}
