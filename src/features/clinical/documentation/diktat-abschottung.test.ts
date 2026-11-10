import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ANN-520 und ANN-862 im Browser: Aufnahme, Transkript und jeder Vorschlag leben nur im Zustand
// der Seite. Geprüft am Quelltext: keine Speicher-Schnittstelle, keine Blob-Adresse, keine
// Konsole, kein Datenbankzugriff - und nur Importe aus einer festen Liste, damit kein Umweg bleibt.

const STAMM = process.cwd();

const DATEIEN = [
  'src/features/clinical/documentation/diktat.ts',
  'src/lib/aufnahme.ts',
  'src/features/clinical/documentation/Spracheingabe.tsx',
  'src/features/clinical/documentation/ordnen.ts',
  'src/features/clinical/documentation/GeordneterVorschlag.tsx',
  'src/features/clinical/documentation/auszuege.ts',
  'src/features/clinical/documentation/Auszugsliste.tsx',
  'src/features/patients/treatment-bases/felderVorschlag.ts',
  'src/features/patients/treatment-bases/Feldvorschlaege.tsx',
  'src/features/patients/treatment-bases/rezeptfelder.ts',
  'src/features/portal/messages/umformen.ts',
  'src/features/portal/messages/Umformvorschlag.tsx',
  ...readdirSync(join(STAMM, 'src/lib/ki'))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => `src/lib/ki/${name}`),
];

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /\blocalStorage\b|\bsessionStorage\b/, grund: 'Speicher des Browsers' },
  { muster: /\bindexedDB\b|\bIDBFactory\b/, grund: 'IndexedDB' },
  { muster: /\bcaches\s*\.|\bCacheStorage\b/, grund: 'Cache API' },
  { muster: /createObjectURL/, grund: 'Blob-Adresse' },
  { muster: /navigator\s*\.\s*storage\b/, grund: 'Speicherverwaltung' },
  { muster: /document\s*\.\s*cookie/, grund: 'Cookie' },
  {
    muster: /show(?:Save|Open)FilePicker|showDirectoryPicker|FileSystem\w*Handle/,
    grund: 'Dateisystem',
  },
  { muster: /\bdownload\b/, grund: 'Herunterladen' },
  {
    muster: /\bserviceWorker\b|\bpostMessage\b|\bBroadcastChannel\b/,
    grund: 'Weitergabe an Service Worker oder andere Fenster',
  },
  { muster: /\bconsole\s*\./, grund: 'Konsole' },
  {
    muster: /\.from\s*\(|\.rpc\s*\(|\.storage\b|\.channel\s*\(/,
    grund: 'Datenbank, Ablage oder Realtime',
  },
];

/** Was diese Dateien importieren dürfen - jedes weitere Modul ist ein Fall für die Durchsicht. */
const ERLAUBT = new Set([
  'react',
  '@tanstack/react-query',
  'zod',
  // Nur für `functions.invoke` an den Gateway (`gateway.ts`).
  '@/lib/supabase',
  '@/lib/ki/gateway',
  '@/lib/sperrsicherung',
  '@/lib/aufnahme',
  './diktat',
  './ordnen',
  './umformen',
  './auszuege',
  './felderVorschlag',
  './rezeptfelder',
  // Eine feste Liste ohne Importe (der Heilmittelkatalog).
  './heilmittel',
]);

function erlaubterImport(modul: string): boolean {
  // Jede Datei unter `src/lib/ki` steht selbst in `DATEIEN`: Ein Import dorthin ist kein Umweg.
  return (
    ERLAUBT.has(modul) || modul.startsWith('@/components/ui/') || modul.startsWith('@/lib/ki/')
  );
}

function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lies(pfad: string): string {
  return ohneKommentare(readFileSync(join(STAMM, pfad), 'utf8'));
}

/** Jedes Modul, das die Datei lädt: `… from 'x'`, `import 'x'` und `import('x')`. */
function importe(quelltext: string): string[] {
  const muster = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return muster.flatMap((m) => [...quelltext.matchAll(m)].map((treffer) => treffer[1]!));
}

describe('ANN-520: Diktat und Aufnahme legen nichts ab', () => {
  it('findet die Dateien überhaupt', () => {
    expect(DATEIEN).toContain('src/lib/ki/gateway.ts');
    expect(DATEIEN.length).toBeGreaterThanOrEqual(4);
  });

  it.each(VERBOTEN)('enthält keinen Zugriff: $grund', ({ muster }) => {
    expect(DATEIEN.filter((pfad) => muster.test(lies(pfad)))).toEqual([]);
  });

  it('importiert nur aus der festen Liste', () => {
    // Die Prüfung sieht die Importe wirklich.
    expect(importe(lies('src/features/clinical/documentation/diktat.ts'))).toEqual(
      expect.arrayContaining(['react', '@/lib/ki/gateway', '@/lib/aufnahme']),
    );
    const fremd = DATEIEN.flatMap((pfad) =>
      importe(lies(pfad))
        .filter((modul) => !erlaubterImport(modul))
        .map((modul) => `${pfad}: ${modul}`),
    );
    expect(fremd).toEqual([]);
  });

  it('würde eine Ablage und einen fremden Import tatsächlich finden', () => {
    const findet = (quelltext: string) =>
      VERBOTEN.some(({ muster }) => muster.test(ohneKommentare(quelltext)));
    expect(findet("localStorage.setItem('diktat', text)")).toBe(true);
    expect(findet("indexedDB.open('ablage')")).toBe(true);
    expect(findet('const adresse = URL.createObjectURL(aufnahme.audio);')).toBe(true);
    expect(findet("getSupabase().from('treatment_notes').insert(zeile)")).toBe(true);
    expect(findet("await caches.open('diktat')")).toBe(true);
    expect(findet('// localStorage nur im Kommentar')).toBe(false);

    const mehrzeilig = "import {\n  dauerfachAendern,\n} from '@/lib/geraeteablage';";
    expect(importe(mehrzeilig)).toEqual(['@/lib/geraeteablage']);
    expect(erlaubterImport('@/lib/geraeteablage')).toBe(false);
    expect(erlaubterImport('@/lib/ki/ordnen')).toBe(true);
    expect(erlaubterImport('@/lib/kiste')).toBe(false);
    expect(erlaubterImport('./gateway')).toBe(false);
    expect(erlaubterImport('./api')).toBe(false);
    expect(erlaubterImport('@/features/clinical/documentation/offline/entwuerfe')).toBe(false);
    expect(erlaubterImport('./offline/entwuerfe')).toBe(false);
    expect(importe("const m = await import('./api');")).toEqual(['./api']);
  });
});
