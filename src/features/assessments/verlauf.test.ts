import { describe, expect, it } from 'vitest';
import type { Erhebung } from './api';
import { instrumentFuer } from './instrumente';
import { EREIGNISARTEN, messreihen, nichtVergleichbar, tagZahl, zeitraum } from './verlauf';
import { readFileSync } from 'node:fs';

const anamnese = instrumentFuer('anamnese_v8')!;

function erhebung(abweichung: Partial<Erhebung>): Erhebung {
  return {
    id: 'e',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: '2026-09-20',
    answers: {},
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '',
    updated_at: '',
    completed_at: '2026-09-20T08:00:00Z',
    author_name: null,
    completed_by_name: null,
    ...abweichung,
  };
}

describe('Messreihen (FRB-002e)', () => {
  it('nimmt nur geltende Bögen, als Rohwerte in zeitlicher Folge', () => {
    const reihen = messreihen(
      [
        erhebung({ recorded_on: '2026-10-01', answers: { schmerzstaerke: { wert: 4 } } }),
        erhebung({ recorded_on: '2026-09-01', answers: { schmerzstaerke: { wert: 7 } } }),
        // Ersetzt durch eine abgeschlossene Korrektur: zählt nicht mehr.
        erhebung({
          id: 'alt',
          recorded_on: '2026-09-02',
          answers: { schmerzstaerke: { wert: 2 } },
          superseded_by_response_id: 'x',
        }),
        erhebung({
          id: 'x',
          recorded_on: '2026-09-02',
          answers: { schmerzstaerke: { wert: 3 } },
          supersedes_response_id: 'alt',
        }),
        // Eine Korrektur im Entwurf ersetzt noch nichts.
        erhebung({
          id: 'y',
          recorded_on: '2026-09-05',
          answers: { schmerzstaerke: { wert: 5 } },
          superseded_by_response_id: 'z',
        }),
        erhebung({
          id: 'z',
          status: 'entwurf',
          recorded_on: '2026-09-05',
          answers: { schmerzstaerke: { wert: 1 } },
          supersedes_response_id: 'y',
        }),
        erhebung({
          recorded_on: '2026-09-03',
          status: 'entwurf',
          answers: { schmerzstaerke: { wert: 9 } },
        }),
      ],
      [anamnese],
    );
    expect(reihen.map((r) => [r.item.nummer, r.punkte])).toEqual([
      [
        3,
        [
          { datum: '2026-09-01', wert: 7 },
          { datum: '2026-09-02', wert: 3 },
          { datum: '2026-09-05', wert: 5 },
          { datum: '2026-10-01', wert: 4 },
        ],
      ],
    ]);
  });

  it('zeichnet nur vergleichbare Fassungen in eine Reihe (BEF-101 Punkt 4)', () => {
    const erhebungen = [
      erhebung({ id: 'a', recorded_on: '2026-09-01', answers: { schmerzstaerke: { wert: 7 } } }),
      erhebung({
        id: 'b',
        definition_version: '0.9.0',
        recorded_on: '2026-08-01',
        answers: { schmerzstaerke: { wert: 8 } },
      }),
    ];
    expect(messreihen(erhebungen, [anamnese])[0]!.punkte).toEqual([
      { datum: '2026-09-01', wert: 7 },
    ]);
    expect(nichtVergleichbar(erhebungen, [anamnese])).toBe(1);

    const vermerkt = { ...anamnese, meta: { ...anamnese.meta, vergleichbar_mit: ['0.9.0'] } };
    expect(messreihen(erhebungen, [vermerkt])[0]!.punkte).toHaveLength(2);
    expect(nichtVergleichbar(erhebungen, [vermerkt])).toBe(0);
  });

  it('zeigt mindestens zwei Wochen, damit ein Punkt nicht am Rand klebt', () => {
    const bereich = zeitraum(['2026-09-20'])!;
    expect(bereich.bis - bereich.von).toBeGreaterThanOrEqual(14);
    expect(bereich.von).toBeLessThan(tagZahl('2026-09-20'));
    expect(zeitraum([])).toBeNull();
  });

  it('kennt dieselben Ereignisarten wie die Datenbank', () => {
    const migration = readFileSync(
      'supabase/migrations/20260926110000_frb_002e_course_events.sql',
      'utf8',
    );
    const zeile = /kind in \(([^)]*)\)/.exec(migration)![1]!;
    expect([...zeile.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual([...EREIGNISARTEN]);
  });
});
