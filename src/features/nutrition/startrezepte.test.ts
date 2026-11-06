import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Lebensmittel } from './lebensmittel';
import { startrezeptAufloesen } from './rezepte';
import { STARTREZEPTE } from './startrezepte';

// Die synthetischen Lebensmittel des Seeds: Name und Portionen. Jede Zutat der mitgelieferten
// Rezepte heißt genau wie eines davon, damit das Übernehmen auf den Testdaten aufgeht.
const SEED = readFileSync(join(process.cwd(), 'supabase/seed.sql'), 'utf8');
const KATALOG = new Map<string, { label: string; amount: number }[]>(
  [...SEED.matchAll(/^\s*\('([^']+)', '(?:g|ml)', [^']*'(\[[^']*\])'\),?$/gm)].map((t) => [
    t[1]!,
    JSON.parse(t[2]!) as { label: string; amount: number }[],
  ]),
);

function essen(name: string, portionen: { label: string; amount: number }[] = []): Lebensmittel {
  return {
    kind: 'catalog',
    id: `id-${name}`,
    source: 'bls',
    name,
    brand: null,
    base_unit: 'g',
    per_100: {
      energy_kcal: 100,
      protein_g: 1,
      fat_g: 1,
      carbohydrate_g: 1,
      sugar_g: null,
      fibre_g: null,
      saturated_fat_g: null,
      salt_g: null,
    },
    portions: portionen,
  };
}

describe('Mitgelieferte Rezepte (ADR-027 Punkt 14)', () => {
  it('liefert rund dreißig Rezepte mit eindeutigem Schlüssel und Namen in den Grenzen des Servers', () => {
    expect(STARTREZEPTE.length).toBeGreaterThanOrEqual(28);
    expect(STARTREZEPTE.length).toBeLessThanOrEqual(35);
    expect(new Set(STARTREZEPTE.map((r) => r.schluessel)).size).toBe(STARTREZEPTE.length);
    expect(new Set(STARTREZEPTE.map((r) => r.name)).size).toBe(STARTREZEPTE.length);
    for (const r of STARTREZEPTE) {
      // Wie der Constraint am Server: Kleinbuchstaben und Ziffern, Bindestrich nur dazwischen.
      expect(r.schluessel, r.name).toMatch(/^[a-z0-9-]+$/);
      expect(r.schluessel).not.toMatch(/^-|-$|--/);
      expect(r.schluessel.length).toBeLessThanOrEqual(60);
      expect(r.name.length).toBeLessThanOrEqual(120);
      expect(r.portionen).toBeGreaterThanOrEqual(1);
      expect(r.portionen).toBeLessThanOrEqual(20);
      expect(r.zutaten.length).toBeGreaterThanOrEqual(1);
      expect(r.zutaten.length).toBeLessThanOrEqual(40);
      expect(r.zubereitung.length).toBeLessThanOrEqual(4000);
      const summe = r.zutaten.reduce((s, z) => s + z.menge, 0);
      expect(summe, r.name).toBeLessThanOrEqual(5000 * r.portionen);
    }
  });

  it('nennt je Zutat ein Lebensmittel des Seeds, die Portion mit ihrer Menge', () => {
    expect(KATALOG.size).toBeGreaterThan(100);
    for (const r of STARTREZEPTE) {
      for (const z of r.zutaten) {
        const portionen = KATALOG.get(z.suche);
        expect(portionen, `${r.name}: ${z.suche}`).toBeDefined();
        if (z.portion) {
          const portion = portionen!.find((x) => x.label === z.portion!.label);
          expect(portion, `${r.name}: ${z.suche} ${z.portion.label}`).toBeDefined();
          expect(z.menge, `${r.name}: ${z.suche}`).toBe(portion!.amount * z.portion.anzahl);
        }
      }
    }
  });

  it('bewertet kein Lebensmittel und verspricht nichts zur Gesundheit (ADR-027 Punkt 11)', () => {
    const text = STARTREZEPTE.map((r) => `${r.name} ${r.zubereitung}`).join(' ');
    expect(text).not.toMatch(
      /gesund|diät|abnehm|schlank|fettverbrenn|entgift|detox|ungesund|sünd/i,
    );
  });

  it('nimmt beim Übernehmen den gleichnamigen Treffer, sonst die Menge und nennt, was fehlt', async () => {
    const start = {
      schluessel: 'probe',
      name: 'Probe',
      portionen: 1,
      zubereitung: 'Mischen.',
      zutaten: [
        { suche: 'Haferflocken', menge: 50, portion: { label: '1 Portion', anzahl: 1 } },
        { suche: 'Banane roh', menge: 120, portion: { label: '1 Stück (mittel)', anzahl: 1 } },
        { suche: 'Drachenfrucht', menge: 80 },
      ],
    };
    const suchen = (begriff: string) =>
      Promise.resolve(
        begriff === 'Haferflocken'
          ? [
              essen('Haferflockenkekse'),
              essen('Haferflocken', [{ label: '1 Portion', amount: 50 }]),
            ]
          : begriff === 'Banane roh'
            ? [essen('Banane roh')]
            : [],
      );
    const { werte, fehlt, ungenau } = await startrezeptAufloesen(start, suchen);
    expect(werte.zutaten.map((z) => [z.lebensmittel.name, z.angabe, z.menge])).toEqual([
      ['Haferflocken', { art: 'portion', label: '1 Portion', anzahl: 1 }, 50],
      // Die gefundene Banane kennt die Portion nicht: dann die Menge.
      ['Banane roh', { art: 'menge', menge: 120 }, 120],
    ]);
    expect(fehlt).toEqual(['Drachenfrucht']);
    expect(ungenau).toEqual([]);
    expect(werte).toMatchObject({ name: 'Probe', portionen: '1', zubereitung: 'Mischen.' });
  });

  it('nennt Zutaten, die nur ungefähr gefunden wurden', async () => {
    const start = {
      schluessel: 'probe',
      name: 'Probe',
      portionen: 1,
      zubereitung: 'Mischen.',
      zutaten: [{ suche: 'Haferflocken', menge: 50 }],
    };
    const { werte, fehlt, ungenau } = await startrezeptAufloesen(start, () =>
      Promise.resolve([essen('Haferflockenkekse')]),
    );
    expect(werte.zutaten.map((z) => z.lebensmittel.name)).toEqual(['Haferflockenkekse']);
    expect(fehlt).toEqual([]);
    expect(ungenau).toEqual(['Haferflocken']);
  });
});
