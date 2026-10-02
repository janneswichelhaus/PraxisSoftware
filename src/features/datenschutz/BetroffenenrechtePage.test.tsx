import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DatenschutzApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testPatient } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { roleLabel } from '@/components/ui/roleLabels';
import { AUSKUNFT_KATEGORIEN } from './kategorien';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const fetchAuskunft = vi.fn();
const fetchAufbewahrungsstand = vi.fn();
const fetchPatient = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DatenschutzApi>();
  return {
    ...actual,
    fetchAuskunft: (id: string) => fetchAuskunft(id) as Promise<DatenschutzApi.Auskunft>,
    fetchAufbewahrungsstand: (id: string) =>
      fetchAufbewahrungsstand(id) as Promise<DatenschutzApi.Aufbewahrungsstand>,
  };
});

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
  };
});

// Die Herausgabe der Fotos hat ihre eigenen Tests (FotoHerausgabe.test.tsx).
vi.mock('@/features/files/patientenfotos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFotosZurHerausgabe: () => Promise.resolve([]),
}));

// `renderWithProviders` haengt den Inhalt an eine Platzhalterroute; die Kennung
// aus der Adresse kommt dort nicht an (derselbe Weg wie in
// `EditPatientPage.test.tsx`).
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ patientId: PATIENT_ID }),
}));

const { BetroffenenrechtePage } = await import('./BetroffenenrechtePage');
const { dateiname } = await import('./datei');

const PFAD = `/patienten/${PATIENT_ID}/auskunft`;

function auskunft(): DatenschutzApi.Auskunft {
  return {
    erstellt_am: '2026-09-22T10:15:00+00:00',
    organisation: 'Test Praxis Tuebingen',
    patient_id: PATIENT_ID,
    rechtsgrundlage: 'Art. 15 Abs. 3 DSGVO',
    tabellen: {
      persons: [{ given_name: 'Max', family_name: 'Mustermann' }],
      appointments: [{ id: 'a1' }, { id: 'a2' }],
      payments: [],
    },
    nicht_enthalten: [
      { was: 'Protokoll der Zugriffe auf die Akte', grund: 'Art. 15 Abs. 4 DSGVO (ANN-092).' },
    ],
  };
}

function stand(
  rest: Partial<DatenschutzApi.Aufbewahrungsstand> = {},
): DatenschutzApi.Aufbewahrungsstand {
  return {
    patient_id: PATIENT_ID,
    zeitzone: 'Europe/Berlin',
    versorgung_abgeschlossen_am: null,
    klassen: [
      {
        key: 'patientenakte',
        legal_reference: 'Par. 630f Abs. 3 BGB',
        anchor: 'care_concluded',
        anker_datum: null,
        frist_ende: null,
        loeschbar_ab: null,
        datensaetze: 1,
      },
    ],
    loeschsperre: null,
    ...rest,
  };
}

/**
 * Auskunft und Löschverlangen (OPS-006).
 *
 * Die eine Zusicherung, die diese Seite von jeder anderen unterscheidet: Sie
 * exportiert nicht beim Öffnen. Jede erstellte Kopie ist ein auditpflichtiger
 * Vorgang (ADR-010 Punkt 2), und eine Seite, die beim Blättern exportiert,
 * macht das Protokoll wertlos.
 */
describe('BetroffenenrechtePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAuskunft.mockResolvedValue(auskunft());
    fetchAufbewahrungsstand.mockResolvedValue(stand());
    fetchPatient.mockReset();
    fetchPatient.mockResolvedValue(testPatient());
  });

  it('erstellt beim Öffnen der Seite keine Auskunft', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    expect(await screen.findByRole('button', { name: 'Auskunft erstellen' })).toBeInTheDocument();
    expect(fetchAuskunft).not.toHaveBeenCalled();
  });

  it('erstellt die Kopie erst auf Knopfdruck und zeigt ihre Abschnitte', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Auskunft erstellen' }));

    expect(await screen.findByText('2 Einträge')).toBeInTheDocument();
    // Einzahl statt „1 Einträge" (PAT-17).
    expect(screen.getByText('1 Eintrag')).toBeInTheDocument();
    expect(screen.getByText('Termine')).toBeInTheDocument();
    expect(fetchAuskunft).toHaveBeenCalledWith(PATIENT_ID);
  });

  it('zählt einen einzelnen leeren Abschnitt in der Einzahl', async () => {
    const alle = Object.keys(AUSKUNFT_KATEGORIEN);
    fetchAuskunft.mockResolvedValue({
      ...auskunft(),
      tabellen: Object.fromEntries(alle.slice(1).map((key) => [key, [{ id: key }]])),
    });
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Auskunft erstellen' }));
    expect(
      await screen.findByText('1 weiterer Abschnitt ist in der Datei enthalten und leer.'),
    ).toBeInTheDocument();
  });

  // PAT-23: Nach dem Erstellen ist „Kopie herunterladen" der einzige
  // Hauptknopf; jeder weitere Export wäre ein neuer Protokolleintrag.
  it('stellt nach dem Erstellen das Herunterladen nach vorn', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Auskunft erstellen' }));

    const herunterladen = await screen.findByRole('button', { name: 'Kopie herunterladen' });
    const neu = screen.getByRole('button', { name: 'Neu erstellen' });
    expect(herunterladen).toHaveClass('bg-accent');
    expect(neu).not.toHaveClass('bg-accent');
    expect(screen.queryByRole('button', { name: 'Auskunft erstellen' })).not.toBeInTheDocument();
    expect(fetchAuskunft).toHaveBeenCalledTimes(1);
  });

  it('nennt in der Kopie, was sie nicht enthält', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Auskunft erstellen' }));

    expect(await screen.findByText(/Protokoll der Zugriffe auf die Akte/)).toBeInTheDocument();
  });

  it('sichert die Kopie als Datei', async () => {
    const erzeugt = vi.fn(() => 'blob:test');
    const freigegeben = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: erzeugt, revokeObjectURL: freigegeben });

    renderWithProviders(<BetroffenenrechtePage />, PFAD);
    await userEvent.click(await screen.findByRole('button', { name: 'Auskunft erstellen' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Kopie herunterladen' }));

    expect(erzeugt).toHaveBeenCalled();
    expect(freigegeben).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('zeigt die laufenden Fristen und den Entwurf der Antwort', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    // Klartext vor der Fundstelle, ohne Rückfall auf den Schlüssel (PAT-17).
    expect(
      await screen.findByText('Klinische Patientenakte (§ 630f Abs. 3 BGB)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Frist läuft noch nicht')).toBeInTheDocument();

    // Der Entwurf steht als Text da, nicht als schreibgeschütztes Feld (PAT-23).
    const abschnitt = screen
      .getByRole('heading', { name: 'Entwurf der Antwort' })
      .closest('section');
    expect(abschnitt).not.toBeNull();
    expect(abschnitt!).toHaveTextContent('Art. 17 Abs. 3 lit. b DSGVO');
    expect(within(abschnitt!).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('kopiert den Entwurf und bestätigt es erst danach', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    await user.click(await screen.findByRole('button', { name: 'Text kopieren' }));

    expect(await screen.findByText('Kopiert.')).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toContain('Art. 17 Abs. 3 lit. b DSGVO');
  });

  it('nennt die Rolle, der die Vorgänge vorbehalten sind (WRT-12)', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    const vorbehalt = `vorbehalten der Rolle „${roleLabel('owner')}“`;
    expect(await screen.findByText((inhalt) => inhalt.includes(vorbehalt))).toBeInTheDocument();
    expect(screen.queryByText(/Praxisleitung/)).not.toBeInTheDocument();
  });

  // PAT-22, ZST-08: Rückweg und Überschrift auch im Fehlerfall, und eine
  // fehlende Akte ist kein Ladefehler.
  it('meldet eine unbekannte Akte als nicht gefunden, mit Rückweg und Überschrift', async () => {
    fetchPatient.mockResolvedValue(null);
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Auskunft und Löschverlangen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu den Stammdaten/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/stammdaten`,
    );
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument();
  });

  it('bietet nach einem Ladefehler der Akte einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchPatient.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Akte konnte nicht geladen werden.');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen');
    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByRole('button', { name: 'Auskunft erstellen' })).toBeInTheDocument();
  });

  it('meldet einen gescheiterten Export, statt eine leere Kopie zu zeigen', async () => {
    fetchAuskunft.mockRejectedValue(new Error('nope'));
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    await userEvent.click(await screen.findByRole('button', { name: 'Auskunft erstellen' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Die Auskunft konnte nicht erstellt werden.',
      );
    });
    // Ein Schritt statt der Ratefrage nach der Anmeldung (WRT-01).
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte die Verbindung prüfen und erneut versuchen.',
    );
    expect(screen.getByRole('alert').textContent).not.toMatch(/angemeldet/);
  });

  it('ist ohne Verstoesse gegen die Barrierefreiheit bedienbar', async () => {
    const { container } = renderWithProviders(<BetroffenenrechtePage />, PFAD);
    await screen.findByRole('heading', { name: 'Entwurf der Antwort' });

    await expect(pruefeBarrierefreiheit(container)).resolves.toBeUndefined();
  });
});

describe('dateiname', () => {
  it('traegt Datum und Kennung, aber keinen Namen', () => {
    expect(dateiname(PATIENT_ID, '2026-09-22T10:15:00+00:00')).toBe(
      'auskunft-20260922-66666666.json',
    );
  });
});
