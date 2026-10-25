/**
 * Gate: Ein neuer oder geänderter Kommentar hat höchstens drei Zeilen Text und nennt keine Tickets.
 * Geprüft wird nur, was der Diff berührt; der Bestand wird beim nächsten Anfassen gekürzt.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const HOECHSTENS = 3;
const ENDUNGEN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|css|sql)$/;
// Kennungen von Tickets und Epics: Kürzel, Bindestrich, drei Ziffern. ANN und ADR nennen das Warum,
// SHA, AES und ISO sind Normen.
const TICKET = /\b(?!(?:ANN|ADR|SHA|AES|ISO)-)[A-Z][A-Z0-9]{1,6}(?:-EPIC)?-\d{3}[a-z]?\b/g;
const ANWEISUNG =
  /^(eslint-|@ts-|prettier-ignore|@vitest-environment|istanbul |c8 |@jsx|@vite-ignore|deno-|@deno-|\/\s*<reference)/;

export function sprache(pfad) {
  return pfad.endsWith('.sql') ? 'sql' : 'ts';
}

/** Zusammenhängende reine Kommentarzeilen als Blöcke, Zeilennummern ab 1. */
export function kommentarbloecke(text, art) {
  const zeilen = text.split('\n');
  const bloecke = [];
  let block = null;
  let imBlock = false;
  zeilen.forEach((zeile, i) => {
    const s = zeile.trim();
    let kommentar = imBlock;
    if (imBlock) {
      if (s.includes('*/')) imBlock = false;
    } else if (s.startsWith(art === 'sql' ? '--' : '//')) {
      kommentar = true;
    } else if (s.startsWith('/*') || s.startsWith('{/*')) {
      const ende = s.indexOf('*/', 2);
      // Folgt dem Kommentar noch Code in derselben Zeile, ist es eine Codezeile.
      kommentar = ende < 0 || /^\}?$/.test(s.slice(ende + 2).trim());
      imBlock = ende < 0;
    }
    if (!kommentar) {
      block = null;
      return;
    }
    if (!block) bloecke.push((block = { start: i + 1, zeilen: [] }));
    block.zeilen.push(zeile);
  });
  return bloecke.map((b) => ({ ...b, ende: b.start + b.zeilen.length - 1 }));
}

/** Der Text einer Kommentarzeile ohne Zeichen des Kommentars. */
export function inhalt(zeile) {
  return zeile
    .trim()
    .replace(/^\{?\/\*+/, '')
    .replace(/\*\/\}?$/, '')
    .replace(/^\/\/|^--/, '')
    .replace(/^\*(?!\/)/, '')
    .trim();
}

/** Zeilen mit Text; Trennlinien und Anweisungen an Werkzeuge zählen nicht. */
export function textzeilen(block) {
  return block.zeilen.filter((zeile) => {
    const t = inhalt(zeile);
    return t !== '' && !/^[-=*~_#]+$/.test(t) && !ANWEISUNG.test(t);
  }).length;
}

/** Die Verstöße einer Datei; `neu` sind die Zeilennummern, die der Diff hinzufügt. */
export function pruefeDatei(pfad, text, neu) {
  const verstoesse = [];
  for (const block of kommentarbloecke(text, sprache(pfad))) {
    const neueZeilen = block.zeilen.filter((_, i) => neu.has(block.start + i));
    if (neueZeilen.length === 0) continue;
    const anzahl = textzeilen(block);
    if (anzahl > HOECHSTENS) {
      verstoesse.push(
        `${pfad}:${block.start}: Kommentar mit ${anzahl} Zeilen, höchstens ${HOECHSTENS} - nur das Warum; Begründung ins ADR oder als ANN.`,
      );
    }
    const tickets = [...new Set(neueZeilen.flatMap((z) => z.match(TICKET) ?? []))];
    if (tickets.length > 0) {
      verstoesse.push(
        `${pfad}:${block.start}: ${tickets.join(', ')} im Kommentar - Tickets und Epics gehören in Commit und PR, im Code nur ANN- und ADR-Verweise.`,
      );
    }
  }
  return verstoesse;
}

/** Hinzugefügte Zeilen je Datei aus `git diff --unified=0`. */
export function neueZeilenAusDiff(diff) {
  const neu = new Map();
  let pfad = null;
  let imKopf = false;
  for (const zeile of diff.split('\n')) {
    if (zeile.startsWith('diff --git ')) {
      [pfad, imKopf] = [null, true];
      continue;
    }
    // Nur im Kopf einer Datei: Eine entfernte SQL-Zeile `-- x` steht im Rumpf als `--- x`.
    if (imKopf && zeile.startsWith('+++ ')) {
      pfad = zeile === '+++ /dev/null' ? null : zeile.slice(6);
      if (pfad) neu.set(pfad, new Set());
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+),?(\d*) @@/.exec(zeile);
    if (hunk) imKopf = false;
    if (!hunk || !pfad) continue;
    const start = Number(hunk[1]);
    const anzahl = hunk[2] === '' ? 1 : Number(hunk[2]);
    for (let n = start; n < start + anzahl; n++) neu.get(pfad).add(n);
  }
  return neu;
}

function git(...argumente) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...argumente], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function main() {
  const basis = git('merge-base', process.argv[2] || 'origin/main', 'HEAD').trim();
  const neu = neueZeilenAusDiff(
    git('diff', '--unified=0', '--no-color', '--no-ext-diff', '-M', '--diff-filter=AMR', basis),
  );
  // Lokal zählen auch Dateien, die noch nicht im Index liegen.
  for (const pfad of git('ls-files', '--others', '--exclude-standard').split('\n')) {
    if (pfad) neu.set(pfad, null);
  }
  const verstoesse = [];
  let dateien = 0;
  for (const [pfad, zeilen] of neu) {
    if (!ENDUNGEN.test(pfad)) continue;
    let text;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus git diff im Repository.
      text = readFileSync(pfad, 'utf8');
    } catch {
      continue;
    }
    const alle = zeilen ?? new Set(text.split('\n').map((_, i) => i + 1));
    verstoesse.push(...pruefeDatei(pfad, text, alle));
    dateien++;
  }
  if (verstoesse.length > 0) {
    console.error(
      `Kommentarregel rot (Basis ${basis.slice(0, 7)}, docs/DEVELOPMENT.md "Kommentare"):`,
    );
    for (const verstoss of verstoesse) console.error(`  - ${verstoss}`);
    process.exit(1);
  }
  console.log(
    `Kommentarregel gruen: ${dateien} geaenderte Datei(en) gegen ${basis.slice(0, 7)} geprueft.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
