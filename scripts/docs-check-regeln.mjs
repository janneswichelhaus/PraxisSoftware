/**
 * Die Regeln des Doku-Gates als reine Funktionen, damit `docs-check.test.mjs` sie mit kleinen
 * Texten prueft. Was jede Regel (A bis F) prueft und warum: `docs/DEVELOPMENT.md`, docs:check.
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

const KOPF_KENNUNG = /^#{1,6} ((?:ANN|BEF)-\d{3}|IDEA-[A-Z]+-\d{3})\b/;
const ZEILE_KENNUNG = /^\| ((?:ANN|BEF)-\d{3}|IDEA-[A-Z]+-\d{3}) \|/;

/** Regel D ueber alle Dateien `[{ pfad, text }]`; in den Registern `register` zaehlt auch die Tabellenzeile. */
export function pruefeEindeutigkeit(dateien, register = new Set()) {
  const fundorte = new Map();
  for (const { pfad, text } of dateien) {
    text.split('\n').forEach((zeile, i) => {
      const kennung =
        zeile.match(KOPF_KENNUNG)?.[1] ??
        (register.has(pfad) ? zeile.match(ZEILE_KENNUNG)?.[1] : undefined);
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

// Die offenen Befunde, als das Archiv nach Git ging (2026-10-27): Neue Kennungen werden nicht
// vergeben, und eine erledigte kommt nicht unter ihrer alten Nummer wieder - Regel D sieht
// geloeschte Nummern nicht mehr.
export const OFFENE_BEFUNDE = new Set([
  'BEF-010',
  'BEF-034',
  'BEF-082',
  'BEF-127',
  'BEF-140',
  'BEF-166',
  'BEF-167',
  'BEF-177',
  'BEF-184',
  'BEF-194',
  'BEF-201',
  'BEF-202',
  'BEF-212',
  'BEF-217',
  'BEF-224',
  'BEF-225',
]);

/** Regel D fuer Befunde: Als Ueberschrift steht nur noch eine Kennung aus `offen`. */
export function pruefeBefundkennungen(dateien, offen = OFFENE_BEFUNDE) {
  const verstoesse = [];
  for (const { pfad, text } of dateien) {
    text.split('\n').forEach((zeile, i) => {
      const kennung = zeile.match(/^#{1,6} (BEF-\d{3})\b/)?.[1];
      if (kennung && !offen.has(kennung)) {
        verstoesse.push(
          `${pfad}:${i + 1}: ${kennung} ist keine offene Kennung - neue Befunde tragen keine Nummer.`,
        );
      }
    });
  }
  return verstoesse;
}

/**
 * Regel E: Obergrenzen der Dokumente, die ganz gelesen werden.
 *
 * In **Bytes** (UTF-8, ein Umlaut zaehlt zwei), weil sich eine Zeilengrenze
 * mit langen Zeilen umgehen laesst. `OPEN_DECISIONS.md` behaelt seine
 * Zeilengrenze: Es wird nicht ganz gelesen, die Grenze bremst dort nur das
 * Wachstum. `optional` heisst: Fehlt die Datei, ist das kein Verstoss
 * (`DESIGN.md` entsteht parallel; liegt sie auf `main`, entfaellt das).
 *
 * Eine Grenze wird gesenkt, nie still gehoben - `docs-check.test.mjs` haelt
 * die Werte fest. `DESIGN.md` hat 12,5 statt 12 KB seit dem 16.10.2026, mit
 * Freigabe von Jannes („DESIGN.md darf größer werden, wenn nötig“) für die
 * Zeile zur Bewegung (ANN-567, PR #259).
 */
export const OBERGRENZEN = [
  { pfad: 'CLAUDE.md', bytes: 8 * 1024 },
  { pfad: 'docs/STATUS.md', bytes: 4 * 1024 },
  { pfad: 'docs/development/ARBEITSBEREICHE.md', bytes: 8 * 1024 },
  { pfad: 'docs/design/DESIGN.md', bytes: 12.5 * 1024, optional: true },
  // Die Sprache der Plattform (Handoff 2026-10-22): eigene Datei, weil DESIGN.md an
  // seiner Grenze steht; mit eigener Grenze, damit sie nicht DESIGN.md wird.
  { pfad: 'docs/design/PLATTFORM.md', bytes: 8 * 1024 },
  { pfad: 'docs/decisions/OPEN_DECISIONS.md', zeilen: 150 },
];

/** Grenze je Skill (`.claude/skills/<name>/SKILL.md`): Ein Skill laedt beim Aufruf ganz. */
export const SKILL_GRENZE_BYTES = 8 * 1024;

// Jede Markdown-Datei hat eine Grenze (Aufraeumen 5): die Standardgrenze, groessere einzeln. Mehr
// Platz fuer eine Datei heisst weniger fuer die anderen, denn die Gesamtgrenze bleibt.
export const STANDARDGRENZE = { zeilen: 300, bytes: 16 * 1024 };
export const DATEIGRENZEN = new Map([
  ['PROJECT_PRINCIPLES.md', { zeilen: 760, bytes: 54 * 1024 }],
  ['docs/DEVELOPMENT.md', { zeilen: 400, bytes: 28 * 1024 }],
  ['docs/adr/ADR-017-file-storage.md', { zeilen: 450, bytes: 40 * 1024 }],
  ['docs/adr/ADR-023-platform-access.md', { zeilen: 250, bytes: 18 * 1024 }],
  ['docs/decisions/ASSUMPTIONS.md', { zeilen: 1650, bytes: 280 * 1024 }],
  ['docs/development/BEFUNDE.md', { zeilen: 300, bytes: 25 * 1024 }],
  ['docs/development/ROADMAP.md', { zeilen: 480, bytes: 80 * 1024 }],
  ['marke/README.md', { zeilen: 260, bytes: 24 * 1024 }],
  ['quellen/bausteine/mt-untersuchung-quelldaten.md', { zeilen: 430, bytes: 13 * 1024 }],
]);

/** Grenze je Markdown-Datei aus `git ls-files`: einzeln, sonst die Standardgrenze. */
export function dateigrenzen(pfade) {
  return pfade
    .filter((pfad) => pfad.endsWith('.md'))
    .map((pfad) => ({ pfad, ...(DATEIGRENZEN.get(pfad) ?? STANDARDGRENZE) }));
}

// Alle Markdown-Dateien zusammen (Aufraeumen 5, Auftrag Jannes 2026-10-27). Gesenkt, nie gehoben:
// Eine Gesamtgrenze traegt nur, wenn Wachstum nach Git abfliesst statt in die Dateien.
export const GESAMTGRENZE = { zeilen: 10_000, bytes: 900 * 1024 };

/** Prueft die Summe ueber `[{ pfad, text }]` gegen die Gesamtgrenze. */
export function pruefeGesamtgrenze(dateien, grenze = GESAMTGRENZE) {
  let zeilen = 0;
  let bytes = 0;
  for (const { text } of dateien) {
    zeilen += text.split('\n').length - 1;
    bytes += new TextEncoder().encode(text).length;
  }
  const verstoesse = [];
  if (zeilen > grenze.zeilen) {
    verstoesse.push(`Markdown gesamt: ${zeilen} Zeilen, erlaubt sind ${grenze.zeilen}.`);
  }
  if (bytes > grenze.bytes) {
    verstoesse.push(`Markdown gesamt: ${bytes} Bytes, erlaubt sind ${grenze.bytes}.`);
  }
  return verstoesse;
}

const bytesVon = (text) => new TextEncoder().encode(text).length;

/**
 * Regel E fuer eine Liste von Grenzen. `inhaltVon(pfad)` liefert den Text
 * oder `null`, wenn die Datei fehlt. Zeilen nach `wc -l` (Zeilenumbrueche).
 */
export function pruefeObergrenzen(grenzen, inhaltVon) {
  const verstoesse = [];
  for (const { pfad, bytes, zeilen, optional } of grenzen) {
    const text = inhaltVon(pfad);
    if (text === null) {
      if (!optional) verstoesse.push(`${pfad}: fehlt, wird aber von docs:check erwartet.`);
      continue;
    }
    const groesse = bytesVon(text);
    if (bytes !== undefined && groesse > bytes) {
      verstoesse.push(`${pfad}: ${groesse} Bytes, erlaubt sind ${bytes}.`);
    }
    const umbrueche = text.split('\n').length - 1;
    if (zeilen !== undefined && umbrueche > zeilen) {
      verstoesse.push(`${pfad}: ${umbrueche} Zeilen, erlaubt sind ${zeilen}.`);
    }
  }
  return verstoesse;
}

// Regel F: das verdichtete Annahmenregister. Kurze Eintraege im Pruefpaket und bei den Fachregeln,
// sonst eine Tabellenzeile; der Zusatz „Prüfpaket“ folgt aus Kategorie und Status.
export const REGISTER_GRENZEN = {
  vorspann: 40,
  zeilenJeEintrag: 5,
  bytes: { Prüfpaket: 800, Fachregeln: 600, 'Übrige Einträge': 240 },
};
const KATEGORIEN = new Set(['Datenschutz', 'Recht', 'Praxisprozess', 'Technik']);
const STATUS = [
  'offen',
  'entschieden (Jannes)',
  'bestätigt (Prüfung)',
  'geändert',
  'verworfen',
  'in ADR überführt',
];

const imPruefpaket = (kategorie, status) =>
  (kategorie === 'Datenschutz' || kategorie === 'Recht') && status !== 'verworfen';

/** Regel F fuer den Text des Registers; liefert die Verstoesse und alle Kennungen fuer die Anker. */
export function pruefeRegister(pfad, text) {
  const zeilen = text.split('\n');
  if (zeilen.at(-1) === '') zeilen.pop();
  const verstoesse = [];
  const kennungen = [];
  const melde = (i, satz) => verstoesse.push(`${pfad}:${i + 1}: ${satz}`);
  let abschnitt = null;
  let erster = null;

  const eintrag = (i, kennung) => {
    let ende = i + 1;
    // eslint-disable-next-line security/detect-object-injection -- Zahlindex in ein eigenes Array.
    while (ende < zeilen.length && !zeilen[ende].startsWith('#')) ende += 1;
    const block = zeilen.slice(i, ende);
    if (block.length > REGISTER_GRENZEN.zeilenJeEintrag) {
      melde(
        i,
        `${kennung} hat ${block.length} Zeilen, erlaubt sind ${REGISTER_GRENZEN.zeilenJeEintrag}.`,
      );
    }
    if (abschnitt !== 'Prüfpaket' && abschnitt !== 'Fachregeln') {
      melde(i, `${kennung} steht als Eintrag außerhalb von „Prüfpaket“ und „Fachregeln“.`);
      return;
    }
    // eslint-disable-next-line security/detect-object-injection -- nur die zwei Abschnitte oben.
    const grenze = REGISTER_GRENZEN.bytes[abschnitt];
    const bytes = bytesVon(block.join('\n').trimEnd());
    if (bytes > grenze) melde(i, `${kennung} hat ${bytes} Bytes, erlaubt sind ${grenze}.`);
    // Die Statuszeile ist die erste nicht leere Zeile nach der Ueberschrift, mit hartem Umbruch
    // (`\\`) vor dem Absatz; eine Leerzeile nach der Ueberschrift ist erlaubt, aber nicht noetig.
    const s =
      i +
      Math.max(
        1,
        block.findIndex((zeile, n) => n > 0 && zeile.trim() !== ''),
      );
    // eslint-disable-next-line security/detect-object-injection -- Zahlindex in ein eigenes Array.
    const felder = (zeilen[s] ?? '').replace(/\\$/, '').split(' · ');
    if (felder.length !== 6 || !felder[5].startsWith('Wiedervorlage:')) {
      melde(s, `${kennung}: Die Statuszeile braucht sechs Felder bis „Wiedervorlage: …“.`);
      return;
    }
    const [kategorie, status, , , zusatz] = felder;
    if (!KATEGORIEN.has(kategorie)) melde(s, `${kennung}: Kategorie „${kategorie}“ gibt es nicht.`);
    if (!STATUS.includes(status)) melde(s, `${kennung}: Status „${status}“ gibt es nicht.`);
    const pruef = imPruefpaket(kategorie, status);
    const erwartet = pruef ? 'Prüfpaket' : status === 'offen' ? '—' : 'erledigt';
    if (zusatz !== erwartet) {
      melde(s, `${kennung}: Zusatz „${zusatz}“, erwartet „${erwartet}“.`);
    }
    if (pruef !== (abschnitt === 'Prüfpaket')) {
      melde(i, `${kennung} gehört ${pruef ? 'ins' : 'nicht ins'} Prüfpaket.`);
    }
  };

  const reihe = (i, kennung) => {
    if (abschnitt !== 'Übrige Einträge') {
      melde(i, `${kennung} steht als Tabellenzeile außerhalb von „Übrige Einträge“.`);
    }
    // eslint-disable-next-line security/detect-object-injection -- Zahlindex in ein eigenes Array.
    const zeile = zeilen[i];
    const grenze = REGISTER_GRENZEN.bytes['Übrige Einträge'];
    if (bytesVon(zeile) > grenze)
      melde(i, `${kennung} hat ${bytesVon(zeile)} Bytes, erlaubt sind ${grenze}.`);
    const zellen = zeile
      .split('|')
      .slice(1, -1)
      .map((zelle) => zelle.trim());
    if (zellen.length !== 4) {
      melde(i, `${kennung}: vier Spalten erwartet (Kennung, Titel, Kategorie · Status, Anker).`);
      return;
    }
    const [kategorie, rest = ''] = zellen[2].split(' · ');
    const status = STATUS.find((wort) => rest === wort || rest.startsWith(`${wort} `));
    if (!KATEGORIEN.has(kategorie)) melde(i, `${kennung}: Kategorie „${kategorie}“ gibt es nicht.`);
    if (!status) melde(i, `${kennung}: Status „${rest}“ gibt es nicht.`);
    else if (imPruefpaket(kategorie, status)) {
      melde(i, `${kennung} ist ${kategorie} und nicht verworfen: gehört ins Prüfpaket.`);
    }
  };

  zeilen.forEach((zeile, i) => {
    const ueberschrift = zeile.match(/^## (.+)$/);
    if (ueberschrift) abschnitt = ueberschrift[1].trim();
    const kopf = zeile.match(/^### (ANN-\d{3})\b/)?.[1];
    const tabelle = zeile.match(/^\| (ANN-\d{3}) \|/)?.[1];
    const kennung = kopf ?? tabelle;
    if (!kennung) return;
    erster ??= i;
    kennungen.push(kennung);
    if (kopf) eintrag(i, kennung);
    else reihe(i, kennung);
  });

  if (erster !== null && erster > REGISTER_GRENZEN.vorspann) {
    verstoesse.push(
      `${pfad}: Vorspann ${erster} Zeilen, erlaubt sind ${REGISTER_GRENZEN.vorspann}.`,
    );
  }
  return { verstoesse, kennungen };
}
