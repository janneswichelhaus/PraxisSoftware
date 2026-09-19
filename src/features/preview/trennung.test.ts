import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
 * `src/features/today` ist bewusst nicht dabei: die Übersicht mischt echte Termine
 * mit einem sichtbar abgesetzten Vorschaublock und muss deshalb mit dem Server
 * sprechen.
 *
 * `src/features/staff` stand hier, solange dieser Umbau eigene Vorschauseiten
 * für Personal mitbrachte. Beide sind beim Zusammenführen mit `main` entfallen:
 * die Mitarbeiterverwaltung ist mit STAFF-001 echt angebunden und MUSS mit dem
 * Server sprechen. Das Verzeichnis hier zu lassen, hieße die eigene Zusicherung
 * zu verwässern — geprüft wird, dass **Vorschaubereiche** keinen Server
 * berühren, nicht dass irgendein Verzeichnis es nicht tut.
 *
 * `src/features/billing` ist aus demselben Grund mit **ABR-EPIC-003**
 * entfallen. Es stand hier ab ABR-EPIC-001 nur noch als gemischtes
 * Verzeichnis mit einer namentlichen Ausnahme je echter Datei; die letzte
 * Vorschau war die Zahlungsseite. Seit sie echt gebucht wird, gibt es im
 * Bereich keine Vorschau mehr, die zu schützen wäre — und ein Verzeichnis, in
 * dem jede Datei eine Ausnahme ist, prüft nichts.
 */

const VORSCHAUBEREICHE = [
  'src/features/preview',
  'src/features/fleet',
  'src/features/vacation',
  'src/features/timeaccount',
  'src/features/reimbursements',
  'src/features/teamchat',
  'src/features/tours',
];

/**
 * Dateien in einem Vorschauverzeichnis, die keine Vorschau mehr sind.
 *
 * Zurzeit leer: Die Liste trug bis ABR-EPIC-003 die echt angebundenen Dateien
 * von `src/features/billing`, und mit dem Verzeichnis ist auch sie entfallen.
 * Sie bleibt als Mechanismus stehen — der nächste Bereich, der Stück für
 * Stück echt wird, braucht sie wieder.
 */
const KEINE_VORSCHAU: string[] = [];

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

/**
 * Reine Hilfsfunktionen aus echten API-Modulen, die ein Vorschaubereich
 * importieren darf: Sie formatieren oder rechnen, ohne mit dem Server zu
 * sprechen. Alles andere aus `src/features/<bereich>/api.ts` bleibt draussen -
 * sonst liefe der Datenbankzugriff ueber den Import an dieser Pruefung vorbei,
 * weil nur der eigene Quelltext des Vorschaubereichs gescannt wird.
 *
 * Erfasst werden dafuer **alle** Importformen: benannt, `import * as`,
 * Standardimport, Seiteneffekt und `import(...)`. Ein Namensraumimport gaebe
 * Zugriff auf das ganze Modul und ist deshalb nie erlaubt, auch nicht fuer
 * einen Namen aus dieser Liste.
 */
const ERLAUBTE_API_IMPORTE = new Set(['todayInTimeZone']);

/**
 * Module ausserhalb der Vorschaubereiche, die ein Vorschaubereich benutzen
 * darf. Eine Positivliste, keine Verbotsliste: ein neues Modul faellt damit
 * auf, statt unbemerkt hereinzukommen.
 *
 * `@/lib/...` ist dabei, weil dort die anbieterfreien Hilfsmittel liegen
 * (Formate, Kalenderrechnung). Der eine gefaehrliche Fall, `@/lib/supabase`,
 * steht in VERBOTEN und wird davon nicht beruehrt.
 */
const ERLAUBTE_MODULE = [
  /^react$/,
  /^react-router-dom$/,
  /^@\/components\/ui\//,
  /^@\/features\/session\/types$/,
  /^@\/features\/preview\//,
  /^@\/lib\//,
];

/** `@/features/<bereich>/api` - ohne `preview`, das ist der eigene Bereich. */
const API_MODUL = /^@\/features\/([^/]+)\/api$/;

interface Import {
  modul: string;
  /** Die benannten Bindungen, oder `null` bei Namensraum-, Standard- und Seiteneffektimport. */
  namen: string[] | null;
}

/**
 * Alle Modulangaben einer Datei, mit der Importform davor.
 *
 * Gesucht wird nach der Zeichenkette hinter `from`, hinter `import(` und hinter
 * einem blossen `import`; das deckt auch `export ... from` ab. Welche Form es
 * war, entscheidet der Text davor bis zum naechsten `import`/`export` - ohne
 * verschachtelte Quantoren, damit kein Muster rueckwaerts laufen kann
 * (eslint security/detect-unsafe-regex).
 */
const MODULANGABE = /(?:from|import)\s*\(?\s*'([^']+)'/g;

function importe(quelltext: string): Import[] {
  const gefunden: Import[] = [];
  for (const treffer of quelltext.matchAll(MODULANGABE)) {
    const davor = quelltext.slice(0, treffer.index);
    const beginn = Math.max(davor.lastIndexOf('import'), davor.lastIndexOf('export'));
    const klausel = beginn === -1 ? '' : davor.slice(beginn);
    const geschweift = klausel.indexOf('{');
    if (geschweift !== -1 && !klausel.slice(0, geschweift).includes('*')) {
      const namen = klausel
        .slice(geschweift + 1, klausel.indexOf('}') === -1 ? undefined : klausel.indexOf('}'))
        .split(',')
        .map((eintrag) =>
          eintrag
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter(Boolean);
      gefunden.push({ modul: treffer[1]!, namen });
    } else {
      gefunden.push({ modul: treffer[1]!, namen: null });
    }
  }
  return gefunden;
}

/**
 * Importe, die ein Vorschaubereich nicht haben darf - als lesbare Begruendung.
 *
 * `pfad` ist die Datei, damit ein relativer Import aufgeloest werden kann: er
 * muss innerhalb der Vorschaubereiche bleiben. `../../lib/supabase` ist sonst
 * genau die Luecke, die eine Namenspruefung uebersieht.
 */
function unerlaubteImporte(pfad: string, quelltext: string): string[] {
  const treffer: string[] = [];
  for (const { modul, namen } of importe(ohneKommentare(quelltext))) {
    if (modul.startsWith('.')) {
      const ziel = join(dirname(pfad), modul);
      if (!VORSCHAUBEREICHE.some((bereich) => ziel.startsWith(bereich))) {
        treffer.push(`${modul} (verlaesst die Vorschaubereiche)`);
      }
      continue;
    }
    const api = API_MODUL.exec(modul);
    if (api) {
      if (api[1] === 'preview') continue;
      if (namen === null) {
        treffer.push(`${modul} (nur benannte Importe erlaubt)`);
        continue;
      }
      for (const name of namen) {
        if (!ERLAUBTE_API_IMPORTE.has(name)) treffer.push(`${name} aus ${modul}`);
      }
      continue;
    }
    if (!ERLAUBTE_MODULE.some((muster) => muster.test(modul))) {
      treffer.push(`${modul} (nicht in der Positivliste)`);
    }
  }
  return treffer;
}

describe('Trennung von Vorschau und echten Vorgängen', () => {
  const dateien = VORSCHAUBEREICHE.flatMap(quelldateien).filter(
    (pfad) => !KEINE_VORSCHAU.includes(pfad),
  );

  it('nennt nur Dateien als Ausnahme, die es auch gibt', () => {
    // Sonst bliebe eine Ausnahme stehen, wenn die Datei umbenannt wird - und
    // die Ausnahme deckte am Ende eine andere Datei als gemeint.
    for (const pfad of KEINE_VORSCHAU) {
      expect(statSync(pfad).isFile()).toBe(true);
    }
  });

  it('findet die Vorschaubereiche ueberhaupt', () => {
    expect(dateien.length).toBeGreaterThan(15);
  });

  it.each(VERBOTEN)('enthaelt keinen $grund ($muster)', ({ muster }) => {
    const treffer = dateien.filter((pfad) =>
      muster.test(ohneKommentare(readFileSync(pfad, 'utf8'))),
    );
    expect(treffer).toEqual([]);
  });

  it('importiert nur aus erlaubten Modulen', () => {
    const treffer = dateien
      .map((pfad) => ({ pfad, namen: unerlaubteImporte(pfad, readFileSync(pfad, 'utf8')) }))
      .filter(({ namen }) => namen.length > 0);
    expect(treffer).toEqual([]);
  });

  it('wuerde jede Importform einer echten API tatsaechlich finden', () => {
    // Gegenprobe zu jeder Form, die der Scanner kennen muss. `beispiel` liegt
    // in einem Vorschaubereich, damit relative Pfade richtig aufgeloest werden.
    const beispiel = 'src/features/fleet/Beispiel.tsx';
    const pruefe = (quelltext: string) => unerlaubteImporte(beispiel, quelltext);

    expect(
      pruefe("import { fetchPatient, todayInTimeZone } from '@/features/patients/api';"),
    ).toEqual(['fetchPatient aus @/features/patients/api']);
    expect(pruefe("import * as patients from '@/features/patients/api';")).toEqual([
      '@/features/patients/api (nur benannte Importe erlaubt)',
    ]);
    expect(pruefe("import patients from '@/features/patients/api';")).toEqual([
      '@/features/patients/api (nur benannte Importe erlaubt)',
    ]);
    expect(pruefe("import '@/features/patients/api';")).toEqual([
      '@/features/patients/api (nur benannte Importe erlaubt)',
    ]);
    expect(pruefe("const m = await import('@/features/patients/api');")).toEqual([
      '@/features/patients/api (nur benannte Importe erlaubt)',
    ]);
    expect(pruefe("export { fullName } from '@/features/patients/api';")).toEqual([
      'fullName aus @/features/patients/api',
    ]);

    // Ein Modul ausserhalb der Positivliste und ein relativer Pfad, der die
    // Vorschaubereiche verlaesst.
    expect(pruefe("import { z } from 'zod';")).toEqual(['zod (nicht in der Positivliste)']);
    expect(pruefe("import { fullName } from '../patients/api';")).toEqual([
      '../patients/api (verlaesst die Vorschaubereiche)',
    ]);

    // Und die Gegenprobe zur Gegenprobe: das Erlaubte bleibt erlaubt.
    expect(pruefe("import { vorschauId } from '@/features/preview/api';")).toEqual([]);
    expect(pruefe("import type { CurrentUser } from '@/features/session/types';")).toEqual([]);
    expect(pruefe("import { formatDate } from '@/lib/datum';")).toEqual([]);
    expect(pruefe("import { useState } from 'react';")).toEqual([]);
    expect(pruefe("import { Vorschauzustand } from './vorschauZustand';")).toEqual([]);
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
