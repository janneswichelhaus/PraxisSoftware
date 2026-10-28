/**
 * Gate fuer die Dokumentation (ADR-013 Pruefung 2.10): Obergrenzen, Register, Links, Querverweise,
 * Nummern und Fortschrittstabelle. Was es prueft und warum: `docs/DEVELOPMENT.md`, docs:check.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { tabelleAktuell } from './fortschritt-tabelle.mjs';
import {
  OBERGRENZEN,
  SKILL_GRENZE_BYTES,
  aktuelleFassungen,
  dateigrenzen,
  prinzipienAbschnitte,
  prinzipienVersionen,
  pruefeBefundkennungen,
  pruefeEindeutigkeit,
  pruefeGesamtgrenze,
  pruefeObergrenzen,
  pruefeRegister,
  pruefeVerweise,
} from './docs-check-regeln.mjs';

/** Jeder Skill unter `.claude/skills/<name>/SKILL.md` bekommt dieselbe Grenze. */
const SKILLS = '.claude/skills';
const skillGrenzen = existsSync(SKILLS)
  ? readdirSync(SKILLS, { withFileTypes: true })
      .filter((eintrag) => eintrag.isDirectory())
      .map((eintrag) => ({ pfad: `${SKILLS}/${eintrag.name}/SKILL.md`, bytes: SKILL_GRENZE_BYTES }))
  : [];

const REGISTER = 'docs/decisions/ASSUMPTIONS.md';
// Register, deren Kennungen auch als Tabellenzeile stehen (Regel D).
const TABELLENREGISTER = new Set([REGISTER, 'docs/product/IDEENSPEICHER.md']);

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
const grenzen = [...OBERGRENZEN, ...skillGrenzen, ...dateigrenzen(dateien)];

// -----------------------------------------------------------------------------
// 1. Obergrenzen
// -----------------------------------------------------------------------------
verstoesse.push(
  ...pruefeObergrenzen(grenzen, (pfad) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus OBERGRENZEN (fest im Quelltext) und den Verzeichnissen unter .claude/skills.
    existsSync(pfad) ? readFileSync(pfad, 'utf8') : null,
  ),
);

const register = existsSync(REGISTER)
  ? pruefeRegister(REGISTER, readFileSync(REGISTER, 'utf8'))
  : { verstoesse: [], kennungen: [] };
verstoesse.push(...register.verstoesse);

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

for (const kennung of register.kennungen) {
  if (!ankertext.includes(kennung)) {
    verstoesse.push(
      `${REGISTER}: ${kennung} hat keinen Anker in src/, supabase/migrations/ oder .github/workflows/.`,
    );
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
verstoesse.push(...pruefeEindeutigkeit(markdown, TABELLENREGISTER));
verstoesse.push(...pruefeGesamtgrenze(markdown));
verstoesse.push(...pruefeBefundkennungen(markdown));

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
  grenzen.length,
  register.kennungen.length,
  dateien.filter((p) => p.endsWith('.md')).length,
);
