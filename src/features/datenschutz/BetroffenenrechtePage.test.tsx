import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DatenschutzApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testPatient } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const fetchAuskunft = vi.fn();
const fetchAufbewahrungsstand = vi.fn();

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
    fetchPatient: () => Promise.resolve(testPatient()),
  };
});

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
    expect(screen.getByText('Termine')).toBeInTheDocument();
    expect(fetchAuskunft).toHaveBeenCalledWith(PATIENT_ID);
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
    await userEvent.click(await screen.findByRole('button', { name: 'Kopie als Datei sichern' }));

    expect(erzeugt).toHaveBeenCalled();
    expect(freigegeben).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('zeigt die laufenden Fristen und den Entwurf der Antwort', async () => {
    renderWithProviders(<BetroffenenrechtePage />, PFAD);

    expect(await screen.findByText('§ 630f Abs. 3 BGB')).toBeInTheDocument();
    expect(screen.getByText('Frist läuft noch nicht')).toBeInTheDocument();

    const entwurf = screen.getByLabelText<HTMLTextAreaElement>('Entwurf der Antwort');
    expect(entwurf.value).toContain('Art. 17 Abs. 3 lit. b DSGVO');
    expect(entwurf).toHaveAttribute('readonly');
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
  });

  it('ist ohne Verstoesse gegen die Barrierefreiheit bedienbar', async () => {
    const { container } = renderWithProviders(<BetroffenenrechtePage />, PFAD);
    await screen.findByLabelText('Entwurf der Antwort');

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
