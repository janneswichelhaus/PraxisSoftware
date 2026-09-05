/* eslint-disable security/detect-non-literal-fs-filename --
   Der Test liest ausschliesslich Verzeichnisse des eigenen Repositories, deren
   Namen unten fest im Quelltext stehen. Es gibt keine Eingabe von aussen, die
   den Pfad beeinflussen koennte. Die Regel bleibt fuer den Anwendungscode
   unveraendert aktiv. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { erzeugeVorschauzustand } from './vorschauZustand';
import { standortvorlageKoeln } from './standortvorlage';

/**
 * Die Vorschaubereiche müssen technisch von echten Vorgängen getrennt bleiben.
 *
 * Das ist die tragende Zusicherung dieses Umbaus: Aus einer Vorschauaktion darf
 * keine echte Speicherung, Genehmigung, Nachricht oder Zahlung entstehen. Die
 * Prüfung läuft über den Quelltext, weil eine Verhaltensprüfung nur die Wege
 * abdeckt, die ein Test zufällig durchläuft - ein neuer Serveraufruf in einer
 * ungetesteten Ecke bliebe unbemerkt.
 *
 * `src/features/today` ist bewusst nicht dabei: „Mein Tag" mischt echte Termine
 * mit einem sichtbar abgesetzten Vorschaublock und muss deshalb mit dem Server
 * sprechen.
 *
 * `src/features/staff` stand hier, solange dieser Umbau eigene Vorschauseiten
 * für Personal mitbrachte. Beide sind beim Zusammenführen mit `main` entfallen:
 * die Mitarbeiterverwaltung ist mit STAFF-001 echt angebunden und MUSS mit dem
 * Server sprechen. Das Verzeichnis hier zu lassen, hieße die eigene Zusicherung
 * zu verwässern — geprüft wird, dass **Vorschaubereiche** keinen Server
 * berühren, nicht dass irgendein Verzeichnis es nicht tut.
 */

const VORSCHAUBEREICHE = [
  'src/features/preview',
  'src/features/fleet',
  'src/features/vacation',
  'src/features/timeaccount',
  'src/features/reimbursements',
  'src/features/teamchat',
  'src/features/tours',
  'src/features/billing',
];

/** Aufrufe, die die Sitzung verlassen oder etwas dauerhaft ablegen würden. */
const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /getSupabase/, grund: 'Datenbankzugriff' },
  { muster: /@\/lib\/supabase/, grund: 'Datenbankzugriff' },
  { muster: /\brpc\s*\(/, grund: 'Serverfunktion' },
  { muster: /\bfetch\s*\(/, grund: 'Netzwerkaufruf' },
  { muster: /XMLHttpRequest/, grund: 'Netzwerkaufruf' },
  { muster: /sendBeacon/, grund: 'Netzwerkaufruf' },
  { muster: /localStorage/, grund: 'Persistenz' },
  { muster: /sessionStorage/, grund: 'Persistenz' },
  { muster: /indexedDB/, grund: 'Persistenz' },
  { muster: /mailto:/, grund: 'Versandweg' },
];

/**
 * Quelltext ohne Kommentare.
 *
 * Geprüft wird, was die Anwendung tut, nicht wovon ein Kommentar spricht - ein
 * Kommentar, der erklärt, warum es hier gerade KEINE Mailverknüpfung gibt, darf
 * die Prüfung nicht auslösen. `//` nach einem Doppelpunkt bleibt stehen, damit
 * eine URL in einer Zeichenkette den Rest der Zeile nicht verschluckt.
 */
function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function quelldateien(verzeichnis: string): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      gefunden.push(...quelldateien(pfad));
    } else if (
      /\.tsx?$/.test(eintrag) &&
      !eintrag.endsWith('.test.ts') &&
      !eintrag.endsWith('.test.tsx')
    ) {
      gefunden.push(pfad);
    }
  }
  return gefunden;
}

describe('Trennung von Vorschau und echten Vorgängen', () => {
  const dateien = VORSCHAUBEREICHE.flatMap(quelldateien);

  it('findet die Vorschaubereiche ueberhaupt', () => {
    expect(dateien.length).toBeGreaterThan(15);
  });

  it.each(VERBOTEN)('enthaelt keinen $grund ($muster)', ({ muster }) => {
    const treffer = dateien.filter((pfad) =>
      muster.test(ohneKommentare(readFileSync(pfad, 'utf8'))),
    );
    expect(treffer).toEqual([]);
  });

  it('wuerde einen Serveraufruf tatsaechlich finden', () => {
    // Gegenprobe: Sonst prueft der Test nur, dass Kommentare weggeschnitten
    // werden, und nicht, dass die Muster ueberhaupt greifen.
    const beispiel = ohneKommentare('const x = getSupabase(); // getSupabase()');
    expect(VERBOTEN.some(({ muster }) => muster.test(beispiel))).toBe(true);
    expect(ohneKommentare('// localStorage')).not.toMatch(/localStorage/);
  });
});

describe('Standortvorlage', () => {
  it('ist als ungeprueft gekennzeichnet', () => {
    expect(standortvorlageKoeln.geprueft).toBe(false);
    expect(standortvorlageKoeln.pruefhinweis).toMatch(/Tübingen/);
  });

  it('enthaelt keine betrieblichen Kontaktdaten oder Zugangscodes', () => {
    const werte = [
      standortvorlageKoeln.werkstatt.name,
      standortvorlageKoeln.werkstatt.telefon,
      standortvorlageKoeln.werkstatt.mobil,
      standortvorlageKoeln.depot.zugangHinweis,
    ].join(' ');
    // Keine Telefonnummer und keine mehrstellige Zahlenfolge, die als Code
    // gelesen werden koennte.
    expect(werte).not.toMatch(/\d{3,}/);
    expect(werte).toMatch(/nicht hinterlegt|nicht in der Anwendung gespeichert/);
  });

  it('benennt Zustaendigkeit als Rolle, nicht als Person', () => {
    expect(standortvorlageKoeln.zustaendigeRolle).toBe('Teamleitung');
  });
});

describe('Vorschaudaten', () => {
  const zustand = erzeugeVorschauzustand(new Date('2026-08-31T09:00:00Z'));

  it('ist realistisch gefuellt und nicht nur eine Handvoll Zeilen', () => {
    expect(zustand.raeder.length).toBeGreaterThanOrEqual(8);
    expect(zustand.mitarbeitende.length).toBeGreaterThanOrEqual(6);
    expect(zustand.urlaub.length).toBeGreaterThanOrEqual(4);
  });

  it('enthaelt zwei sehr aehnliche Namen zur Pruefung der Zuordnung', () => {
    const namen = zustand.mitarbeitende.map((person) => person.name);
    expect(namen).toContain('Lena Hartmann');
    expect(namen).toContain('Lena Hartung');
  });

  it('enthaelt ein gesperrtes Rad, ein Ersatzrad und ein Rad am falschen Standort', () => {
    expect(zustand.raeder.some((rad) => rad.status === 'reparatur')).toBe(true);
    expect(zustand.raeder.some((rad) => rad.ersatzrad)).toBe(true);
    expect(zustand.raeder.some((rad) => rad.depotId !== rad.stammdepotId)).toBe(true);
  });

  it('rechnet die Daten auf den Stichtag, damit die Vorschau nicht veraltet', () => {
    const spaeter = erzeugeVorschauzustand(new Date('2027-01-15T09:00:00Z'));
    expect(zustand.stichtag).toBe('2026-08-31');
    expect(spaeter.stichtag).toBe('2027-01-15');
    expect(spaeter.urlaub[0]?.von.startsWith('2027')).toBe(true);
  });

  it('verwendet ausschliesslich synthetische Kontaktdaten', () => {
    for (const person of zustand.mitarbeitende) {
      expect(person.email).toMatch(/@praxis\.invalid$/);
    }
  });
});
