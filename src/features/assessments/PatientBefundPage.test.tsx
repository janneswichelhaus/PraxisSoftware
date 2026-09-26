import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as Verlauf from './verlauf';
import type * as TermineApi from '@/features/appointments/api';
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
const fetchEreignisse = vi.fn();
vi.mock('./verlauf', async (importOriginal) => {
  const actual = await importOriginal<typeof Verlauf>();
  return {
    ...actual,
    fetchEreignisse: (id: string) => fetchEreignisse(id) as Promise<Verlauf.Verlaufsereignis[]>,
  };
});
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TermineApi>();
  return {
    ...actual,
    fetchPatientAppointments: () =>
      Promise.resolve([{ status: 'documented', starts_at: '2026-09-25T08:00:00Z' }]),
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
  beforeEach(() => {
    fetchErhebungen.mockReset();
    fetchEreignisse.mockReset().mockResolvedValue([]);
  });

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
    expect(screen.getByText(/^Nicht beantwortet: Beruf, Sport\/Hobby, 1, 4,/)).toBeInTheDocument();
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

  it('laesst den alten Bogen gelten, solange die Korrektur ein Entwurf ist', async () => {
    seite([
      erhebung({
        id: 'neu',
        status: 'entwurf',
        completed_at: null,
        supersedes_response_id: 'alt',
        change_reason: 'Frage 3 falsch',
      }),
      erhebung({ id: 'alt', superseded_by_response_id: 'neu' }),
    ]);
    expect(await screen.findByText('abgeschlossen · Korrektur im Entwurf')).toBeInTheDocument();
    expect(screen.queryByText('durch Korrektur ersetzt')).toBeNull();
    // Keine zweite Korrektur neben der laufenden.
    expect(screen.queryByRole('link', { name: 'Korrigieren' })).toBeNull();
  });

  it('zeigt office die Bögen, aber keine Schreibaktion', async () => {
    seite([erhebung()], ['office']);
    const karte = (await screen.findByText('Erhoben am 20.09.2026')).closest('li')!;
    expect(within(karte).queryByRole('link', { name: 'Korrigieren' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Bogen erheben' })).toBeNull();
  });

  it('zeigt die Skalenwerte geltender Bögen als Punkte ohne Linie, mit Ereignis', async () => {
    fetchEreignisse.mockResolvedValue([
      {
        id: 'v1',
        occurred_on: '2026-09-25',
        kind: 'erkrankung',
        note: 'zwei Wochen Grippe',
        created_at: '2026-09-25T08:00:00Z',
        author_name: 'Anna Beispiel',
      },
    ]);
    const { container } = seite([
      erhebung({ id: 'b', recorded_on: '2026-10-01', answers: { schmerzstaerke: { wert: 4 } } }),
      erhebung({ id: 'a', recorded_on: '2026-09-20', answers: { schmerzstaerke: { wert: 6 } } }),
      // Ein Entwurf ist keine Angabe und erscheint nicht.
      erhebung({
        id: 'd',
        status: 'entwurf',
        completed_at: null,
        answers: { schmerzstaerke: { wert: 9 } },
      }),
    ]);

    expect(await screen.findByText('Werte: 20.09.2026: 6 · 01.10.2026: 4')).toBeInTheDocument();
    expect(await screen.findByText('Erkrankung · zwei Wochen Grippe')).toBeInTheDocument();
    // Keine Verbindung der Punkte, kein Pfad, keine Kurve (ADR-006 Punkt 11).
    expect(container.querySelectorAll('polyline, path')).toHaveLength(0);
    // Das Bild selbst sagt nichts über die Richtung - nur Werte und Daten.
    for (const bild of container.querySelectorAll('figure')) {
      expect(bild.textContent).not.toMatch(/besser|schlechter|trend|zunahme|abnahme/i);
    }
  });

  it('bietet office das Vermerken eines Ereignisses nicht an', async () => {
    seite([erhebung()], ['office']);
    await screen.findByText('Erhoben am 20.09.2026');
    expect(screen.queryByText('Ereignis vermerken')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).toBeNull();
  });

  it('ist barrierefrei', async () => {
    const { container } = seite([erhebung()]);
    await screen.findByText('Erhoben am 20.09.2026');
    await pruefeBarrierefreiheit(container);
  });
});
