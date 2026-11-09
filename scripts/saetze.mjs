/**
 * Sätze in der Oberfläche (Leitfaden L7): Text in JSX, der wie ein Satz aussieht. Die Ratsche in
 * `src/designsystem.test.ts` zählt damit je Verzeichnis; `node scripts/saetze.mjs [teil]` listet.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Attribute ohne sichtbaren Text: Vorgelesenes zählt nicht, Klassen und Pfade sind keine Sprache.
const OHNE_TEXT = new Set([
  'accept',
  'alt',
  'autoComplete',
  'capture',
  'className',
  'd',
  'dir',
  'form',
  'href',
  'htmlFor',
  'id',
  'inputMode',
  'key',
  'lang',
  'method',
  'name',
  'pattern',
  'points',
  'rel',
  'role',
  'src',
  'target',
  'to',
  'transform',
  'type',
  'viewBox',
]);

const woerter = (text) => text.split(' ').filter(Boolean);

/** Ein Satz: mindestens fünf Wörter und ein Satzende, ein Satzwechsel oder neun Wörter. */
export function istSatz(roh) {
  const text = roh.replace(/\s+/g, ' ').trim();
  const teile = woerter(text);
  if (teile.length < 5) return false;
  // Klassenlisten und Kennungen: ohne Großbuchstaben und überwiegend mit Bindestrich oder Doppelpunkt.
  const technisch = teile.filter((teil) => /[-:/[\]=]/.test(teil)).length * 2 >= teile.length;
  if (!/[A-ZÄÖÜ]/.test(text) && technisch) return false;
  return /[.!?…]["“”»)]?$/.test(text) || /[.!?:] [A-ZÄÖÜ„]/.test(text) || teile.length >= 9;
}

/** Die Sätze eines Quelltexts mit Zeile; Ausdrücke in Vorlagen stehen als `X`. */
export function saetzeIn(quelltext, dateiname = 'datei.tsx') {
  const datei = ts.createSourceFile(
    dateiname,
    quelltext,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const funde = [];
  const merken = (knoten, roh) => {
    const text = roh.replace(/\s+/g, ' ').trim();
    if (!istSatz(text)) return;
    const { line } = datei.getLineAndCharacterOfPosition(knoten.getStart(datei));
    funde.push({ zeile: line + 1, text });
  };
  // `inJsx`: Der Knoten steht in einem JSX-Ausdruck, ein Text darin ist sichtbar.
  const besuchen = (knoten, inJsx) => {
    if (ts.isJsxText(knoten)) {
      merken(knoten, knoten.getText(datei));
      return;
    }
    if (ts.isJsxAttribute(knoten)) {
      const name = knoten.name.getText(datei);
      if (OHNE_TEXT.has(name) || /^(aria|data)-/.test(name)) return;
      const wert = knoten.initializer;
      if (wert && ts.isStringLiteral(wert)) merken(wert, wert.text);
      else if (wert) ts.forEachChild(wert, (kind) => besuchen(kind, true));
      return;
    }
    if (inJsx && (ts.isStringLiteral(knoten) || ts.isNoSubstitutionTemplateLiteral(knoten))) {
      merken(knoten, knoten.text);
      return;
    }
    if (inJsx && ts.isTemplateExpression(knoten)) {
      merken(
        knoten,
        [knoten.head.text, ...knoten.templateSpans.map((s) => s.literal.text)].join('X'),
      );
      return;
    }
    const element =
      ts.isJsxElement(knoten) || ts.isJsxSelfClosingElement(knoten) || ts.isJsxFragment(knoten);
    const weiter = ts.isJsxExpression(knoten) ? true : element ? false : inJsx;
    ts.forEachChild(knoten, (kind) => besuchen(kind, weiter));
  };
  besuchen(datei, false);
  return funde;
}

/** Druckblätter sind Dokumente, keine Oberfläche (DESIGN.md „Druckblatt“, L7). */
export const DRUCKBLATT = /Druck|Print|blatt|Briefkopf/;

/** Alle `.tsx` unter `verzeichnis` außer Tests und Druckblättern. */
export function oberflaechendateien(verzeichnis) {
  const treffer = [];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner unter src/ im Repository.
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus readdirSync.
    if (statSync(pfad).isDirectory()) treffer.push(...oberflaechendateien(pfad));
    else if (/\.tsx$/.test(eintrag) && !/\.test\.tsx$/.test(eintrag) && !DRUCKBLATT.test(eintrag))
      treffer.push(pfad);
  }
  return treffer;
}

function hauptprogramm() {
  const stamm = process.cwd();
  const teile = process.argv.slice(2);
  let summe = 0;
  for (const datei of oberflaechendateien(join(stamm, 'src'))) {
    const pfad = relative(stamm, datei).split(sep).join('/');
    if (teile.length > 0 && !teile.some((teil) => pfad.includes(teil))) continue;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Datei aus oberflaechendateien.
    for (const fund of saetzeIn(readFileSync(datei, 'utf8'), datei)) {
      summe += 1;
      console.log(`${pfad}:${fund.zeile}: ${fund.text}`);
    }
  }
  console.log(`${summe} Sätze`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) hauptprogramm();
