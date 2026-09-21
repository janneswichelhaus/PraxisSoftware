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
 *   1. Was das Register nennt, liegt da und ist unverändert — auch die 18
 *      Original-PDFs, die seit der Entscheidung von Jannes am 2026-09-21 im
 *      Repository liegen (D1, `quellen/README.md`).
 *   2. Was in `quellen/` liegt, steht im Register — keine stille zweite Quelle.
 *   3. Zu jeder PDF gehört ein Textextrakt und umgekehrt. Ein Extrakt ohne PDF
 *      wäre eine Quelle ohne Herkunft, eine PDF ohne Extrakt eine, mit der
 *      niemand arbeiten kann.
 *
 * Die Extrakte selbst tragen keine Prüfsumme: sie sind aus den PDFs gewonnen,
 * und die PDF hat eine. Wer sie neu erzeugt, soll dafür nicht das Register
 * anfassen müssen.
 */

const stamm = process.cwd();
const QUELLEN = join(stamm, 'quellen');
const REGISTER = join(QUELLEN, 'README.md');
const PDF_VERZEICHNIS = join(QUELLEN, 'scores/pdf');
const EXTRAKT_VERZEICHNIS = join(QUELLEN, 'scores/pdf-text');
const BAUSTEIN_PDF = join(QUELLEN, 'bausteine/pdf');
const BAUSTEIN_EXTRAKT = join(QUELLEN, 'bausteine/pdf-text');

/**
 * Dateien, die kein Registereintrag brauchen, weil sie aus den Quellen gewonnen
 * sind: das Register selbst, die lesbare Wiedergabe der Tabelle und die
 * Textextrakte der PDFs. Eine Prüfsumme darauf würde bei jeder Korrektur und
 * bei jeder Neuerzeugung reißen, ohne etwas zu schützen.
 */
const OHNE_PRUEFSUMME = (datei: string): boolean =>
  datei === 'README.md' ||
  datei === 'scores/score-inventar.md' ||
  datei.startsWith('scores/pdf-text/') ||
  datei.startsWith('bausteine/pdf-text/');

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

/** Alle Dateien unter `quellen/`, Pfade relativ und mit Schrägstrich. */
function alleDateien(verzeichnis = QUELLEN): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) gefunden.push(...alleDateien(pfad));
    else gefunden.push(relative(QUELLEN, pfad).split('\\').join('/'));
  }
  return gefunden;
}

const register = registerBlock('### Quellen mit Prüfsumme');

describe('Register der Quellen', () => {
  it.each([...register.keys()])('%s liegt im Repository und ist unverändert', (datei) => {
    const pfad = join(QUELLEN, datei);
    expect(existsSync(pfad), `quellen/${datei} fehlt, steht aber im Register.`).toBe(true);
    expect(pruefsumme(pfad)).toBe(register.get(datei));
  });

  it('nennt jede Quelle, die nicht abgeleitet ist', () => {
    const ohneEintrag = alleDateien().filter(
      (datei) => !OHNE_PRUEFSUMME(datei) && !register.has(datei),
    );
    expect(
      ohneEintrag,
      'Quelle ohne Registereintrag: entweder ins Register aufnehmen oder sie gehört nicht hierher.',
    ).toEqual([]);
  });

  it('fuehrt alle neun MT-Lernuebersichten als PDF', () => {
    // Die Originale hinter mt-untersuchung-quelldaten.md, seit 2026-09-21 im
    // Repository. Die Abnahme von P2 haelt Itemzahlen je Block gegen sie;
    // faellt eine still weg, ist die Extraktion gegen nichts mehr zu pruefen.
    const uebersichten = [...register.keys()].filter((datei) => datei.startsWith('bausteine/pdf/'));
    expect(uebersichten).toHaveLength(9);
  });

  it('fuehrt alle 18 Fragebogen als PDF', () => {
    // Die Zahl steht im Inventar und im Arbeitsauftrag. Faellt eine Datei
    // still weg, sagt diese Zeile es, bevor eine Score-Definition ohne Quelle
    // entsteht.
    const pdfs = [...register.keys()].filter((datei) => datei.startsWith('scores/pdf/'));
    expect(pdfs).toHaveLength(18);
  });
});

describe('Textextrakte der MT-Lernuebersichten', () => {
  // Anders als bei den Scores sind diese Extrakte *freiwillig*: Die maßgebliche
  // Uebertragung ist mt-untersuchung-quelldaten.md, und pdftotext gibt es in
  // der Cloud nicht. Wer sie lokal erzeugt, soll sie pushen koennen, ohne dass
  // das Register sie als zweite Quelle missversteht.
  //
  // Eine Richtung bleibt trotzdem hart: Ein Extrakt ohne PDF waere eine Quelle
  // ohne Herkunft - dieselbe Regel wie bei den Scores.
  const vorhanden = existsSync(BAUSTEIN_EXTRAKT);
  const pdfs = readdirSync(BAUSTEIN_PDF).map((datei) => datei.replace(/\.pdf$/, ''));
  const extrakte = vorhanden
    ? readdirSync(BAUSTEIN_EXTRAKT).map((datei) => datei.replace(/\.txt$/, ''))
    : [];

  it('enthaelt kein Extrakt ohne Lernuebersicht', () => {
    expect(extrakte.filter((name) => !pdfs.includes(name))).toEqual([]);
  });

  it('haelt die neun Lernuebersichten beisammen', () => {
    expect(pdfs).toHaveLength(9);
  });
});

describe('Textextrakte der PDFs', () => {
  const pdfs = readdirSync(PDF_VERZEICHNIS).map((datei) => datei.replace(/\.pdf$/, ''));
  const extrakte = readdirSync(EXTRAKT_VERZEICHNIS).map((datei) => datei.replace(/\.txt$/, ''));

  it.each(pdfs)('%s hat ein Extrakt', (name) => {
    expect(
      extrakte,
      `Extrakt fehlt. Neu erzeugen: siehe quellen/README.md, "Wiederbeschaffung und Neuerzeugung".`,
    ).toContain(name);
  });

  it('enthaelt kein Extrakt ohne PDF', () => {
    // Ein Extrakt ohne Herkunft ist schlimmer als keins: es sieht aus wie eine
    // Quelle, und niemand kann seinen Wortlaut gegen etwas halten.
    expect(extrakte.filter((name) => !pdfs.includes(name))).toEqual([]);
  });
});
