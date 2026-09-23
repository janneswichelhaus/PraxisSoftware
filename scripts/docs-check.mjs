/**
 * Gate fuer die Dokumentation (ADR-013 Pruefung 2.10).
 *
 * Sechs Zusicherungen, die sich objektiv pruefen lassen; die ersten drei wurden
 * in der Runde R2 teuer erkauft, vier und fuenf mit G19, sechs mit Umbau U3:
 *
 *   1. **Obergrenzen.** Drei Steuerungsdokumente wachsen nicht wieder zu, und
 *      im Annahmenregister kein Eintrag.
 *      Eine Obergrenze ist keine Schoenheitsregel: Ein Dokument, das niemand
 *      mehr ganz liest, wird zur Dopplungsquelle (PROJECT_PRINCIPLES.md 16).
 *   2. **Register-Anker.** Jede Annahme im Register greift an genau einer
 *      Stelle im Code (15.1). Ein Eintrag ohne Anker ist eine Behauptung.
 *   3. **Links.** Ein relativer Verweis zeigt auf eine vorhandene Datei. Tote
 *      Verweise sind der haeufigste Weg, auf dem Dokumentation still veraltet.
 *   4. **Querverweise** (G19, BEF-028). Genannte ADR-Fassungen, Versionen und
 *      Abschnitte von `PROJECT_PRINCIPLES.md` gibt es; wer eine Fassung als
 *      Grundlage nennt, nennt die geltende; Aenderungsvermerke duerfen die
 *      Vergangenheit nennen. Regeln und Grenzen in `docs-check-regeln.mjs`.
 *   5. **Eindeutige Nummern.** Jede `ANN-`, `BEF-` und `IDEA-`-Kennung steht
 *      hoechstens einmal als Ueberschrift - zwei parallele Sitzungen haben
 *      schon einmal dieselbe Nummer vergeben.
 *   6. **Eine Quelle fuer den Fortschritt** (Umbau U3). Die Tabelle im
 *      Abschnitt „Fortschritt" der Roadmap ist genau die, die
 *      `pnpm fortschritt --schreiben` aus `fortschritt.json` erzeugt.
 *
 * Bewusst ohne Abhaengigkeiten: nur `node:fs`, `node:path` und `node:child_process`
 * fuer `git ls-files`. Ein Gate, das selbst ein Paket braucht, ist ein Gate
 * mehr, das ausfallen kann.
 *
 * Aufruf: `pnpm docs:check`. Exit 1 mit einer Liste der Verstoesse.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { tabelleAktuell } from './fortschritt-tabelle.mjs';
import {
  aktuelleFassungen,
  prinzipienAbschnitte,
  prinzipienVersionen,
  pruefeEindeutigkeit,
  pruefeVerweise,
} from './docs-check-regeln.mjs';

/**
 * Obergrenzen in Zeilen, `wc -l`-Semantik (Zeilenumbrueche, nicht Zeilen).
 *
 * Die drei Grenzen hier schuetzen die Lesbarkeit von Dokumenten, die ganz
 * gelesen werden.
 */
const OBERGRENZEN = {
  'CLAUDE.md': 150,
  'docs/STATUS.md': 60,
  'docs/decisions/OPEN_DECISIONS.md': 400,
};

/**
 * Das Annahmenregister waechst nach 15.1 mit jeder getroffenen Annahme und
 * wird ausdruecklich NICHT als Ganzes gelesen - gearbeitet wird mit dem
 * Pruefpaket, einem `grep` ueber die Statuszeilen. Eine Gesamtgrenze musste
 * deshalb mit jeder neuen Annahme angehoben werden (elfmal zwischen
 * 2026-09-18 und 2026-09-22, von 800 auf 1222) und schuetzte nichts. Seit
 * Umbau U3 gilt die Grenze **je Eintrag**: vom Kopf `### ANN-NNN` bis vor den
 * naechsten, hoechstens 14 Zeilen - das laengste bestehende Format (Kopf,
 * Statuszeile, Abloesung, vier Absaetze mit Leerzeilen). Dazu eine Grenze fuer
 * den Vorspann bis zum ersten Eintrag.
 */
const REGISTER_JE_EINTRAG = 14;
const REGISTER_VORSPANN = 90;

const REGISTER = 'docs/decisions/ASSUMPTIONS.md';

/**
 * Wo eine Annahme verankert sein darf.
 *
 * Tests zaehlen ausdruecklich nicht: Ein Test beschreibt, was gilt, aber er
 * ist nicht die Stelle, an der die Annahme umkehrbar haengt.
 */
const ANKERORTE = [/^src\//, /^supabase\/migrations\//, /^\.github\/workflows\//];
const KEIN_ANKER = /\.test\.[tj]sx?$/;

const verstoesse = [];

function getrackteDateien() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

const dateien = getrackteDateien();

// -----------------------------------------------------------------------------
// 1. Obergrenzen
// -----------------------------------------------------------------------------
for (const [pfad, grenze] of Object.entries(OBERGRENZEN)) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus OBERGRENZEN, fest im Quelltext.
  if (!existsSync(pfad)) {
    verstoesse.push(`${pfad}: fehlt, wird aber von docs:check erwartet.`);
    continue;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus OBERGRENZEN, fest im Quelltext.
  const zeilen = readFileSync(pfad, 'utf8').split('\n').length - 1;
  if (zeilen > grenze) {
    verstoesse.push(`${pfad}: ${zeilen} Zeilen, erlaubt sind ${grenze}.`);
  }
}

if (existsSync(REGISTER)) {
  const zeilen = readFileSync(REGISTER, 'utf8').split('\n');
  const koepfe = zeilen.flatMap((zeile, i) => (/^### ANN-\d{3}\b/.test(zeile) ? [i] : []));
  if (koepfe.length > 0 && koepfe[0] > REGISTER_VORSPANN) {
    verstoesse.push(
      `${REGISTER}: Vorspann ${koepfe[0]} Zeilen, erlaubt sind ${REGISTER_VORSPANN}.`,
    );
  }
  koepfe.forEach((kopf, n) => {
    // Der letzte Eintrag endet mit der Datei; `split` liefert nach dem
    // abschliessenden Zeilenumbruch ein leeres Element, das nicht zaehlt.
    const ende = n + 1 < koepfe.length ? koepfe[n + 1] : zeilen.length - 1;
    const laenge = ende - kopf;
    if (laenge > REGISTER_JE_EINTRAG) {
      // eslint-disable-next-line security/detect-object-injection -- Zahlindex in ein eigenes Array.
      const kennung = zeilen[kopf].slice(4, 11);
      verstoesse.push(
        `${REGISTER}: ${kennung} hat ${laenge} Zeilen, erlaubt sind ${REGISTER_JE_EINTRAG} je Eintrag.`,
      );
    }
  });
}

// -----------------------------------------------------------------------------
// 2. Register-Anker
// -----------------------------------------------------------------------------
const ankerQuellen = dateien.filter(
  (pfad) => ANKERORTE.some((muster) => muster.test(pfad)) && !KEIN_ANKER.test(pfad),
);
const ankertext = ankerQuellen
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus `git ls-files`, nicht aus einer Eingabe.
  .map((pfad) => (statSync(pfad).isFile() ? readFileSync(pfad, 'utf8') : ''))
  .join('\n');

if (existsSync(REGISTER)) {
  const register = readFileSync(REGISTER, 'utf8');
  for (const treffer of register.matchAll(/^### (ANN-\d{3})\b/gm)) {
    const kennung = treffer[1];
    if (!ankertext.includes(kennung)) {
      verstoesse.push(
        `${REGISTER}: ${kennung} hat keinen Anker in src/, supabase/migrations/ oder .github/workflows/.`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// 3. Relative Links
// -----------------------------------------------------------------------------
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

for (const pfad of dateien.filter((p) => p.endsWith('.md'))) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus `git ls-files`, nicht aus einer Eingabe.
  const inhalt = readFileSync(pfad, 'utf8');
  for (const treffer of inhalt.matchAll(LINK)) {
    const ziel = treffer[1];
    if (/^(https?:|mailto:|#)/.test(ziel)) continue;
    const ohneAnker = ziel.split('#')[0];
    if (!ohneAnker) continue;
    const aufgeloest = normalize(join(dirname(pfad), decodeURIComponent(ohneAnker)));
    // Der Pfad stammt aus einem Markdown-Verweis, also aus versioniertem
    // Inhalt, und wird nur auf Existenz geprueft - nichts gelesen, nichts
    // geschrieben. Genau das ist der Zweck der Pruefung.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!existsSync(aufgeloest)) {
      verstoesse.push(`${pfad}: Verweis auf ${ziel} zeigt ins Leere.`);
    }
  }
}

// -----------------------------------------------------------------------------
// 4. Querverweise und 5. eindeutige Nummern
// -----------------------------------------------------------------------------
const markdown = dateien
  .filter((p) => p.endsWith('.md'))
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus `git ls-files`, nicht aus einer Eingabe.
  .map((pfad) => ({ pfad, text: readFileSync(pfad, 'utf8') }));
const prinzipien = readFileSync('PROJECT_PRINCIPLES.md', 'utf8');
const kontext = {
  fassungen: aktuelleFassungen(readFileSync('docs/adr/README.md', 'utf8')),
  versionen: prinzipienVersionen(prinzipien),
  abschnitte: prinzipienAbschnitte(prinzipien),
};
for (const { pfad, text } of markdown) verstoesse.push(...pruefeVerweise(pfad, text, kontext));
verstoesse.push(...pruefeEindeutigkeit(markdown));

// -----------------------------------------------------------------------------
// 6. Fortschrittstabelle aus fortschritt.json
// -----------------------------------------------------------------------------
const FORTSCHRITT = 'docs/development/fortschritt.json';
const ROADMAP = 'docs/development/ROADMAP.md';
if (!tabelleAktuell(readFileSync(ROADMAP, 'utf8'), JSON.parse(readFileSync(FORTSCHRITT, 'utf8')))) {
  verstoesse.push(
    `${ROADMAP}: Die Fortschrittstabelle weicht von ${FORTSCHRITT} ab - \`pnpm fortschritt --schreiben\`.`,
  );
}

// -----------------------------------------------------------------------------
if (verstoesse.length > 0) {
  console.error('Dokumentationsgate: %d Verstoesse.\n', verstoesse.length);
  for (const zeile of verstoesse) console.error(`  - ${zeile}`);
  process.exit(1);
}

console.log(
  'Dokumentationsgate gruen: %d Obergrenzen, %d Register-Eintraege mit Anker und Laengengrenze, Links und Querverweise in %d Markdown-Dateien, Fortschrittstabelle aktuell.',
  Object.keys(OBERGRENZEN).length,
  (readFileSync(REGISTER, 'utf8').match(/^### ANN-\d{3}\b/gm) ?? []).length,
  dateien.filter((p) => p.endsWith('.md')).length,
);
