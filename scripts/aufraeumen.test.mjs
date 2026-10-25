import { describe, expect, it } from 'vitest';
import {
  KENNZAHLEN,
  alsMarkdown,
  ausMarkdown,
  dbFunktionen,
  doppelungen,
  importziel,
  kategorie,
  messen,
  groessterRing,
  modulgrenzen,
} from './aufraeumen.mjs';

const zeilen = (...z) => z.join('\n');

describe('kategorie', () => {
  it('ordnet Programm, Tests, Migrationen, Doku und Rest zu', () => {
    expect(kategorie('src/features/a/Seite.tsx')).toBe('programm');
    expect(kategorie('supabase/functions/ai-gateway/handler.ts')).toBe('programm');
    expect(kategorie('src/index.css')).toBe('programm');
    expect(kategorie('src/features/a/Seite.test.tsx')).toBe('tests');
    expect(kategorie('src/test-utils.tsx')).toBe('tests');
    expect(kategorie('tests/e2e/termine.spec.ts')).toBe('tests');
    expect(kategorie('supabase/tests/helpers/db.ts')).toBe('tests');
    expect(kategorie('supabase/migrations/20260101000000_eins.sql')).toBe('migrationen');
    expect(kategorie(`docs/STATUS.md`)).toBe('doku');
    expect(kategorie('scripts/fortschritt.mjs')).toBe('rest');
    expect(kategorie('marke/wortmarke.png')).toBeNull();
  });
});

describe('importziel', () => {
  it('findet das Modul unter src/features und den Pfad darin', () => {
    expect(importziel('src/features/a/A.tsx', '@/features/b/api')).toEqual({
      modul: 'b',
      rest: 'api',
    });
    expect(importziel('src/features/a/A.tsx', '../b/teil/Seite.tsx')).toEqual({
      modul: 'b',
      rest: 'teil/Seite',
    });
    expect(importziel('src/app/App.tsx', '@/features/b')).toEqual({ modul: 'b', rest: '' });
    expect(importziel('src/features/a/A.tsx', 'react')).toBeNull();
    expect(importziel('src/features/a/A.tsx', '@/lib/zeit')).toBeNull();
  });
});

describe('modulgrenzen', () => {
  it('zaehlt Querimporte, tiefe Importe und gegenseitige Abhaengigkeiten', () => {
    const { querimporte, tief, gegenseitig, ziele } = modulgrenzen([
      { pfad: 'src/features/a/A.tsx', text: "import { x } from '@/features/b/intern';" },
      { pfad: 'src/features/b/B.tsx', text: "import { y } from '../a';" },
      { pfad: 'src/app/App.tsx', text: "const S = lazy(() => import('@/features/a/Seite'));" },
    ]);
    expect([querimporte, tief, gegenseitig]).toEqual([2, 2, ['a <-> b']]);
    expect([...ziele.get('a').von]).toEqual(['src/app']);
  });

  it('misst den groessten Ring auch ueber Ketten, ohne die Module, die nur hineinzeigen', () => {
    expect(groessterRing(['a>b', 'b>c', 'c>a', 'd>a', 'c>e'])).toBe(3);
    expect(groessterRing(['a>b', 'b>a', 'c>d', 'd>e', 'e>c', 'e>f'])).toBe(3);
    expect(groessterRing(['a>b', 'b>c'])).toBe(0);
    const { ringgruppe } = modulgrenzen([
      { pfad: 'src/features/a/A.tsx', text: "import { x } from '@/features/b';" },
      { pfad: 'src/features/b/B.tsx', text: "import { y } from '@/features/c/intern';" },
      { pfad: 'src/features/c/C.tsx', text: "import { z } from '../a/A';" },
    ]);
    expect(ringgruppe).toBe(3);
  });
});

describe('dbFunktionen', () => {
  it('zaehlt Funktionen nach Name, Neufassungen und geloeschte', () => {
    const { anzahl, neufassungen, fassungen } = dbFunktionen([
      {
        text: zeilen(
          'create function public.f(a int) returns int language sql as $$ select a $$;',
          'create or replace function',
          '  g() returns int language sql as $$ select 1 $$;',
        ),
      },
      {
        text: zeilen(
          'create or replace function public.f(a int) returns int language sql as $$ select 2 $$;',
          'drop function if exists public.g(), h(text);',
        ),
      },
    ]);
    expect([anzahl, neufassungen, fassungen.get('public.f')]).toEqual([1, 1, 2]);
  });
});

describe('doppelungen', () => {
  const gemeinsam = Array.from({ length: 8 }, (_, i) => `const gemeinsam${i} = ${i};`);
  const eigen = Array.from({ length: 8 }, (_, i) => `const eigen${i} = ${i};`);

  it('misst den Anteil doppelter Zeilen und das Paar dazu', () => {
    const { prozent, paare } = doppelungen([
      { pfad: 'src/a.ts', text: zeilen(...gemeinsam, ...eigen) },
      { pfad: 'src/b.ts', text: zeilen('// Kommentare zaehlen nicht', ...gemeinsam, '}') },
    ]);
    expect(prozent).toBe(66.7);
    expect(paare).toEqual([['src/a.ts <-> src/b.ts', 8]]);
  });
});

describe('Ablage', () => {
  it('liest zurueck, was sie schreibt', () => {
    const kennzahlen = new Map(KENNZAHLEN.map(([s], i) => [s, i + 0.5]));
    const gelesen = ausMarkdown(alsMarkdown('2026-10-25', 'abc1234', kennzahlen));
    expect(gelesen).toEqual({ stand: '2026-10-25', commit: 'abc1234', kennzahlen });
  });
});

describe('messen', () => {
  it('liefert jede Kennzahl und zaehlt lange Kommentare ohne Migrationen', () => {
    const lang = zeilen('// eins', '// zwei', '// drei', '// vier', 'export const a = 1;');
    const { kennzahlen } = messen([
      { pfad: 'src/features/a/A.ts', text: lang },
      {
        pfad: 'supabase/migrations/20260101000000_eins.sql',
        text: zeilen('-- a', '-- b', '-- c', '-- d', 'select 1;'),
      },
    ]);
    expect([...kennzahlen.keys()]).toEqual(KENNZAHLEN.map(([s]) => s));
    expect(kennzahlen.get('zeilen_gesamt')).toBe(10);
    expect(kennzahlen.get('lange_kommentare')).toBe(1);
    expect(kennzahlen.get('kommentaranteil_programm')).toBe(80);
  });
});
