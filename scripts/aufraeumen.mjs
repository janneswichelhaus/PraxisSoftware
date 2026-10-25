/**
 * Kennzahlen für /aufraeumen: Größe, Kommentare, Modulgrenzen, große Dateien, Doppelungen, DB-Funktionen.
 * Misst nur; `--schreiben` legt den Lauf als Vergleich für den nächsten ab, `--json` gibt alles maschinenlesbar.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kommentarbloecke, sprache, textzeilen } from './kommentare-check.mjs';

const ABLAGE = 'docs/development/AUFRAEUMEN.md';
export const GROSS = 500;
const FENSTER = 8;
const BINAER = /\.(pdf|png|jpe?g|webp|gif|ico|svg|woff2?|mp4|zip)$/;
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|css|sql)$/;

/** Reihenfolge und Bezeichnung der Kennzahlen in Bericht und Ablage. */
export const KENNZAHLEN = [
  ['zeilen_gesamt', 'Zeilen gesamt'],
  ['zeilen_programm', 'Zeilen Programm (src, Edge Functions)'],
  ['zeilen_tests', 'Zeilen Tests'],
  ['zeilen_migrationen', 'Zeilen Migrationen'],
  ['zeilen_doku', 'Zeilen Doku (Markdown)'],
  ['zeilen_rest', 'Zeilen Rest (Skripte, Konfiguration, Seed)'],
  ['kommentaranteil_programm', 'Kommentaranteil Programm (%)'],
  ['kommentaranteil_migrationen', 'Kommentaranteil Migrationen (%)'],
  ['lange_kommentare', 'Kommentare über 3 Zeilen (ohne Migrationen)'],
  ['module', 'Module unter src/features'],
  ['querimporte', 'Importe zwischen Modulen'],
  ['tiefe_importe', 'Tiefe Importe in Module (an index.ts vorbei)'],
  ['gegenseitige_abhaengigkeiten', 'Gegenseitige Abhängigkeiten (Modulpaare)'],
  ['ringgruppe', 'Module im größten Abhängigkeitsring'],
  ['module_mit_schnittstelle', 'Module mit Schnittstelle (index.ts)'],
  ['grosse_programmdateien', `Programmdateien über ${GROSS} Zeilen`],
  ['grosse_testdateien', `Testdateien über ${GROSS} Zeilen`],
  ['db_funktionen', 'DB-Funktionen (nach Name)'],
  ['db_neufassungen', 'Neufassungen von DB-Funktionen in Migrationen'],
  ['doppelte_zeilen_prozent', `Doppelte Zeilen im Programm (%, Blöcke ab ${FENSTER} Zeilen)`],
];

/** Wohin eine Datei zählt; `null` für Binärdateien. */
export function kategorie(pfad) {
  if (BINAER.test(pfad)) return null;
  if (pfad.startsWith('supabase/migrations/')) return 'migrationen';
  if (/\.test\.[cm]?[jt]sx?$|^(tests|supabase\/tests)\/|^src\/test-/.test(pfad)) return 'tests';
  if (/^(src|supabase\/functions)\/.*\.(tsx?|css)$/.test(pfad)) return 'programm';
  if (pfad.endsWith('.md')) return 'doku';
  return 'rest';
}

const zeilenzahl = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/** Das Modul unter src/features, auf das ein Import zeigt, samt Pfad darin. */
export function importziel(datei, spezifizierer) {
  let pfad;
  if (spezifizierer.startsWith('@/')) pfad = `src/${spezifizierer.slice(2)}`;
  else if (spezifizierer.startsWith('.')) pfad = normalize(join(dirname(datei), spezifizierer));
  else return null;
  const treffer = /^src\/features\/([^/]+)\/?(.*)$/.exec(pfad.replaceAll('\\', '/'));
  if (!treffer) return null;
  return { modul: treffer[1], rest: treffer[2].replace(/\.(tsx?|js)$/, '') };
}

const modulVon = (pfad) => /^src\/features\/([^/]+)\//.exec(pfad)?.[1] ?? null;

/** Querimporte, tiefe Importe und gegenseitige Abhängigkeiten der Module. */
export function modulgrenzen(dateien) {
  const kanten = new Map();
  const ziele = new Map();
  let querimporte = 0;
  let tief = 0;
  for (const { pfad, text } of dateien) {
    const von = modulVon(pfad);
    for (const [, spez] of text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g,
    )) {
      const ziel = importziel(pfad, spez);
      if (!ziel || ziel.modul === von) continue;
      if (von) {
        querimporte++;
        const schluessel = `${von}>${ziel.modul}`;
        kanten.set(schluessel, (kanten.get(schluessel) ?? 0) + 1);
      }
      if (ziel.rest === '' || ziel.rest === 'index') continue;
      tief++;
      const eintrag = ziele.get(ziel.modul) ?? { von: new Set(), dateien: new Set(), importe: 0 };
      eintrag.von.add(von ?? pfad.split('/').slice(0, 2).join('/'));
      eintrag.dateien.add(ziel.rest);
      eintrag.importe++;
      ziele.set(ziel.modul, eintrag);
    }
  }
  const gegenseitig = [...kanten.keys()]
    .map((k) => k.split('>'))
    .filter(([a, b]) => a < b && kanten.has(`${b}>${a}`))
    .map(([a, b]) => `${a} <-> ${b}`);
  return { querimporte, tief, gegenseitig, ziele, ringgruppe: groessterRing(kanten.keys()) };
}

/** Wie viele Module höchstens über Importketten wechselseitig voneinander abhängen (Tarjan). */
export function groessterRing(kanten) {
  const nach = new Map();
  for (const kante of kanten) {
    const [von, zu] = kante.split('>');
    for (const m of [von, zu]) if (!nach.has(m)) nach.set(m, []);
    nach.get(von).push(zu);
  }
  const nummer = new Map();
  const niedrig = new Map();
  const stapel = [];
  const aufStapel = new Set();
  let groesste = 0;
  const besuche = (v) => {
    nummer.set(v, nummer.size);
    niedrig.set(v, nummer.get(v));
    stapel.push(v);
    aufStapel.add(v);
    for (const w of nach.get(v)) {
      if (!nummer.has(w)) besuche(w);
      if (aufStapel.has(w)) niedrig.set(v, Math.min(niedrig.get(v), niedrig.get(w)));
    }
    if (niedrig.get(v) !== nummer.get(v)) return;
    let groesse = 0;
    let w;
    do {
      w = stapel.pop();
      aufStapel.delete(w);
      groesse++;
    } while (w !== v);
    if (groesse > 1) groesste = Math.max(groesste, groesse);
  };
  for (const v of nach.keys()) if (!nummer.has(v)) besuche(v);
  return groesste;
}

/** Funktionen nach Name über alle Migrationen, mit `drop function` in Reihenfolge. */
export function dbFunktionen(migrationen) {
  const norm = (n) => {
    const name = n.replaceAll('"', '').toLowerCase();
    return name.includes('.') ? name : `public.${name}`;
  };
  const lebend = new Set();
  const fassungen = new Map();
  for (const { text } of migrationen) {
    // Leerraum vereinheitlicht: So kommen die Muster ohne verschachtelte Quantoren aus.
    const flach = text.replace(/\s+/g, ' ');
    const ereignisse = [];
    for (const m of flach.matchAll(/create (?:or replace )?function ([\w."]+) ?\(/gi)) {
      ereignisse.push([m.index, 'neu', norm(m[1])]);
    }
    for (const m of flach.matchAll(/drop function (?:if exists )?([^;]+);/gi)) {
      for (const teil of m[1].split(/,(?![^(]*\))/)) {
        const name = /^ ?([\w."]+)/.exec(teil)?.[1];
        if (name) ereignisse.push([m.index, 'weg', norm(name)]);
      }
    }
    for (const [, art, name] of ereignisse.sort((a, b) => a[0] - b[0])) {
      if (art === 'weg') {
        lebend.delete(name);
        continue;
      }
      lebend.add(name);
      fassungen.set(name, (fassungen.get(name) ?? 0) + 1);
    }
  }
  const definitionen = [...fassungen.values()].reduce((s, n) => s + n, 0);
  return { anzahl: lebend.size, neufassungen: definitionen - fassungen.size, fassungen };
}

/** Zeilen, die in Blöcken ab FENSTER Zeilen mehrfach vorkommen, und die größten Paare. */
export function doppelungen(dateien) {
  const zeilen = new Map();
  const fenster = new Map();
  for (const { pfad, text } of dateien) {
    const kommentar = new Set();
    for (const b of kommentarbloecke(text, 'ts')) {
      for (let n = b.start; n <= b.ende; n++) kommentar.add(n);
    }
    const inhalt = text
      .split('\n')
      .map((z, i) => [i + 1, z.trim()])
      .filter(
        ([n, z]) =>
          z &&
          !kommentar.has(n) &&
          !/^(import\s|export .* from\s)|^[\])}>;,(]*$|^<\/[\w.]+>$/.test(z),
      );
    zeilen.set(pfad, inhalt);
    for (let i = 0; i + FENSTER <= inhalt.length; i++) {
      const schluessel = createHash('sha1')
        .update(
          inhalt
            .slice(i, i + FENSTER)
            .map(([, z]) => z)
            .join('\n'),
        )
        .digest('hex');
      const orte = fenster.get(schluessel) ?? [];
      orte.push([pfad, i]);
      fenster.set(schluessel, orte);
    }
  }
  const doppelt = new Map();
  const paare = new Map();
  for (const orte of fenster.values()) {
    if (orte.length < 2) continue;
    const [erster] = orte;
    for (const [pfad, i] of orte) {
      const nummern = zeilen
        .get(pfad)
        .slice(i, i + FENSTER)
        .map(([n]) => n);
      const menge = doppelt.get(pfad) ?? new Set();
      nummern.forEach((n) => menge.add(n));
      doppelt.set(pfad, menge);
      if (pfad === erster[0] && i === erster[1]) continue;
      const paar = `${erster[0]} <-> ${pfad}`;
      const zaehler = paare.get(paar) ?? new Set();
      nummern.forEach((n) => zaehler.add(n));
      paare.set(paar, zaehler);
    }
  }
  const gesamt = [...zeilen.values()].reduce((s, z) => s + z.length, 0);
  const anzahl = [...doppelt.values()].reduce((s, m) => s + m.size, 0);
  return {
    prozent: gesamt ? Math.round((1000 * anzahl) / gesamt) / 10 : 0,
    paare: [...paare].map(([paar, menge]) => [paar, menge.size]).sort((a, b) => b[1] - a[1]),
  };
}

const prozent = (teil, ganz) => (ganz ? Math.round((1000 * teil) / ganz) / 10 : 0);

/** Alle Kennzahlen und Brennpunkte für eine Liste von `{ pfad, text }`. */
export function messen(dateien) {
  const k = new Map(KENNZAHLEN.map(([schluessel]) => [schluessel, 0]));
  const plus = (schluessel, n = 1) => k.set(schluessel, k.get(schluessel) + n);
  const kommentare = new Map([
    ['programm', [0, 0]],
    ['migrationen', [0, 0]],
  ]);
  const lange = [];
  const gross = [];
  for (const { pfad, text } of dateien) {
    const art = kategorie(pfad);
    if (!art) continue;
    const anzahl = zeilenzahl(text);
    plus('zeilen_gesamt', anzahl);
    plus(`zeilen_${art}`, anzahl);
    if (art === 'programm' && anzahl > GROSS) gross.push([pfad, anzahl]);
    if (art === 'tests' && anzahl > GROSS && CODE.test(pfad)) plus('grosse_testdateien');
    if (!CODE.test(pfad)) continue;
    const bloecke = kommentarbloecke(text, sprache(pfad));
    const summe = kommentare.get(art);
    if (summe) {
      summe[0] += bloecke.reduce((s, b) => s + b.zeilen.length, 0);
      summe[1] += text.split('\n').filter((z) => z.trim()).length;
    }
    if (art === 'migrationen') continue;
    for (const b of bloecke) {
      const n = textzeilen(b);
      if (n > 3) lange.push([`${pfad}:${b.start}`, n]);
    }
  }
  k.set('kommentaranteil_programm', prozent(...kommentare.get('programm')));
  k.set('kommentaranteil_migrationen', prozent(...kommentare.get('migrationen')));
  k.set('lange_kommentare', lange.length);
  k.set('grosse_programmdateien', gross.length);

  const quellen = dateien.filter(
    ({ pfad }) => /^src\/.*\.tsx?$/.test(pfad) && kategorie(pfad) === 'programm',
  );
  const grenzen = modulgrenzen(quellen);
  k.set('module', new Set(quellen.map(({ pfad }) => modulVon(pfad)).filter(Boolean)).size);
  k.set('querimporte', grenzen.querimporte);
  k.set('tiefe_importe', grenzen.tief);
  k.set('gegenseitige_abhaengigkeiten', grenzen.gegenseitig.length);
  k.set('ringgruppe', grenzen.ringgruppe);
  k.set(
    'module_mit_schnittstelle',
    dateien.filter(({ pfad }) => /^src\/features\/[^/]+\/index\.ts$/.test(pfad)).length,
  );

  const db = dbFunktionen(
    dateien
      .filter(({ pfad }) => kategorie(pfad) === 'migrationen')
      .sort((a, b) => a.pfad.localeCompare(b.pfad)),
  );
  k.set('db_funktionen', db.anzahl);
  k.set('db_neufassungen', db.neufassungen);

  const doppelt = doppelungen(quellen.filter(({ pfad }) => !pfad.endsWith('.css')));
  k.set('doppelte_zeilen_prozent', doppelt.prozent);

  const oben = (liste, n = 8) => [...liste].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    kennzahlen: k,
    brennpunkte: {
      'Größte Programmdateien (Zeilen)': oben(gross),
      'Meist von außen genutzte Module (Nutzer, interne Dateien)': oben(
        [...grenzen.ziele].map(([modul, z]) => [
          `${modul}: ${z.von.size} Nutzer, ${z.dateien.size} interne Dateien`,
          z.importe,
        ]),
      ),
      'Gegenseitige Abhängigkeiten': grenzen.gegenseitig.map((paar) => [paar, '']),
      'Längste Kommentare (Textzeilen)': oben(lange),
      'Meist neu gefasste DB-Funktionen (Fassungen)': oben([...db.fassungen]),
      'Größte Doppelungen (Zeilen)': oben(doppelt.paare),
    },
  };
}

/** Die Ablage als Markdown-Tabelle; sie bleibt damit reine Doku. */
export function alsMarkdown(stand, commit, kennzahlen) {
  return [
    '# Aufräumen: Kennzahlen des letzten Laufs',
    '',
    'Erzeugt von `pnpm aufraeumen --schreiben`, nicht von Hand ändern. Der nächste Lauf von',
    '[`/aufraeumen`](../../.claude/skills/aufraeumen/SKILL.md) vergleicht mit diesem Stand.',
    '',
    `Stand: ${stand} · Commit \`${commit}\``,
    '',
    '| Kennzahl | Wert | Schlüssel |',
    '| --- | ---: | --- |',
    ...KENNZAHLEN.map(([s, name]) => `| ${name} | ${kennzahlen.get(s)} | \`${s}\` |`),
    '',
  ].join('\n');
}

export function ausMarkdown(text) {
  const stand = /^Stand: (\S+) · Commit `(\w+)`/m.exec(text);
  const kennzahlen = new Map();
  for (const [, wert, schluessel] of text.matchAll(/^\| .+? \| (-?[\d.]+) \| `(\w+)` \|$/gm)) {
    kennzahlen.set(schluessel, Number(wert));
  }
  return { stand: stand?.[1] ?? '?', commit: stand?.[2] ?? '?', kennzahlen };
}

function git(...argumente) {
  return execFileSync('git', argumente, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const argumente = process.argv.slice(2);
  const pfade = git('ls-files', '-z')
    .split('\0')
    .filter((p) => p && !BINAER.test(p));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus git ls-files im Repository.
  const dateien = pfade.map((pfad) => ({ pfad, text: readFileSync(pfad, 'utf8') }));
  const { kennzahlen, brennpunkte } = messen(dateien);
  const stand = new Date().toISOString().slice(0, 10);
  const commit = git('rev-parse', '--short', 'HEAD').trim();
  if (argumente.includes('--json')) {
    const json = { stand, commit, kennzahlen: Object.fromEntries(kennzahlen), brennpunkte };
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  let vorher = { stand: '-', commit: '-', kennzahlen: new Map() };
  try {
    vorher = ausMarkdown(readFileSync(ABLAGE, 'utf8'));
  } catch {
    // Erster Lauf: Es gibt noch nichts zu vergleichen.
  }
  console.log(
    `Aufräumen: Kennzahlen am ${stand} (${commit}), verglichen mit ${vorher.stand} (${vorher.commit})\n`,
  );
  console.log(
    `${'Kennzahl'.padEnd(60)}${'vorher'.padStart(10)}${'jetzt'.padStart(10)}${'Änderung'.padStart(10)}`,
  );
  for (const [s, name] of KENNZAHLEN) {
    const [alt, jetzt] = [vorher.kennzahlen.get(s), kennzahlen.get(s)];
    const delta = alt === undefined ? '' : Math.round((jetzt - alt) * 10) / 10;
    console.log(
      `${name.padEnd(60)}${String(alt ?? '-').padStart(10)}${String(jetzt).padStart(10)}${String(delta).padStart(10)}`,
    );
  }
  for (const [titel, liste] of Object.entries(brennpunkte)) {
    console.log(`\n${titel}`);
    for (const [was, wert] of liste)
      console.log(`  ${wert === '' ? '' : `${String(wert).padStart(6)}  `}${was}`);
  }
  if (argumente.includes('--schreiben')) {
    writeFileSync(ABLAGE, alsMarkdown(stand, commit, kennzahlen));
    console.log(`\nAbgelegt in ${ABLAGE}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
