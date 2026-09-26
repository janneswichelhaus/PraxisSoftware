import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as PatientenApi from '@/features/patients/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const fetchErhebungen = vi.fn();
const erhebungSpeichern = vi.fn();
const erhebungAbschliessen = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchErhebungen: (id: string) => fetchErhebungen(id) as Promise<Api.Erhebung[]>,
    erhebungSpeichern: (e: Api.ErhebungSpeichern) => erhebungSpeichern(e) as Promise<string>,
    erhebungAbschliessen: (id: string) => erhebungAbschliessen(id) as Promise<void>,
  };
});
vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientenApi>();
  return { ...actual, fetchPatient: () => Promise.resolve(testPatient({ id: PATIENT_ID })) };
});

const { Erhebung } = await import('./ErhebungPage');

function abgeschlossen(): Api.Erhebung {
  return {
    id: 'e1',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: '2026-09-20',
    answers: { schmerzen_aktuell: { auswahl: 'ja' } },
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '2026-09-20T08:00:00Z',
    updated_at: '2026-09-20T08:00:00Z',
    completed_at: '2026-09-20T08:10:00Z',
    author_name: 'Anna Beispiel',
    completed_by_name: 'Anna Beispiel',
  };
}

function seite(
  suche: string,
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  daten: Api.Erhebung[] = [],
) {
  fetchErhebungen.mockResolvedValue(daten);
  return renderWithProviders(
    <Erhebung patientId={PATIENT_ID} user={testUser(rollen)} />,
    `/patienten/${PATIENT_ID}/befund/erheben?${suche}`,
  );
}

/**
 * Erheben eines Fragebogens (FRB-002b). Ob der Server annimmt, prüfen die
 * Datenbanktests (`supabase/tests/questionnaire-responses.test.ts`).
 */
describe('Erhebung', () => {
  beforeEach(() => {
    fetchErhebungen.mockReset();
    erhebungSpeichern.mockReset().mockResolvedValue('neu');
    erhebungAbschliessen.mockReset().mockResolvedValue(undefined);
  });

  it('zeigt den Bogen mit dem Wortlaut der Vorlage', async () => {
    seite('instrument=anamnese_v8');
    expect(
      await screen.findByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Zur Beantwortung der Fragen 13-20 denken Sie bitte nur an die vergangenen zwei Wochen:',
      ),
    ).toBeInTheDocument();
  });

  it('räumt bei „nein" die übrigen Kreuze ab und umgekehrt', async () => {
    const user = userEvent.setup();
    seite('instrument=anamnese_v8');
    const frage4 = await screen.findByRole('group', { name: /^4\. Haben Sie:/ });
    const nacht = within(frage4).getByLabelText('Nachtschmerzen');
    const nein = within(frage4).getByLabelText('nein');

    await user.click(nacht);
    await user.click(nein);
    expect(nacht).not.toBeChecked();
    expect(nein).toBeChecked();
    await user.click(nacht);
    expect(nein).not.toBeChecked();
  });

  it('speichert als Entwurf mit Version und Antworten', async () => {
    const user = userEvent.setup();
    seite('instrument=anamnese_v8');
    const frage2 = await screen.findByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' });
    await user.click(within(frage2).getByLabelText('ja'));
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    await waitFor(() => expect(erhebungSpeichern).toHaveBeenCalledTimes(1));
    expect(erhebungSpeichern.mock.calls[0]![0]).toMatchObject({
      patientId: PATIENT_ID,
      erhebungId: null,
      instrumentId: 'anamnese_v8',
      version: '1.0.0',
      antworten: { schmerzen_aktuell: { auswahl: 'ja' } },
      korrigiert: null,
    });
    expect(erhebungAbschliessen).not.toHaveBeenCalled();
  });

  it('schliesst nach dem Speichern ab', async () => {
    const user = userEvent.setup();
    seite('instrument=anamnese_v8');
    await user.click(await screen.findByRole('button', { name: 'Abschließen' }));
    await waitFor(() => expect(erhebungAbschliessen).toHaveBeenCalledWith('neu'));
  });

  // getByRole über 46 Fragen ist teuer; der Test sucht deshalb über Text und Label.
  it(
    'verlangt zur Korrektur eine Begründung und beginnt mit den alten Antworten',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      seite('instrument=anamnese_v8&korrigiert=e1', ['therapist'], [abgeschlossen()]);

      const frage2 = (await screen.findByText('2. Haben Sie aktuell Schmerzen?')).closest(
        'fieldset',
      )!;
      expect(within(frage2).getByLabelText('ja')).toBeChecked();

      await user.click(screen.getByText('Abschließen'));
      expect(
        await screen.findByText('Eine Korrektur braucht eine Begründung.'),
      ).toBeInTheDocument();
      expect(erhebungSpeichern).not.toHaveBeenCalled();

      // Einfügen statt Tippen: Jede Taste rendert den ganzen Bogen neu.
      await user.click(screen.getByLabelText(/Begründung der Korrektur/));
      await user.paste('Frage 2 verwechselt');
      await user.click(screen.getByText('Abschließen'));
      await waitFor(() =>
        expect(erhebungSpeichern.mock.calls[0]![0]).toMatchObject({
          korrigiert: 'e1',
          begruendung: 'Frage 2 verwechselt',
        }),
      );
    },
  );

  it('öffnet für office keinen Bogen', async () => {
    seite('instrument=anamnese_v8', ['office']);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
  });

  it('bietet ein inaktives Instrument nicht an, auch nicht über die Adresse', async () => {
    seite('instrument=nrs_schmerz');
    expect(
      await screen.findByText('Diesen Fragebogen gibt es nicht oder er ist nicht freigegeben.'),
    ).toBeInTheDocument();
  });

  // Die Prüfung über 46 Fragen und das Körperschema braucht länger als der Vorgabewert.
  it('ist barrierefrei', { timeout: 20_000 }, async () => {
    const { container } = seite('instrument=anamnese_v8');
    await screen.findByRole('button', { name: 'Abschließen' });
    await pruefeBarrierefreiheit(container);
  });
});
