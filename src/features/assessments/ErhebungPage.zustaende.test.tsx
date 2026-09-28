import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import type * as Api from './api';
import type * as Instrumente from './instrumente';
import type * as PatientenApi from '@/features/patients/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

/**
 * Zustände und Schutz der Erhebungsseite (UXR-009: BEF-01, -02, -03, -08,
 * -09, -12, -17; ZST-03, -08).
 *
 * Mit fünf Fragen des echten Anamnesebogens statt aller 46: Hier geht es um
 * das Verhalten der Seite, nicht um den Wortlaut des Bogens - den prüft
 * `ErhebungPage.test.tsx` am vollständigen Bogen.
 *
 * Wohin die Seite nach einem Vorgang geht, prüft der Test an `navigate`
 * selbst: Eine echte Navigation des Data Routers scheitert in jsdom unter
 * Node 24 an der Klasse von `AbortSignal` (bekannt, nicht Teil des Befunds).
 */

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const ADRESSE = `/patienten/${PATIENT_ID}/befund/erheben?instrument=anamnese_v8`;

const fetchErhebungen = vi.fn();
const erhebungSpeichern = vi.fn();
const erhebungAbschliessen = vi.fn();
const erhebungVerwerfen = vi.fn();
const fetchPatient = vi.fn();
const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof Router>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchErhebungen: (id: string) => fetchErhebungen(id) as Promise<Api.Erhebung[]>,
    erhebungSpeichern: (e: Api.ErhebungSpeichern) => erhebungSpeichern(e) as Promise<string>,
    erhebungAbschliessen: (id: string) => erhebungAbschliessen(id) as Promise<void>,
    erhebungVerwerfen: (id: string) => erhebungVerwerfen(id) as Promise<void>,
  };
});
vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientenApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientenApi.Patient | null>,
  };
});
vi.mock('./instrumente', async (importOriginal) => {
  const actual = await importOriginal<typeof Instrumente>();
  const anamnese = actual.instrumentFuer('anamnese_v8')!;
  const auswahl = [
    'beschwerden_ort',
    'schmerzen_aktuell',
    'schmerzstaerke',
    'tumor',
    'erkrankungen',
  ];
  const klein = {
    ...anamnese,
    items: anamnese.items.filter((item) => auswahl.includes(item.id)),
    hervorhebungen: [],
  };
  return { ...actual, erhebbareInstrumente: () => [klein] };
});

const { Erhebung } = await import('./ErhebungPage');

function erhebung(abweichung: Partial<Api.Erhebung> = {}): Api.Erhebung {
  return {
    id: 'd1',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'entwurf',
    recorded_on: '2026-09-20',
    answers: { schmerzen_aktuell: { auswahl: 'ja' } },
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '2026-09-20T08:00:00Z',
    updated_at: '2026-09-20T08:00:00Z',
    completed_at: null,
    author_name: 'Anna Beispiel',
    completed_by_name: null,
    ...abweichung,
  };
}

function seite(zusatz = '', daten: Api.Erhebung[] = []) {
  fetchErhebungen.mockResolvedValue(daten);
  return renderWithProviders(
    <Erhebung patientId={PATIENT_ID} user={testUser(['therapist'])} />,
    `${ADRESSE}${zusatz}`,
  );
}

// Auch mit fünf Fragen trägt eine Seite samt Router, Abfragen und Schutz unter
// voller Last der Testsuite nicht immer in 5 s (wie ErhebungPage.test.tsx).
describe('Erhebung – Zustände und Schutz (UXR-009)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatient.mockResolvedValue(testPatient({ id: PATIENT_ID }));
    erhebungSpeichern.mockResolvedValue('neu');
    erhebungAbschliessen.mockResolvedValue(undefined);
    erhebungVerwerfen.mockResolvedValue(undefined);
  });

  it('verwirft einen Entwurf erst nach einer Rückfrage (BEF-01)', async () => {
    const user = userEvent.setup();
    seite('&entwurf=d1', [erhebung()]);

    await user.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
    expect(screen.getByText('Die gespeicherten Antworten werden gelöscht.')).toBeInTheDocument();
    expect(erhebungVerwerfen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));
    await waitFor(() => expect(erhebungVerwerfen).toHaveBeenCalledWith('d1'));
    expect(erhebungVerwerfen).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}/befund`, { replace: true }),
    );
  });

  it('zeigt einen gescheiterten Verwerfen-Versuch im Kasten, statt still zu schließen', async () => {
    const user = userEvent.setup();
    erhebungVerwerfen.mockRejectedValue(new Error('Der Bogen wurde nicht gefunden.'));
    seite('&entwurf=d1', [erhebung()]);

    await user.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Der Bogen wurde nicht gefunden.');
    expect(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' })).toBeEnabled();
  });

  it('speichert nicht, wenn Enter in einem einzeiligen Feld gedrückt wird (BEF-09)', async () => {
    const user = userEvent.setup();
    seite();

    await user.click(await screen.findByLabelText('andere Erkrankung?'));
    const angabe = screen.getByLabelText('Angabe zu „andere Erkrankung?“');
    expect(angabe).toHaveAttribute('enterkeyhint', 'done');
    await user.type(angabe, 'Gicht{Enter}');
    await user.type(screen.getByLabelText('Datum der Erhebung'), '{Enter}');

    expect(angabe).toHaveValue('Gicht');
    expect(erhebungSpeichern).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abschließen' })).toBeInTheDocument();
  });

  it('hängt einen Fehler an die Frage und führt aus der Zusammenfassung dorthin (BEF-03)', async () => {
    const user = userEvent.setup();
    const kreise = Array.from({ length: 31 }, (_, i) => ({
      x: 0.7 + i * 0.001,
      y: 0.387,
      bereich: 'lws',
    }));
    seite('&entwurf=d1', [erhebung({ answers: { beschwerden_ort: { markierungen: kreise } } })]);

    await user.click(await screen.findByRole('button', { name: 'Abschließen' }));

    const frage = screen.getByRole('group', {
      name: '1. Wo haben Sie Ihre Beschwerden (bitte einzeichnen)?',
    });
    expect(frage).toHaveAccessibleDescription('Höchstens 30 Stellen – bitte eine entfernen.');
    const zusammenfassung = screen.getByText('Bitte prüfen Sie diese Angabe').closest('div')!;
    expect(zusammenfassung).toHaveFocus();
    const sprung = within(zusammenfassung).getByRole('link');
    expect(sprung).toHaveAttribute('href', '#frage-beschwerden_ort');
    expect(sprung).toHaveTextContent('Höchstens 30 Stellen – bitte eine entfernen.');
    expect(document.body.textContent).not.toMatch(/expected|Too big/);
    expect(erhebungSpeichern).not.toHaveBeenCalled();

    await user.click(sprung);
    expect(frage).toHaveFocus();
  });

  it('bietet für einen Entwurf einer früheren Fassung Verwerfen und Neubeginn an (BEF-02)', async () => {
    const user = userEvent.setup();
    seite('&entwurf=d1', [erhebung({ definition_version: '0.9.0' })]);

    expect(
      await screen.findByText('Der Entwurf gehört zu einer früheren Fassung des Bogens.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Anamnesebogen Version 8 (DIGOTOR)',
    );
    expect(screen.getByRole('link', { name: '← Zurück zum Befund' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/befund`,
    );

    await user.click(screen.getByRole('button', { name: 'Entwurf verwerfen und neu erheben' }));
    expect(erhebungVerwerfen).not.toHaveBeenCalled();
    fetchErhebungen.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));

    await waitFor(() => expect(erhebungVerwerfen).toHaveBeenCalledWith('d1'));
    // Danach beginnt ein neuer Bogen: dieselbe Seite ohne `?entwurf=`.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(ADRESSE, { replace: true }));
  });

  it('meldet einen Ladefehler mit Rückweg und einem erneuten Versuch (ZST-08, WRT-01)', async () => {
    const user = userEvent.setup();
    fetchErhebungen.mockRejectedValueOnce(
      new Error('Die Fragebögen konnten nicht geladen werden.'),
    );
    renderWithProviders(
      <Erhebung patientId={PATIENT_ID} user={testUser(['therapist'])} />,
      ADRESSE,
    );

    expect(await screen.findByText('Der Bogen konnte nicht geladen werden.')).toBeInTheDocument();
    expect(screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.')).toBeVisible();
    expect(screen.getByRole('link', { name: '← Zurück zum Befund' })).toBeInTheDocument();
    expect(screen.queryByText(/nicht freigegeben/)).toBeNull();

    fetchErhebungen.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('button', { name: 'Abschließen' })).toBeInTheDocument();
  });

  it('meldet eine fehlende Akte als nicht gefunden, nicht als Ladefehler', async () => {
    fetchPatient.mockResolvedValue(null);
    seite();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Datensatz/)).toBeNull();
  });

  it('zeigt an einem fortgesetzten Korrekturentwurf, was er ersetzt und warum (BEF-12)', async () => {
    seite('&entwurf=k1', [
      erhebung({
        id: 'k1',
        supersedes_response_id: 'e1',
        change_reason: 'Frage 2 verwechselt',
      }),
      erhebung({
        id: 'e1',
        status: 'abgeschlossen',
        recorded_on: '2026-09-14',
        superseded_by_response_id: 'k1',
        completed_at: '2026-09-14T08:10:00Z',
      }),
    ]);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Anamnesebogen Version 8 (DIGOTOR) korrigieren',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ersetzt den Bogen vom 14.09.2026.')).toBeInTheDocument();
    expect(screen.getByText('Begründung der Korrektur: Frage 2 verwechselt')).toBeInTheDocument();
    // Ändern ließe sie sich ohnehin nicht mehr: Der Server hält sie fest.
    expect(screen.queryByLabelText(/Begründung der Korrektur/)).toBeNull();
  });

  it('zeigt den Lauf nur an der gedrückten Schaltfläche (BEF-17)', async () => {
    const user = userEvent.setup();
    erhebungSpeichern.mockReturnValue(new Promise<string>(() => undefined));
    seite();

    const frage2 = await screen.findByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' });
    await user.click(within(frage2).getByLabelText('ja'));
    await user.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

    expect(await screen.findByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abschließen' })).toBeDisabled();
    expect(screen.queryByText('Wird abgeschlossen …')).toBeNull();
  });

  it('spricht im Verlustschutz von Antworten, nicht von Text (BEF-17)', async () => {
    const user = userEvent.setup();
    seite();

    const frage2 = await screen.findByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' });
    await user.click(within(frage2).getByLabelText('ja'));
    await user.click(screen.getByRole('link', { name: '← Zurück zum Befund' }));

    const kasten = await screen.findByRole('group', { name: 'Ungespeicherte Antworten' });
    expect(kasten).toHaveTextContent(
      'Die Antworten sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
    );
    expect(kasten.textContent).not.toMatch(/Text|Server/);
  });

  it('stellt „Antwort entfernen" in die Kopfzeile und lässt den Fokus in der Frage (BEF-08)', async () => {
    const user = userEvent.setup();
    seite();

    const frage2 = await screen.findByRole('group', { name: '2. Haben Sie aktuell Schmerzen?' });
    expect(within(frage2).queryByRole('button', { name: /Antwort entfernen/ })).toBeNull();
    await user.click(within(frage2).getByLabelText('ja'));

    const entfernen = within(frage2).getByRole('button', {
      name: 'Antwort entfernen: 2. Haben Sie aktuell Schmerzen?',
    });
    // Vor den Optionen im Dokument: in der Kopfzeile, nicht darunter.
    expect(
      entfernen.compareDocumentPosition(within(frage2).getByLabelText('ja')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(entfernen);

    expect(within(frage2).getByLabelText('ja')).not.toBeChecked();
    expect(within(frage2).getByLabelText('ja')).toHaveFocus();
  });
});
