import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Das Register in `quellen/README.md` sagt die Wahrheit über die Quellen.
 *
 * `quellen/` hält Fremdmaterial, aus dem später wörtlich Daten werden:
 * Testbezeichnungen der Manuellen Therapie und Itemtexte von 18 Fragebögen.
 * Für beides gilt, dass der Wortlaut zählt — bei den Fragebögen hebt eine
 * geänderte Formulierung die Vergleichbarkeit mit den Normwerten auf.
 *
 * Ein Register mit Prüfsummen, das niemand prüft, ist eine Behauptung. Dieser
 * Test macht daraus eine Zusicherung, in drei Richtungen:
 *
 *   1. Was das Register nennt, liegt da und ist unverändert.
 *   2. Was in `quellen/` liegt, steht im Register — keine stille zweite Quelle.
 *   3. Die 18 Original-PDFs liegen nicht im Repository (es ist öffentlich,
 *      siehe `quellen/README.md`). Sind sie lokal da, werden sie mitgeprüft;
 *      fehlt das Verzeichnis ganz, wird der Teil übersprungen.
 *
 * Punkt 3 ist bewusst hart, sobald das Verzeichnis existiert: ein halb
 * gefülltes Quellenverzeichnis ist genau der stille Verlust, gegen den das
 * Register angelegt wurde.
 */

const stamm = process.cwd();
const QUELLEN = join(stamm, 'quellen');
const REGISTER = join(QUELLEN, 'README.md');
const PDF_VERZEICHNIS = join(QUELLEN, 'scores/pdf');

/**
 * Dateien, die kein Registereintrag brauchen: das Register selbst und die
 * lesbare Wiedergabe der Tabelle. Die Wiedergabe wird beim Nachziehen einer
 * Zeile mit geändert; eine Prüfsumme darauf würde bei jeder Korrektur reißen,
 * ohne etwas zu schützen.
 */
const OHNE_PRUEFSUMME = ['README.md', 'scores/score-inventar.md'];

/** Nicht im Repository, siehe `.gitignore` und `quellen/README.md`. */
const NICHT_VERSIONIERT = ['scores/pdf', 'scores/pdf-text'];

const registertext = readFileSync(REGISTER, 'utf8');

/**
 * Liest den ersten Codeblock nach einer Überschrift als `sha256sum`-Liste.
 *
 * Absichtlich an die Überschrift gebunden statt an die Reihenfolge der
 * Codeblöcke: Wer im Register eine Überschrift umbenennt, soll einen klaren
 * Fehler bekommen und nicht versehentlich den falschen Block prüfen.
 */
function registerBlock(ueberschrift: string): Map<string, string> {
  const ab = registertext.indexOf(ueberschrift);
  if (ab === -1) throw new Error(`quellen/README.md: Überschrift "${ueberschrift}" fehlt.`);
  const start = registertext.indexOf('```', ab);
  const ende = registertext.indexOf('```', start + 3);
  if (start === -1 || ende === -1) {
    throw new Error(`quellen/README.md: kein Codeblock unter "${ueberschrift}".`);
  }
  const eintraege = new Map<string, string>();
  for (const zeile of registertext.slice(start + 3, ende).split('\n')) {
    const treffer = /^([0-9a-f]{64})\s\s(.+?)\s*$/.exec(zeile);
    if (treffer) eintraege.set(treffer[2]!, treffer[1]!);
  }
  if (eintraege.size === 0) {
    throw new Error(`quellen/README.md: Block unter "${ueberschrift}" nennt keine Datei.`);
  }
  return eintraege;
}

function pruefsumme(pfad: string): string {
  return createHash('sha256').update(readFileSync(pfad)).digest('hex');
}

/** Alle Dateien unter `quellen/`, ohne die nicht versionierten Verzeichnisse. */
function versionierteDateien(verzeichnis = QUELLEN): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    const relativ = relative(QUELLEN, pfad).split('\\').join('/');
    if (NICHT_VERSIONIERT.includes(relativ)) continue;
    if (statSync(pfad).isDirectory()) gefunden.push(...versionierteDateien(pfad));
    else gefunden.push(relativ);
  }
  return gefunden;
}

const imRepository = registerBlock('### Im Repository');
const lokal = registerBlock('### Lokal, nicht im Repository');

describe('Register der Quellen', () => {
  it.each([...imRepository.keys()])('%s liegt im Repository und ist unverändert', (datei) => {
    const pfad = join(QUELLEN, datei);
    expect(existsSync(pfad), `quellen/${datei} fehlt, steht aber im Register.`).toBe(true);
    expect(pruefsumme(pfad)).toBe(imRepository.get(datei));
  });

  it('nennt jede versionierte Quelle', () => {
    const ohneEintrag = versionierteDateien().filter(
      (datei) => !OHNE_PRUEFSUMME.includes(datei) && !imRepository.has(datei),
    );
    expect(
      ohneEintrag,
      'Quelle ohne Registereintrag: entweder ins Register aufnehmen oder sie gehört nicht hierher.',
    ).toEqual([]);
  });

  it('haelt die 18 Fragebogen-PDFs aus dem oeffentlichen Repository heraus', () => {
    // Ein versehentlich mitversioniertes PDF waere nach dem Push nicht mehr
    // zurueckzunehmen (quellen/README.md, "Warum die PDFs nicht im
    // Repository liegen"). Deshalb steht die Zusicherung hier, nicht nur in
    // der .gitignore.
    expect(lokal.size).toBe(18);
    for (const datei of lokal.keys()) {
      expect(imRepository.has(`scores/pdf/${datei}`)).toBe(false);
    }
  });
});

describe.skipIf(!existsSync(PDF_VERZEICHNIS))('Lokale Original-PDFs', () => {
  it.each([...lokal.keys()])('%s ist vorhanden und unverändert', (datei) => {
    const pfad = join(PDF_VERZEICHNIS, datei);
    expect(
      existsSync(pfad),
      `quellen/scores/pdf/${datei} fehlt. Direktlink siehe quellen/scores/score-inventar.md.`,
    ).toBe(true);
    expect(pruefsumme(pfad)).toBe(lokal.get(datei));
  });

  it('enthaelt keine Datei, die das Register nicht kennt', () => {
    const unbekannt = readdirSync(PDF_VERZEICHNIS).filter((datei) => !lokal.has(datei));
    expect(unbekannt, 'Nicht registrierte Quelle in quellen/scores/pdf/.').toEqual([]);
  });
});
