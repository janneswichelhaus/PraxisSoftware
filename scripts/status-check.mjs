#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Haelt docs/STATUS.md davon ab, einen gemergten Pull Request weiter als offen
// zu fuehren.
//
// Der Anlass: PR #41 und #42 wurden am 2026-09-16 gemergt. STATUS.md nannte sie
// danach noch tagelang unter "Zum Merge - Reihenfolge verbindlich", und die
// Aufgabe unter "Jetzt" trug den Zusatz "beginnt erst auf Freigabe, nach den
// Merges unten". Wer das Dokument las, hielt erledigte Arbeit fuer offen. Genau
// das soll STATUS.md nicht koennen: Zeile 3 sagt "Livestand, sonst nichts".
//
// Die Ursache ist strukturell, nicht nachlaessig. STATUS.md spiegelt von Hand
// einen Zustand, den GitHub fuehrt. Solche Spiegel laufen immer auseinander,
// weil der Merge ausserhalb der Sitzung passiert, in der das Dokument zuletzt
// angefasst wurde. Ein Mensch merkt es erst, wenn er stutzt.
//
// Geprueft wird deshalb maschinell und **ohne Netz**: Welche PR-Nummer nennt
// STATUS.md, und liegt der zugehoerige Merge-Commit schon in `main`? Beides
// steht im geklonten Repository. Kein Token, kein API-Aufruf, keine neue
// Abhaengigkeit - dieselbe Linie wie `docs-check.mjs`.
//
// **Bewusst kein blockierendes Gate.** Der Verstoss entsteht erst durch den
// Merge selbst: Solange der PR offen ist, darf STATUS.md ihn nennen, und im
// Augenblick des Merges wird dieselbe Datei falsch. Ein Gate in `pnpm test`
// oder `pnpm docs:check` wuerde `main` also nach jedem Merge rot faerben, ohne
// dass jemand etwas falsch gemacht haette. Das Skript laeuft darum in einem
// eigenen, nicht merge-blockierenden Workflow
// (`.github/workflows/status-drift.yml`).
//
// Gesucht wird in der **ganzen Datei**, nicht nur im Merge-Abschnitt: STATUS.md
// fuehrt nur den Livestand, also ist jede Nennung eines gemergten PR dort
// veraltet - und die Pruefung ueberlebt es, wenn eine Ueberschrift umbenannt
// wird.
//
// Grenze, die bleibt: Offline ist nur **gemergt** erkennbar. Ein ohne Merge
// geschlossener PR faellt nicht auf. Das ist der Preis dafuer, dass die
// Pruefung ohne Token und ohne Netz laeuft.
//
// Aufruf:
//   pnpm status:check                      # gegen docs/STATUS.md und main
//   pnpm status:check --json               # maschinenlesbar
//   node scripts/status-check.mjs --status <pfad> --merged 41,42
// -----------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argumente = process.argv.slice(2);

/** Wert eines Schalters (`--status <wert>`), sonst `undefined`. */
function wertVon(name) {
  const stelle = argumente.indexOf(name);
  return stelle >= 0 ? argumente[stelle + 1] : undefined;
}

const statusDatei = wertVon('--status') ?? 'docs/STATUS.md';
const alsJson = argumente.includes('--json');

/**
 * PR-Nummern, die eine Datei nennt.
 *
 * Erfasst `#42` und `PR #42`. Die Nummer muss an einer Wortgrenze beginnen,
 * damit eine Raute in einem Anker oder einer Farbangabe (`#4285f4`) nicht als
 * PR durchgeht.
 */
function genannteNummern(text) {
  const treffer = text.matchAll(/(?<![\w/])#(\d{1,6})\b/g);
  return [...new Set([...treffer].map((t) => Number(t[1])))].sort((a, b) => a - b);
}

/**
 * PR-Nummern, die ein Commit-Betreff als gemergt ausweist.
 *
 * Zwei Schreibweisen, weil GitHub beide erzeugt:
 *   - Merge-Commit: `Merge pull request #42 from janneswichelhaus/...`
 *   - Squash:       `FIX-015: Dateizugriff (#42)`
 */
function gemergteNummern(betreffzeilen) {
  const nummern = new Set();
  for (const zeile of betreffzeilen) {
    const merge = /^Merge pull request #(\d+)\b/.exec(zeile);
    if (merge) nummern.add(Number(merge[1]));
    const squash = /\(#(\d+)\)\s*$/.exec(zeile);
    if (squash) nummern.add(Number(squash[1]));
  }
  return nummern;
}

/** Erster vorhandener Ref aus der Liste, sonst `undefined`. */
function ersterRef(kandidaten) {
  for (const ref of kandidaten) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { stdio: 'pipe' });
      return ref;
    } catch {
      // Ref gibt es hier nicht - naechster Kandidat.
    }
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// Datengrundlage
// -----------------------------------------------------------------------------
// eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus der Kommandozeile eines Entwicklerskripts, nur gelesen.
const statustext = readFileSync(statusDatei, 'utf8');
const genannt = genannteNummern(statustext);

const mergedSchalter = wertVon('--merged');
let gemergt;
let quelle;
let unvollstaendig = false;

if (mergedSchalter !== undefined) {
  // Ausdruecklich vorgegeben: fuer Tests und fuer den Blick von Hand.
  gemergt = new Set(
    mergedSchalter
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isInteger(n)),
  );
  quelle = `--merged ${mergedSchalter}`;
} else {
  const ref = wertVon('--ref') ?? ersterRef(['origin/main', 'main']);
  if (!ref) {
    gemergt = new Set();
    quelle = 'kein main-Ref';
    unvollstaendig = true;
  } else {
    const log = execFileSync('git', ['log', '--format=%s', ref], { encoding: 'utf8' });
    const zeilen = log.split('\n').filter(Boolean);
    gemergt = gemergteNummern(zeilen);
    quelle = `${ref} (${zeilen.length} Commits)`;
    // Ein flacher Klon kennt die Merge-Commits nicht und meldet deshalb nichts.
    // Eine Pruefung, die in diesem Fall still gruen ist, luegt - also gesagt.
    if (zeilen.length <= 1) unvollstaendig = true;
  }
}

const verstoesse = genannt.filter((nummer) => gemergt.has(nummer));

// -----------------------------------------------------------------------------
// Bericht
// -----------------------------------------------------------------------------
if (alsJson) {
  console.log(
    JSON.stringify({ statusDatei, genannt, verstoesse, quelle, unvollstaendig }, null, 2),
  );
} else if (unvollstaendig) {
  console.error(
    `Statusgate unvollstaendig: %s. Ohne Historie ist nicht feststellbar, ` +
      `welcher PR gemergt ist (flacher Klon? dann "fetch-depth: 0").`,
    quelle,
  );
} else if (verstoesse.length > 0) {
  console.error(
    '%s nennt %d gemergte(n) Pull Request als offen:\n',
    statusDatei,
    verstoesse.length,
  );
  for (const nummer of verstoesse) {
    console.error(`  - #${nummer} ist in ${quelle} bereits gemergt.`);
  }
  console.error(
    `\nSTATUS.md fuehrt den Livestand. Den Eintrag entfernen oder auf den Stand ` +
      `nach dem Merge bringen; Erledigtes gehoert in die Fortschrittstabelle ` +
      `der Roadmap, nicht in den Livestand.`,
  );
} else {
  console.log(
    'Statusgate gruen: %d PR-Nennung(en) in %s, keine davon gemergt (%s).',
    genannt.length,
    statusDatei,
    quelle,
  );
}

if (verstoesse.length > 0 || unvollstaendig) process.exit(1);
