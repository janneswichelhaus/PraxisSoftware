import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const fetchErhebungen = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchErhebungen: (id: string) => fetchErhebungen(id) as Promise<Api.Erhebung[]>,
  };
});

const { Befund } = await import('./PatientBefundPage');

function erhebung(abweichung: Partial<Api.Erhebung> = {}): Api.Erhebung {
  return {
    id: 'e1',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: '2026-09-20',
    answers: { schmerzen_aktuell: { auswahl: 'ja' }, schmerzstaerke: { wert: 6 } },
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '2026-09-20T08:00:00Z',
    updated_at: '2026-09-20T08:00:00Z',
    completed_at: '2026-09-20T08:10:00Z',
    author_name: 'Anna Beispiel',
    completed_by_name: 'Anna Beispiel',
    ...abweichung,
  };
}

function seite(daten: Api.Erhebung[], rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  fetchErhebungen.mockResolvedValue(daten);
  return renderWithProviders(
    <Befund patient={testPatient({ id: PATIENT_ID })} user={testUser(rollen)} />,
  );
}

describe('Befund der Akte', () => {
  beforeEach(() => fetchErhebungen.mockReset());

  it('bietet das Erheben an, solange nichts erhoben ist', async () => {
    seite([]);
    expect(await screen.findByText('Noch nicht erhoben.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bogen erheben' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/befund/erheben?instrument=anamnese_v8`,
    );
  });

  it('führt zu einem offenen Entwurf statt zu einem zweiten Bogen', async () => {
    seite([erhebung({ id: 'd1', status: 'entwurf', completed_at: null })]);
    expect(await screen.findByRole('link', { name: 'Entwurf weiter ausfüllen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/befund/erheben?instrument=anamnese_v8&entwurf=d1`,
    );
  });

  it('zeigt die Antworten wörtlich und die offenen Fragen als Nummern', async () => {
    const user = userEvent.setup();
    seite([erhebung()]);
    await user.click(await screen.findByText('Antworten'));
    expect(screen.getByText('2. Haben Sie aktuell Schmerzen?')).toBeInTheDocument();
    expect(screen.getByText('ja')).toBeInTheDocument();
    expect(screen.getByText('6 von 10')).toBeInTheDocument();
    expect(
      screen.getByText(/^Nicht beantwortet: Beruf:, Sport\/Hobby:, 1, 4,/),
    ).toBeInTheDocument();
  });

  it('bietet die Korrektur nur am geltenden abgeschlossenen Bogen an', async () => {
    seite([
      erhebung({ id: 'neu', supersedes_response_id: 'alt', change_reason: 'Frage 3 falsch' }),
      erhebung({ id: 'alt', superseded_by_response_id: 'neu' }),
    ]);
    const korrekturen = await screen.findAllByRole('link', { name: 'Korrigieren' });
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/befund/erheben?instrument=anamnese_v8&korrigiert=neu`,
    );
    expect(screen.getByText('durch Korrektur ersetzt')).toBeInTheDocument();
    expect(screen.getByText('Korrektur: Frage 3 falsch')).toBeInTheDocument();
  });

  it('zeigt office die Bögen, aber keine Schreibaktion', async () => {
    seite([erhebung()], ['office']);
    const karte = (await screen.findByText('Erhoben am 20.09.2026')).closest('li')!;
    expect(within(karte).queryByRole('link', { name: 'Korrigieren' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Bogen erheben' })).toBeNull();
  });

  it('ist barrierefrei', async () => {
    const { container } = seite([erhebung()]);
    await screen.findByText('Erhoben am 20.09.2026');
    await pruefeBarrierefreiheit(container);
  });
});
