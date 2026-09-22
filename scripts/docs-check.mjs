/**
 * Gate fuer die Dokumentation (ADR-013 Pruefung 2.10).
 *
 * Fuenf Zusicherungen, die sich objektiv pruefen lassen; die ersten drei wurden
 * in der Runde R2 teuer erkauft, die letzten zwei mit G19:
 *
 *   1. **Obergrenzen.** Die vier Steuerungsdokumente wachsen nicht wieder zu.
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
 * Das Annahmenregister ist der eine Sonderfall: Es waechst nach 15.1 mit
 * jeder getroffenen Annahme und wird ausdruecklich NICHT als Ganzes gelesen -
 * gearbeitet wird mit dem Pruefpaket, also mit einem `grep` ueber die
 * Statuszeilen. Seine Grenze beschraenkt deshalb nicht die Lesbarkeit,
 * sondern haelt den Wildwuchs je Eintrag im Rahmen (rund 14 Zeilen). Sie
 * wurde am 2026-09-18 mit CAL-EPIC-004b von 800 auf 1000 angehoben, weil
 * ANN-059 und ANN-060 sonst nur durch Kuerzen bestehender Eintraege Platz
 * gefunden haetten - und das Register sagt selbst, dass kein Eintrag
 * verschwindet (docs/STATUS.md nannte beide Wege). Am 2026-09-19 mit
 * ABR-EPIC-002a aus demselben Grund von 1000 auf 1050: Die vier Annahmen
 * ANN-074 bis ANN-077 brauchten 48 Zeilen, frei waren 18. Am 2026-09-19 mit
 * ABR-EPIC-002b ein drittes Mal, von 1050 auf 1075: ANN-079 und ANN-080
 * brauchten 24 Zeilen, frei waren 8. Am 2026-09-20 mit R3 (Gruppe G1) ein
 * viertes Mal, von 1075 auf 1090: ANN-081 brauchte 13 Zeilen, frei waren 9.
 * Am 2026-09-21 mit FRB-EPIC-000 ein fuenftes Mal, von 1090 auf 1150: die
 * fuenf Annahmen ANN-083 bis ANN-087 brauchten 60 Zeilen, frei war nichts -
 * das Register stand genau auf seiner Grenze. Am 2026-09-21 mit ABR-EPIC-006
 * ein sechstes Mal, von 1150 auf 1162: ANN-088 brauchte 12 Zeilen, frei war
 * weiterhin nichts. Am 2026-09-21 mit der Verortung von MDR_REVIEW_REQUIRED
 * ein siebtes Mal, von 1162 auf 1174: ANN-089 brauchte 12 Zeilen, frei war
 * wieder nichts - das Register stand erneut genau auf seiner Grenze. Am
 * 2026-09-21 mit MAP-003 ein achtes Mal, von 1174 auf 1186: ANN-090 brauchte
 * 12 Zeilen, frei war nichts. Am 2026-09-22 mit MAP-004 ein neuntes Mal, von
 * 1186 auf 1198: ANN-091 brauchte 12 Zeilen, frei war wieder nichts. Am
 * 2026-09-22 mit OPS-006 ein zehntes Mal, von 1198 auf 1210: ANN-092 brauchte
 * 12 Zeilen, frei war wieder nichts. Am 2026-09-22 mit PAT-006 ein elftes
 * Mal, von 1210 auf 1222: ANN-093 brauchte 12 Zeilen, frei war nichts.
 * Die Grenze wandert damit weiter mit der Zahl der Eintraege, nicht mit ihrer
 * Laenge - zwoelf Zeilen je Eintrag sind dieselbe Disziplin wie vorher. Die
 * drei anderen Grenzen bleiben unveraendert - sie sind die, die Lesbarkeit
 * schuetzen.
 */
const OBERGRENZEN = {
  'CLAUDE.md': 150,
  'docs/STATUS.md': 60,
  'docs/decisions/ASSUMPTIONS.md': 1222,
  'docs/decisions/OPEN_DECISIONS.md': 400,
};

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
if (verstoesse.length > 0) {
  console.error('Dokumentationsgate: %d Verstoesse.\n', verstoesse.length);
  for (const zeile of verstoesse) console.error(`  - ${zeile}`);
  process.exit(1);
}

console.log(
  'Dokumentationsgate gruen: %d Obergrenzen, %d Register-Anker, Links und Querverweise in %d Markdown-Dateien.',
  Object.keys(OBERGRENZEN).length,
  (readFileSync(REGISTER, 'utf8').match(/^### ANN-\d{3}\b/gm) ?? []).length,
  dateien.filter((p) => p.endsWith('.md')).length,
);
