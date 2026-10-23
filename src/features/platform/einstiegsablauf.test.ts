import { describe, expect, it } from 'vitest';
import type { Plattformzugang } from './api';
import {
  einstiegsseiten,
  nochFragen,
  willkommenssatz,
  willkommenstitel,
  zahlwort,
} from './einstiegsablauf';

/** Neue Vorlagen tragen `own_name` und `practice_phone`, hier ohne Wert. */
const SELBST: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

describe('Seiten des Einstiegs (5.3)', () => {
  it('fragt die Person nach Einwilligungen, eine Begleitung nie (ADR-023 Punkt 13)', () => {
    expect(einstiegsseiten(SELBST)).toEqual([
      'willkommen',
      'einwilligungen',
      'mitteilungen',
      'bereit',
    ]);
    expect(einstiegsseiten({ access_kind: 'legal_representative' })).toContain('einwilligungen');
    expect(einstiegsseiten({ access_kind: 'companion' })).toEqual([
      'willkommen',
      'mitteilungen',
      'bereit',
    ]);
  });
});

describe('Sätze auf „Willkommen“', () => {
  it('setzt den eigenen Namen in eine eigene Zeile, ohne Namen nur „Willkommen“', () => {
    expect(willkommenstitel({ own_name: 'Erika Beispiel' })).toBe('Willkommen,\nErika Beispiel');
    expect(willkommenstitel({ own_name: null })).toBe('Willkommen');
    expect(willkommenstitel({ own_name: '  ' })).toBe('Willkommen');
  });

  it('sagt wofür - Behandlung, Training oder für wen eine Vertretung liest', () => {
    expect(willkommenssatz(SELBST, 'Test Praxis Tuebingen')).toBe(
      'Schön, dass Sie da sind. Hier finden Sie alles zu Ihrer Behandlung bei Test Praxis Tuebingen.',
    );
    expect(willkommenssatz({ ...SELBST, relationship_kind: 'training' }, '')).toBe(
      'Schön, dass Sie da sind. Hier finden Sie alles zu Ihrem Training bei Ihrer Praxis.',
    );
    expect(
      willkommenssatz(
        { ...SELBST, access_kind: 'companion', represented_name: 'Max Mustermann' },
        'Test Praxis Tuebingen',
      ),
    ).toBe('Hier sehen Sie, was Test Praxis Tuebingen für Max Mustermann bereithält.');
  });

  it('zählt die Fragen in Worten', () => {
    expect(nochFragen(1)).toBe('Noch eine kurze Frage, dann sind Sie fertig.');
    expect(nochFragen(2)).toBe('Noch zwei kurze Fragen, dann sind Sie fertig.');
    expect(zahlwort(5)).toBe('fünf');
    expect(zahlwort(12)).toBe('12');
  });
});
