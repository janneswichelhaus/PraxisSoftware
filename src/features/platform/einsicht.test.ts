// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import {
  EINSICHT_LESEN,
  IN_DER_EINSICHT,
  PlattformApiKontext,
  einsichtsApi,
  usePlattformApi,
  type Einsichtsquelle,
  type PlattformApi,
} from './einsicht';

/**
 * Die Datenquelle der Einsicht (E-001, DSN-001 D7): Lesen geht über die
 * eingespeiste Quelle, alles andere wirft, bevor etwas das Gerät verlässt.
 * Der Server prüft dasselbe noch einmal (`platform_preview`,
 * `supabase/tests/platform-preview.test.ts`).
 */

const netz = vi.hoisted(() => ({ aufgerufen: 0 }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    netz.aufgerufen += 1;
    throw new Error('Das Netz darf hier nicht angesprochen werden.');
  },
}));

const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
const ANDERER = 'cafecafe-cafe-4afe-8afe-000000000003';
const RECHNUNG = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';

/** Je lesender Funktion: Aufruf, erwartete Projektion und Argumente, eine gültige Antwort. */
const LESEND: Record<
  string,
  {
    aufruf: (a: PlattformApi) => Promise<unknown>;
    projektion: string;
    argumente?: object;
    daten: unknown;
  }
> = {
  ladeMeineVertretungen: {
    aufruf: (a) => a.ladeMeineVertretungen(ZUGANG),
    projektion: 'platform_representatives',
    daten: [],
  },
  ladeTermine: {
    aufruf: (a) => a.ladeTermine(ZUGANG),
    projektion: 'platform_appointments',
    daten: [],
  },
  ladeWuensche: {
    aufruf: (a) => a.ladeWuensche(ZUGANG),
    projektion: 'platform_appointment_requests',
    daten: [],
  },
  ladeBefundbogen: {
    aufruf: (a) => a.ladeBefundbogen(ZUGANG),
    projektion: 'platform_questionnaire',
    daten: [],
  },
  ladeRechnungen: {
    aufruf: (a) => a.ladeRechnungen(ZUGANG),
    projektion: 'platform_invoices',
    daten: [],
  },
  ladeRechnung: {
    aufruf: (a) => a.ladeRechnung(ZUGANG, RECHNUNG),
    projektion: 'platform_invoice',
    argumente: { p_invoice_id: RECHNUNG },
    daten: null,
  },
  ladeDokumente: {
    aufruf: (a) => a.ladeDokumente(ZUGANG),
    projektion: 'platform_files',
    daten: [],
  },
  ladeEinwilligungen: {
    aufruf: (a) => a.ladeEinwilligungen(ZUGANG),
    projektion: 'platform_consents',
    daten: [],
  },
  ladeMeinePakete: {
    aufruf: (a) => a.ladeMeinePakete(ZUGANG),
    projektion: 'platform_training_packages',
    daten: null,
  },
  ladeAngebote: {
    aufruf: (a) => a.ladeAngebote(ZUGANG),
    projektion: 'platform_training_offers',
    daten: null,
  },
  ladeEinstieg: {
    aufruf: (a) => a.ladeEinstieg(ZUGANG),
    projektion: 'platform_onboarding',
    daten: [],
  },
  ladeAbo: { aufruf: (a) => a.ladeAbo(ZUGANG), projektion: 'platform_aftercare', daten: null },
  ladeTrainingsangebot: {
    aufruf: (a) => a.ladeTrainingsangebot(ZUGANG),
    projektion: 'platform_training_offer',
    daten: null,
  },
  ladeVertrag: {
    aufruf: (a) => a.ladeVertrag(ZUGANG),
    projektion: 'platform_training_contract',
    daten: null,
  },
  ladePlaene: {
    aufruf: (a) => a.ladePlaene(ZUGANG),
    projektion: 'platform_exercise_plans',
    daten: { today: '2026-10-14', plans: [] },
  },
  ladeNachrichten: {
    aufruf: (a) => a.ladeNachrichten(ZUGANG),
    projektion: 'platform_messages',
    daten: { response_workdays: 2, can_write: true, health_topics: true, messages: [] },
  },
  ladeCheckins: {
    aufruf: (a) => a.ladeCheckins(ZUGANG),
    projektion: 'platform_checkins',
    daten: null,
  },
  ladeGewohnheiten: {
    aufruf: (a) => a.ladeGewohnheiten(ZUGANG),
    projektion: 'platform_habits',
    daten: null,
  },
};

function quelleMit(daten: unknown) {
  return vi.fn<Einsichtsquelle>(() => Promise.resolve({ data: daten, error: null }));
}

/** Die feste Liste des Servers aus der jüngsten Migration, die sie setzt. */
function listeDesServers(): string[] {
  const inhalt = readdirSync('supabase/migrations')
    .filter((datei) => datei.endsWith('.sql'))
    .sort()
    .map((datei) => readFileSync(`supabase/migrations/${datei}`, 'utf8'))
    .filter((text) => text.includes('function app.platform_preview_functions()'))
    .at(-1)!;
  const rumpf = inhalt.slice(inhalt.indexOf('function app.platform_preview_functions()'));
  const liste = /array\[([^\]]*)\]/.exec(rumpf)![1]!;
  return [...liste.matchAll(/'([a-z_]+)'/g)].map((t) => t[1]!);
}

describe('Datenquelle der Einsicht (E-001)', () => {
  beforeEach(() => {
    netz.aufgerufen = 0;
  });

  it('liest genau die Projektionen, die auch der Server in der Einsicht führt', () => {
    expect(['platform_context', ...EINSICHT_LESEN].sort()).toEqual(listeDesServers().sort());
    expect(
      Object.values(LESEND)
        .map((l) => l.projektion)
        .sort(),
    ).toEqual([...EINSICHT_LESEN].sort());
  });

  it('kennt jede Funktion der Plattform, die den Server fragt', () => {
    const asynchron = Object.entries(api)
      .filter(([, wert]) => typeof wert === 'function' && wert.constructor.name === 'AsyncFunction')
      .map(([name]) => name)
      // Den Kontext lädt in der Einsicht die Praxisseite selbst.
      .filter((name) => name !== 'ladePlattformkontext')
      .sort();
    expect(asynchron.length).toBeGreaterThan(40);
    expect(Object.keys(einsichtsApi(ZUGANG, quelleMit(null))).sort()).toEqual(asynchron);
  });

  it.each(Object.entries(LESEND))('%s liest über die Quelle, nie direkt', async (_name, l) => {
    const quelle = quelleMit(l.daten);
    await l.aufruf(einsichtsApi(ZUGANG, quelle));
    expect(quelle).toHaveBeenCalledTimes(1);
    expect(quelle).toHaveBeenCalledWith(l.projektion, l.argumente ?? {});
    expect(netz.aufgerufen).toBe(0);
  });

  it('liest nur den einen Zugang der Einsicht', async () => {
    const quelle = quelleMit([]);
    await expect(einsichtsApi(ANDERER, quelle).ladeTermine(ZUGANG)).rejects.toThrow(
      IN_DER_EINSICHT,
    );
    expect(quelle).not.toHaveBeenCalled();
    expect(netz.aufgerufen).toBe(0);
  });

  it('meldet einen Fehler der Quelle mit dem Satz der Seite', async () => {
    const quelle = vi.fn<Einsichtsquelle>(() =>
      Promise.resolve({ data: null, error: new Error('403') }),
    );
    await expect(einsichtsApi(ZUGANG, quelle).ladeTermine(ZUGANG)).rejects.toThrow(
      'Ihre Termine konnten nicht geladen werden.',
    );
  });

  it('wirft bei jedem anderen Weg, bevor etwas das Gerät verlässt', async () => {
    const quelle = quelleMit(null);
    const einsicht = einsichtsApi(ZUGANG, quelle);
    const schreibend = Object.entries(einsicht).filter(([name]) => !(name in LESEND));
    // Schreiben, Öffnen von Dokumenten und Anhängen, Export, Abmelden, das Gerät.
    expect(schreibend.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'terminWuenschen',
        'nachrichtStellen',
        'einwilligungSchreiben',
        'ladeDokumentZumAnzeigen',
        'ladeDokumentHerunter',
        'ladeAnhang',
        'ladeDatenexport',
        'ueberallAbmelden',
        'registriereGeraet',
        'ladeBenachrichtigungen',
      ]),
    );
    for (const [name, funktion] of schreibend) {
      const aufruf = (funktion as (...argumente: unknown[]) => Promise<unknown>)(
        ZUGANG,
        RECHNUNG,
        true,
      );
      await expect(aufruf, name).rejects.toThrow(IN_DER_EINSICHT);
    }
    expect(quelle).not.toHaveBeenCalled();
    expect(netz.aufgerufen).toBe(0);
  });

  it('liefert ohne Einsicht die Funktionen der Person, wie bisher', () => {
    const { result } = renderHook(() => usePlattformApi());
    expect(result.current.ladeTermine).toBe(api.ladeTermine);
    expect(result.current.terminWuenschen).toBe(api.terminWuenschen);
  });

  it('liefert in der Einsicht deren Fassung - nur, wo der Kontext sie setzt', () => {
    const einsicht = einsichtsApi(ZUGANG, quelleMit(null));
    const huelle = ({ children }: { children: ReactNode }) =>
      createElement(PlattformApiKontext.Provider, { value: einsicht }, children);
    const { result } = renderHook(() => usePlattformApi(), { wrapper: huelle });
    expect(result.current).toBe(einsicht);
  });

  it('holt in jeder Seite die Funktionen über usePlattformApi, nie direkt aus ./api', () => {
    const verzeichnis = join(import.meta.dirname, '.');
    const namen = new Set(Object.keys(einsichtsApi(ZUGANG, quelleMit(null))));
    const direkt = readdirSync(verzeichnis)
      .filter((datei) => datei.endsWith('.tsx') && !datei.endsWith('.test.tsx'))
      .flatMap((datei) => {
        const quelltext = readFileSync(join(verzeichnis, datei), 'utf8');
        const importe = [...quelltext.matchAll(/import \{([^}]*)\} from '\.\/api';/g)].flatMap(
          (t) => t[1]!.split(',').map((teil) => teil.trim()),
        );
        return importe.filter((name) => namen.has(name)).map((name) => `${datei}: ${name}`);
      });
    expect(direkt).toEqual([]);
  });
});
