/**
 * Querverweise zwischen Dokumenten (G19, BEF-028).
 *
 * Reine Funktionen ohne Dateizugriff, damit `scripts/docs-check.test.mjs` sie
 * mit kleinen Texten pruefen kann; gelesen wird in `docs-check.mjs`.
 *
 * Geprueft wird nur, was sich **maschinell** entscheiden laesst. Ob eine
 * Aussage inhaltlich noch stimmt, entscheidet die Durchsicht vor dem B2-Paket,
 * nicht dieses Gate. Vier Regeln:
 *
 *   A. **Es gibt, was genannt wird.** `ADR-NNN Fassung N` nennt einen ADR aus
 *      dem Index und hoechstens dessen aktuelle Fassung; eine Version von
 *      `PROJECT_PRINCIPLES.md` ist eine, die es gab; `§NN` ist ein Abschnitt
 *      dort. Das gilt ueberall, auch in der Chronik - eine Version, die es nie
 *      gab, ist auch als Geschichte falsch.
 *   B. **Wer eine Grundlage nennt, nennt die geltende.** Steht vor dem Verweis
 *      im selben Satz das Wort „Grundlage", behauptet er den heutigen Stand -
 *      und eine aeltere Fassung ist dann veraltet. Genau diese Form hatten die
 *      Belege aus BEF-028 („Grundlage sind ADR-019 Fassung 3" bei Fassung 4).
 *      Ohne das Wort bleibt eine aeltere Fassung erlaubt: „ADR-013 Fassung 2,
 *      Punkt 9" sagt, woher ein Punkt stammt, und der Punkt gilt weiter.
 *   C. **Aenderungsvermerke duerfen die Vergangenheit nennen.** Regel B und die
 *      Abschnittspruefung aus A gelten nicht unter einer Ueberschrift
 *      „Aenderungsvermerk", „Aenderungshistorie" oder „Chronik" - dort ist die
 *      damalige Fassung die richtige Angabe.
 *   D. **Eine Nummer wird einmal vergeben.** Jede `ANN-`, `BEF-` und
 *      `IDEA-`-Kennung steht hoechstens einmal als Ueberschrift.
 */

// Leerraum schliesst den Zeilenumbruch ein: Markdown bricht Absaetze um.
const ADR_FASSUNG = /ADR-(\d{3})\)?[\s,]+Fassung\s([\d.]*\d)/g;
const PP_VERSION =
  /(?:PROJECT_PRINCIPLES\.md`?|Prinzipien)[\s,(]*(?:Version\s|Fassung\s)?(0\.[\d.]*\d)/g;
const PARAGRAF = /(§§?)\s?(\d[\d.]*\d|\d)([a-z]?)/g;

/**
 * Was nach einer Paragrafennummer auf ein Gesetz zeigt. Nummern ab 100 sind
 * immer Gesetz (`§203`, `§630f`): Die Prinzipien haben keine dreistelligen
 * Abschnitte.
 */
// Verschachtelte Wiederholung, aber ohne Risiko: Geprueft wird nur ein
// Ausschnitt von hoechstens 61 Zeichen hinter der Nummer (siehe `danach`).
const GESETZ =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^[a-z]?(?:\s*(?:Abs\.|Absatz|Nr\.|Satz|S\.|lit\.|Buchst\.)\s*[\w.]+)*\s*(?:ff\.\s*)?(?:UStG|UStDV|StGB|BGB|BDSG|SGB|DSGVO|AO|HGB|EStG|MPDG|MDR|TDDDG|ArbZG|PAngV|GoBD|ZPO|StPO|IfSG|HeilprG|MBO)\b/;

/** Ueberschriften, unter denen Regel B nicht gilt (Regel C). */
const VERMERK = /Änderungsvermerk|Änderungshistorie|Chronik/;

/**
 * Wie weit „Grundlage" vor dem Verweis stehen darf: im selben Satz, hoechstens
 * 120 Zeichen. Satzende ist ein Punkt vor Leerraum - der Punkt in
 * `PROJECT_PRINCIPLES.md` oder in „0.8" beendet keinen Satz.
 */
const GRUNDLAGE = /\bGrundlage\b[.:]?\**(?:[^.!?|]|\.(?=\S)){0,120}$/;

function zahl(text) {
  return Number.parseFloat(text);
}

/** Aktuelle Fassung je ADR aus der Indextabelle in `docs/adr/README.md`. */
export function aktuelleFassungen(readme) {
  const fassungen = new Map();
  for (const zeile of readme.split('\n')) {
    const treffer = zeile.match(/^\| \[ADR-(\d{3})\]/);
    if (!treffer) continue;
    const status = zeile.split('|')[3] ?? '';
    let fassung = 1;
    for (const f of status.matchAll(/Fassung ([\d.]*\d)/g)) fassung = Math.max(fassung, zahl(f[1]));
    fassungen.set(treffer[1], fassung);
  }
  return fassungen;
}

/** Aktuelle und fruehere Versionen aus der Dokumentinformation der Prinzipien. */
export function prinzipienVersionen(prinzipien) {
  const aktuell = prinzipien.match(/\*\*Dokumentversion\*\*\s*\|\s*\**(0\.[\d.]*\d)/)?.[1] ?? null;
  const alle = new Set(aktuell ? [aktuell] : []);
  const vorversion = prinzipien.match(/^\| Vorversion \|(.*)$/m)?.[1] ?? '';
  for (const v of vorversion.matchAll(/\b(0\.[\d.]*\d)\b/g)) alle.add(v[1]);
  for (const v of prinzipien.matchAll(/^#{2,4} Änderungsvermerk (0\.[\d.]*\d)/gm)) alle.add(v[1]);
  return { aktuell, alle };
}

/** Nummerierte Abschnitte der Prinzipien, etwa `4`, `4.8`, `15.1`. */
export function prinzipienAbschnitte(prinzipien) {
  const abschnitte = new Set();
  for (const a of prinzipien.matchAll(/^#{2,4} (\d[\d.]*\d|\d)\.?\s/gm)) abschnitte.add(a[1]);
  return abschnitte;
}

/** Zeilennummern (ab 1), die unter einer Vermerk-Ueberschrift stehen (Regel C). */
export function vermerkZeilen(text) {
  const zeilen = new Set();
  let ebene = 0;
  text.split('\n').forEach((zeile, i) => {
    const kopf = zeile.match(/^(#{1,6}) (.*)$/);
    if (kopf) {
      const neu = kopf[1].length;
      if (ebene && neu <= ebene) ebene = 0;
      if (!ebene && VERMERK.test(kopf[2])) ebene = neu;
    }
    if (ebene) zeilen.add(i + 1);
  });
  return zeilen;
}

/** Zeilennummer (ab 1) zu einer Textstelle, ueber die Anfaenge aller Zeilen. */
function zeilenfinder(text) {
  const anfaenge = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) anfaenge.push(i + 1);
  return (index) => {
    let unten = 0;
    let oben = anfaenge.length - 1;
    while (unten < oben) {
      const mitte = (unten + oben + 1) >> 1;
      // eslint-disable-next-line security/detect-object-injection -- Zahlindex in ein eigenes Array.
      if (anfaenge[mitte] <= index) unten = mitte;
      else oben = mitte - 1;
    }
    return unten + 1;
  };
}

function alsGrundlage(text, index) {
  const davor = text.slice(Math.max(0, index - 160), index);
  return GRUNDLAGE.test(davor) && !davor.slice(davor.lastIndexOf('Grundlage')).includes('\n\n');
}

/**
 * Regeln A bis C fuer eine Datei. `kontext` traegt, was einmal je Lauf
 * gelesen wird: `fassungen`, `versionen`, `abschnitte`.
 */
export function pruefeVerweise(pfad, text, kontext) {
  const verstoesse = [];
  const vermerk = vermerkZeilen(text);
  const zeileVon = zeilenfinder(text);

  for (const t of text.matchAll(ADR_FASSUNG)) {
    const zeile = zeileVon(t.index);
    const aktuell = kontext.fassungen.get(t[1]);
    const genannt = zahl(t[2]);
    if (aktuell === undefined) {
      verstoesse.push(`${pfad}:${zeile}: ADR-${t[1]} steht nicht im Index docs/adr/README.md.`);
    } else if (genannt < 1 || genannt > aktuell) {
      verstoesse.push(
        `${pfad}:${zeile}: ADR-${t[1]} Fassung ${t[2]} gibt es nicht (aktuell ${aktuell}).`,
      );
    } else if (genannt < aktuell && !vermerk.has(zeile) && alsGrundlage(text, t.index)) {
      verstoesse.push(
        `${pfad}:${zeile}: nennt ADR-${t[1]} Fassung ${t[2]} als Grundlage, geltend ist Fassung ${aktuell}.`,
      );
    }
  }

  for (const t of text.matchAll(PP_VERSION)) {
    const zeile = zeileVon(t.index);
    if (!kontext.versionen.alle.has(t[1])) {
      verstoesse.push(`${pfad}:${zeile}: PROJECT_PRINCIPLES.md ${t[1]} gibt es nicht.`);
    } else if (
      t[1] !== kontext.versionen.aktuell &&
      !vermerk.has(zeile) &&
      alsGrundlage(text, t.index)
    ) {
      verstoesse.push(
        `${pfad}:${zeile}: nennt PROJECT_PRINCIPLES.md ${t[1]} als Grundlage, geltend ist ${kontext.versionen.aktuell}.`,
      );
    }
  }

  for (const t of text.matchAll(PARAGRAF)) {
    if (t[1] === '§§') continue;
    const nummer = t[2];
    if (Number.parseInt(nummer, 10) >= 100) continue;
    const danach = text.slice(t.index + t[0].length - t[3].length, t.index + t[0].length + 60);
    if (GESETZ.test(danach)) continue;
    const zeile = zeileVon(t.index);
    if (vermerk.has(zeile)) continue;
    if (!kontext.abschnitte.has(nummer)) {
      verstoesse.push(`${pfad}:${zeile}: §${nummer} ist kein Abschnitt von PROJECT_PRINCIPLES.md.`);
    }
  }

  return verstoesse;
}

/** Regel D ueber alle Dateien: `[{ pfad, text }]`. */
export function pruefeEindeutigkeit(dateien) {
  const fundorte = new Map();
  for (const { pfad, text } of dateien) {
    text.split('\n').forEach((zeile, i) => {
      const kennung = zeile.match(/^#{1,6} ((?:ANN|BEF)-\d{3}|IDEA-[A-Z]+-\d{3})\b/)?.[1];
      if (!kennung) return;
      const liste = fundorte.get(kennung) ?? [];
      liste.push(`${pfad}:${i + 1}`);
      fundorte.set(kennung, liste);
    });
  }
  const verstoesse = [];
  for (const [kennung, orte] of fundorte) {
    if (orte.length > 1) verstoesse.push(`${kennung} ist mehrfach vergeben: ${orte.join(', ')}.`);
  }
  return verstoesse;
}
