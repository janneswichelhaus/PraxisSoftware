import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneCheckins, Plattformzugang } from './api';

/** „Meine Angaben“ auf der Plattform: die eigenen Antworten mit Datum, ohne Deutung. */

const ladeCheckins = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeCheckins: (...a: unknown[]) => ladeCheckins(...a) as Promise<EigeneCheckins | null>,
}));

const { MeineAngaben } = await import('./MeineAngaben');

const ZUGANG: Plattformzugang = {
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

function daten(teil: Partial<EigeneCheckins> = {}): EigeneCheckins {
  return {
    today: '2026-10-12',
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'morning_stiffness_minutes'] },
    due_on: '2026-10-12',
    due: true,
    can_answer: true,
    consent_needed: false,
    last_values: { pain_rest: 4 },
    history: [
      {
        answered_on: '2026-10-05',
        recorded_by_kind: 'self',
        values: { pain_rest: 4, morning_stiffness_minutes: 15 },
      },
    ],
    session_history: [],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeCheckins.mockResolvedValue(daten());
});

describe('Meine Angaben (TRK-006)', () => {
  it('„Meine Angaben" zeigt die Antworten je Größe mit Datum, ohne Deutung (TRK-006)', async () => {
    const nutzer = userEvent.setup();
    const { container } = renderWithProviders(<MeineAngaben zugang={ZUGANG} />, '/p/angaben');
    // Vollständig auf Wunsch: die Tabelle hinter „Alle Antworten als Tabelle“.
    await nutzer.click(await screen.findByText('Alle Antworten als Tabelle'));
    const tabelle = await screen.findByRole('table', { name: /Meine Angaben aus dem Check-in/ });
    expect(within(tabelle).getByRole('columnheader', { name: '05.10.2026' })).toBeInTheDocument();
    expect(
      within(within(tabelle).getByRole('row', { name: /Schmerz in Ruhe/ })).getByRole('cell'),
    ).toHaveTextContent('4');
    expect(
      within(within(tabelle).getByRole('row', { name: /Morgensteifigkeit \(Minuten\)/ })).getByRole(
        'cell',
      ),
    ).toHaveTextContent('15');
    expect(screen.queryByText(/besser|schlechter|Trend/i)).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('„Meine Angaben" zeigt je Frage ein Punktbild in Alltagssprache, ohne Deutung (OUT-004)', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        history: [
          {
            answered_on: '2026-10-05',
            recorded_by_kind: 'self',
            values: { pain_rest: 4, pain_quality: 2 },
          },
          { answered_on: '2026-09-28', recorded_by_kind: 'self', values: { pain_rest: 7 } },
        ],
        session_history: [
          {
            performed_on: '2026-10-08',
            plan_title: 'Heimprogramm Knie',
            recorded_by_kind: 'self',
            values: { session_confidence: 6 },
          },
        ],
      }),
    );
    const { container } = renderWithProviders(<MeineAngaben zugang={ZUGANG} />, '/p/angaben');
    const bilder = await screen.findAllByRole('figure');
    // Schmerz in Ruhe und Bewegungssicherheit; die Schmerzart bleibt in der Tabelle.
    expect(bilder).toHaveLength(2);
    expect(bilder[0]).toHaveTextContent('Wie stark sind Ihre Schmerzen in Ruhe?');
    expect(bilder[0]).toHaveTextContent('Werte: 28.09.2026: 7 · 05.10.2026: 4');
    expect(bilder[1]).toHaveTextContent('Wie sicher haben Sie sich bei den Übungen gefühlt?');
    expect(screen.getByRole('heading', { name: 'Nach den Übungen' })).toBeInTheDocument();
    // Ein Satz, der immer gleich dasteht – keine Deutung der eigenen Werte.
    expect(screen.getByText(/Werte schwanken von Tag zu Tag/)).toBeInTheDocument();
    expect(
      screen.queryByText(/besser|schlechter|Trend|Fortschritt|gut gemacht|Rückschritt/i),
    ).not.toBeInTheDocument();
    // Keine Ereignisse der Praxis in der Sicht der Person.
    expect(screen.queryByText(/Ereignisse:/)).not.toBeInTheDocument();
    expect(container.querySelector('figure svg polyline, figure svg path')).toBeNull();
    await pruefeBarrierefreiheit(container);
  });
});
