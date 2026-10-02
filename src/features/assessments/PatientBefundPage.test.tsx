import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as Verlauf from './verlauf';
import type * as TermineApi from '@/features/appointments/api';
import type * as PatientenApi from '@/features/patients/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { instrumentFuer } from './instrumente';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const fetchErhebungen = vi.fn();
const erhebungVerwerfen = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchErhebungen: (id: string) => fetchErhebungen(id) as Promise<Api.Erhebung[]>,
    erhebungVerwerfen: (id: string) => erhebungVerwerfen(id) as Promise<void>,
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

const setTreatmentTableRequired = vi.fn();
vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientenApi>();
  return {
    ...actual,
    setTreatmentTableRequired: (id: string, wert: boolean) =>
      setTreatmentTableRequired(id, wert) as Promise<void>,
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
    expect(screen.getByText('Durch Korrektur ersetzt')).toBeInTheDocument();
    // Korrekturtag getrennt vom Erhebungstag (ABN-014, BEF-101 Punkt 2).
    expect(
      screen.getByText(/^Korrektur vom \d{2}\.\d{2}\.\d{4}: Frage 3 falsch$/),
    ).toBeInTheDocument();
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
    expect(await screen.findByText('Abgeschlossen · Korrektur im Entwurf')).toBeInTheDocument();
    expect(screen.queryByText('Durch Korrektur ersetzt')).toBeNull();
    // Keine zweite Korrektur neben der laufenden.
    expect(screen.queryByRole('link', { name: 'Korrigieren' })).toBeNull();
  });

  it('verwirft einen Entwurf auch in der Akte, erst nach einer Rückfrage (BEF-02)', async () => {
    const user = userEvent.setup();
    erhebungVerwerfen.mockReset().mockResolvedValue(undefined);
    seite([erhebung({ id: 'd1', status: 'entwurf', completed_at: null })]);

    await user.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
    expect(
      screen.getByRole('group', { name: 'Entwurf vom 20.09.2026 verwerfen' }),
    ).toHaveTextContent('Die gespeicherten Antworten dieses Entwurfs werden gelöscht.');
    expect(erhebungVerwerfen).not.toHaveBeenCalled();

    fetchErhebungen.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));
    expect(erhebungVerwerfen).toHaveBeenCalledWith('d1');
    // Der Entwurf ist fort, und der Weg zu einem neuen Bogen ist frei.
    expect(await screen.findByRole('link', { name: 'Bogen erheben' })).toBeInTheDocument();
  });

  it('bietet einen abgeschlossenen Bogen nicht zum Verwerfen an', async () => {
    seite([erhebung()]);
    await screen.findByText('Erhoben am 20.09.2026');
    expect(screen.queryByRole('button', { name: 'Entwurf verwerfen' })).toBeNull();
  });

  it('nennt eine abweichende Fassung des Bogens „Fassung" (BEF-16)', async () => {
    seite([erhebung({ definition_version: '0.9.0' })]);
    // UX-005e: Ohne abweichenden Tag oder abweichende Person steht die
    // Fassung allein in der Zeile.
    // Liegt die Fassung nicht im Release, sagt die Akte, womit sie zeigt (ABN-014).
    expect(
      await screen.findByText(/^Fassung 0\.9\.0 liegt nicht vor, gezeigt in Fassung 1\.0\.0$/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Version 0\.9\.0/)).toBeNull();
  });

  // UX-005e: „Erfasst von … · abgeschlossen am …" nur, wo es etwas über
  // „Erhoben am" hinaus sagt; der Regelfall trägt weder Zeile noch Etikett.
  describe('Herkunft und Etikett (UX-005e)', () => {
    it('laesst Herkunftszeile und Etikett „Abgeschlossen" im Regelfall weg', async () => {
      seite([erhebung()]);
      await screen.findByText('Erhoben am 20.09.2026');
      expect(screen.queryByText(/Erfasst von/)).toBeNull();
      expect(screen.queryByText(/abgeschlossen am/)).toBeNull();
      expect(screen.queryByText('Abgeschlossen')).toBeNull();
    });

    it('nennt Person und Tag, wenn der Abschluss an einem anderen Tag liegt', async () => {
      seite([erhebung({ completed_at: '2026-09-22T08:10:00Z' })]);
      expect(
        await screen.findByText('Erfasst von Anna Beispiel · abgeschlossen am 22.09.2026'),
      ).toBeInTheDocument();
    });

    it('nennt Person und Tag, wenn jemand anderes abgeschlossen hat', async () => {
      seite([erhebung({ completed_by_name: 'Tim Teamleitung' })]);
      expect(
        await screen.findByText('Erfasst von Anna Beispiel · abgeschlossen am 20.09.2026'),
      ).toBeInTheDocument();
    });

    it('erklärt die Behandlungsliege nicht in einem Dauersatz', async () => {
      seite([]);
      await screen.findByText('Noch nicht erhoben.');
      expect(screen.getByText('Behandlungsliege')).toBeInTheDocument();
      expect(screen.queryByText(/Wird die Liege beim Hausbesuch gebraucht/)).toBeNull();
    });
  });

  it('zeigt unter „Weitere Erhebungen" den Stand wie oben (BEF-02)', async () => {
    const anamnese = instrumentFuer('anamnese_v8')!;
    fetchErhebungen.mockResolvedValue([erhebung({ status: 'entwurf', completed_at: null })]);
    renderWithProviders(
      <Befund
        patient={testPatient({ id: PATIENT_ID })}
        user={testUser(['therapist'])}
        scores={[{ ...anamnese, meta: { ...anamnese.meta, aktiv: false } }]}
      />,
    );
    const abschnitt = (await screen.findByText('Weitere Erhebungen')).closest('section')!;
    expect(within(abschnitt).getByText('Entwurf')).toBeInTheDocument();
    expect(within(abschnitt).queryByRole('button')).toBeNull();
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

  describe('Behandlungsliege (FRB-003c)', () => {
    it('setzt das Merkmal der Person im Befund über denselben Schreibpfad', async () => {
      setTreatmentTableRequired.mockReset().mockResolvedValue(undefined);
      const user = userEvent.setup();
      seite([]);

      // UX-005e: Unentschieden stehen nur die beiden Handlungen da.
      await user.click(await screen.findByRole('button', { name: 'Liege mitnehmen' }));
      expect(screen.queryByText('Noch nicht entschieden')).not.toBeInTheDocument();
      expect(setTreatmentTableRequired).toHaveBeenCalledWith(PATIENT_ID, true);
    });

    it('steht auch dann, wenn die Fragebögen nicht laden', async () => {
      const user = userEvent.setup();
      fetchErhebungen.mockRejectedValue(new Error('synthetisch'));
      renderWithProviders(
        <Befund
          patient={testPatient({ id: PATIENT_ID, treatment_table_required: true })}
          user={testUser(['office'])}
        />,
      );
      expect(
        await screen.findByText('Die Fragebögen konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.')).toBeVisible();
      expect(screen.getByText('Mitnehmen')).toBeInTheDocument();

      // Ein Weg aus dem Fehler, ohne die Seite neu zu laden (WRT-01).
      fetchErhebungen.mockResolvedValue([erhebung()]);
      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      expect(await screen.findByText('Erhoben am 20.09.2026')).toBeInTheDocument();
    });
  });

  it('ist barrierefrei', async () => {
    const { container } = seite([erhebung()]);
    await screen.findByText('Erhoben am 20.09.2026');
    await pruefeBarrierefreiheit(container);
  });
});
