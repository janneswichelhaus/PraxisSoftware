import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from '@/features/patients/api';
import type * as UebersichtApi from '@/features/patients/uebersicht';
import type * as GrundlagenApi from '@/features/treatment-bases/api';
import type * as RouterModul from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

/** Jede Adresse, die die Seite durchläuft - auch eine, die gleich wieder ersetzt wird. */
const adressen: string[] = [];

/** Zeigt die Parameter der aktuellen Adresse im MemoryRouter und merkt sich jede. */
function Adressprobe() {
  const [parameter] = useSearchParams();
  adressen.push(parameter.toString());
  return <span data-testid="adresse">{parameter.toString()}</span>;
}

const navigate = vi.fn();
const fetchPatientOverview = vi.fn();
const fetchPatient = vi.fn();
const fetchPatientTreatmentBases = vi.fn();
const fetchPatientTreatmentBasesClinical = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
  };
});

vi.mock('@/features/patients/uebersicht', async (importOriginal) => ({
  ...(await importOriginal<typeof UebersichtApi>()),
  fetchPatientOverview: () => fetchPatientOverview() as Promise<UebersichtApi.Patienteneintrag[]>,
}));

vi.mock('@/features/treatment-bases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof GrundlagenApi>();
  return {
    ...actual,
    fetchPatientTreatmentBases: (id: string) =>
      fetchPatientTreatmentBases(id) as Promise<GrundlagenApi.TreatmentBasis[]>,
    fetchPatientTreatmentBasesClinical: (id: string) =>
      fetchPatientTreatmentBasesClinical(id) as Promise<GrundlagenApi.ClinicalTreatmentBasis[]>,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<GrundlagenApi.TreatmentBasisKontingent[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { DauerterminStartPage } = await import('./DauerterminStartPage');

const MAX = {
  id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  status: 'active' as const,
};

function grundlage(id: string, issued_on: string) {
  return {
    id,
    prescriber_id: null,
    prescriber_name: 'Dr. Beispiel',
    prescriber_practice_name: null,
    treatment_basis_kind: 'first' as const,
    issued_on,
    frequency_note: null,
    note: null,
    items: [],
    updated_at: '2027-01-01T00:00:00Z',
  };
}

function kontingent(treatment_basis_id: string, prescribed: number, used: number, planned = used) {
  return {
    treatment_basis_id,
    prescribed,
    used,
    planned,
    upcoming: planned - used,
    remaining: Math.max(prescribed - Math.max(used, planned), 0),
    covered: Math.min(prescribed, planned),
    uncovered: Math.max(planned - prescribed, 0),
  };
}

const ANNA = '55555555-5555-4555-8555-000000000002';
const G1 = '99999999-9999-4999-8999-000000000001';
const G2 = '99999999-9999-4999-8999-000000000002';
const MIT_PERSON = `/termine/dauertermin?datum=2027-05-12&beginn=09%3A00&patient=${MAX.id}`;
const SERIE = (g: string) =>
  `/patienten/${MAX.id}/verordnungen/${g}/serie?datum=2027-05-12&beginn=09%3A00`;

function rendern(pfad: string) {
  return renderWithProviders(<DauerterminStartPage user={testUser(['therapist'])} />, pfad);
}

/**
 * Dauertermin ohne Vorauswahl (BEF-042): erst die Person, dann - nur wenn
 * nötig - die Grundlage, dann die eine Serienseite.
 */
describe('DauerterminStartPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    fetchPatientOverview.mockReset().mockResolvedValue([
      {
        id: MAX.id,
        given_name: MAX.given_name,
        family_name: MAX.family_name,
        date_of_birth: MAX.date_of_birth,
        email: null,
        phone: null,
        postal_code: null,
        city: 'Tuebingen',
        last_visit_on: '2026-10-01',
        next_appointment_at: null,
        open_bases: 1,
        bases_need_appointments: 0,
        bases_need_followup: 0,
        bases_ready: 0,
        bases_in_billing: 0,
        billing_visible: false,
        invoices_issued: null,
        invoices_paid: null,
        outstanding_cents: null,
        invoices_overdue: null,
        reminders_due: null,
      },
    ]);
    fetchPatient.mockReset().mockResolvedValue(MAX);
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockReset().mockResolvedValue([grundlage(G1, '2027-04-01')]);
    }
    fetchPatientTreatmentBasisSlots.mockReset().mockResolvedValue([kontingent(G1, 10, 2)]);
  });

  it('fragt ohne Person zuerst nach ihr und nimmt die Zeit mit', async () => {
    renderWithProviders(
      <DauerterminStartPage user={testUser(['therapist'])} />,
      '/termine/dauertermin?datum=2027-05-12&beginn=09%3A00',
    );

    expect(screen.getByText('Erster Termin: 12.05.2027, ab 09:00 Uhr')).toBeInTheDocument();
    // B10 (ANN-517): eine Liste statt der Suche ab drei Zeichen.
    expect(screen.queryByRole('combobox', { name: 'Patient:in suchen' })).toBeNull();
    await userEvent.click(await screen.findByRole('link', { name: /Mustermann, Max/ }));

    // Die Wahl landet in der Adresse; die Grundlagen fragt der nächste Schritt.
    expect(await screen.findByRole('heading', { name: /Grundlage/ })).toBeInTheDocument();
  });

  // R1 (Zweitreview): Der Suchbegriff - meist ein Name - steht weder in der
  // Adresse dieser Seite noch im Ziel der Zeile.
  it('hält den Suchbegriff aus jeder Adresse heraus (ADR-011)', async () => {
    adressen.length = 0;
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <DauerterminStartPage user={testUser(['therapist'])} />
        <Adressprobe />
      </>,
      '/termine/dauertermin?datum=2027-05-12&beginn=09%3A00',
    );

    await user.type(await screen.findByLabelText('Patient:in suchen'), 'muster');
    await user.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('sort=name');
    expect(adressen.length).toBeGreaterThan(1);
    for (const adresse of adressen) {
      expect(adresse).not.toContain('q=');
      expect(adresse).not.toMatch(/muster/i);
    }
    const ziel = screen.getByRole('link', { name: /Mustermann, Max/ }).getAttribute('href') ?? '';
    expect(ziel).toContain(`patient=${MAX.id}`);
    expect(ziel).not.toContain('q=');
    expect(ziel).not.toMatch(/muster/i);
  });

  it('springt bei genau einer offenen Grundlage direkt in die Serie', async () => {
    rendern(MIT_PERSON);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(SERIE(G1), { replace: true }));
  });

  it('entscheidet erst mit den Zahlen - vorher gilt jede Grundlage als offen', async () => {
    fetchPatientTreatmentBasisSlots.mockReturnValue(new Promise(() => undefined));
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([grundlage(G1, '2027-04-01'), grundlage(G2, '2027-01-01')]);
    }
    rendern(MIT_PERSON);

    expect(await screen.findByText('Behandlungsgrundlagen werden geladen …')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('nimmt die eine offene, wenn daneben ausgeschoepfte stehen', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([grundlage(G1, '2027-04-01'), grundlage(G2, '2027-01-01')]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([
      kontingent(G1, 10, 2),
      kontingent(G2, 6, 6),
    ]);
    rendern(MIT_PERSON);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(SERIE(G1), { replace: true }));
  });

  it('laesst bei mehreren offenen waehlen und klappt die uebrigen ein', async () => {
    const G3 = '99999999-9999-4999-8999-000000000003';
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([
        grundlage(G1, '2027-04-01'),
        grundlage(G2, '2027-03-01'),
        grundlage(G3, '2026-11-01'),
      ]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([
      kontingent(G1, 10, 2),
      kontingent(G2, 6, 1),
      kontingent(G3, 6, 6),
    ]);
    rendern(MIT_PERSON);

    // Die offenen stehen als erste Liste offen da; die übrigen im Aufklapper.
    const [offen] = await screen.findAllByRole('list');
    const links = within(offen!).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', SERIE(G1));
    // Das Kontingent zählt Termine (VER-08, ANN-064).
    expect(links[0]).toHaveTextContent('noch 8 Termine zu planen');
    expect(
      screen.getByText('Verplante und ausgeschöpfte (1)').closest('details'),
    ).not.toHaveAttribute('open');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('bietet ohne Grundlage den Weg zum Anlegen an', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
    rendern(MIT_PERSON);

    expect(await screen.findByText('Keine Behandlungsgrundlage')).toBeInTheDocument();
    // „Erfassen" wie überall (VER-17), und zurück kommt man hierher - samt
    // Zeit und Person (VER-05).
    const link = screen.getByRole('link', { name: 'Grundlage erfassen' });
    const ziel = new URL(link.getAttribute('href')!, 'http://test');
    expect(ziel.pathname).toBe(`/patienten/${MAX.id}/verordnungen/neu`);
    expect(ziel.searchParams.get('zurueck')).toBe(MIT_PERSON);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fuehrt das Praxismanagement zur Grundlage, denn es erfasst sie seit PRX-010', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
    renderWithProviders(<DauerterminStartPage user={testUser(['office'])} />, MIT_PERSON);

    expect(await screen.findByRole('link', { name: 'Grundlage erfassen' })).toBeInTheDocument();
  });

  it('reicht die Person der Spalte und den Rueckweg an die Serie weiter (KAL-05)', async () => {
    const kalender = '/kalender?ansicht=tag&datum=2027-05-12';
    rendern(`${MIT_PERSON}&person=${ANNA}&zurueck=${encodeURIComponent(kalender)}`);

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [ziel, optionen] = navigate.mock.calls.at(-1) as [string, unknown];
    const adresse = new URL(ziel, 'http://test');
    expect(adresse.pathname).toBe(`/patienten/${MAX.id}/verordnungen/${G1}/serie`);
    expect(adresse.searchParams.get('person')).toBe(ANNA);
    expect(adresse.searchParams.get('beginn')).toBe('09:00');
    expect(adresse.searchParams.get('zurueck')).toBe(kalender);
    expect(optionen).toEqual({ replace: true });
  });

  it('schreibt „Uhr" nur mit einem Beginn (KAL-10)', () => {
    rendern('/termine/dauertermin?datum=2027-05-12');

    // Eine Zeile statt Abschnitt und Tabelle (UX-005g).
    expect(screen.getByText('Erster Termin: 12.05.2027')).toBeInTheDocument();
    expect(screen.queryByText(/Uhr/)).toBeNull();
    expect(screen.queryByText('Aus dem Kalender übernommen')).toBeNull();
  });

  it('fuehrt ueber den Rueckweg in den Kalenderstand zurueck (KAL-19)', () => {
    rendern('/termine/dauertermin?datum=2027-05-12&zurueck=%2Fkalender%3Fansicht%3Dwoche');

    expect(screen.getByRole('link', { name: '← Zurück zum Kalender' })).toHaveAttribute(
      'href',
      '/kalender?ansicht=woche',
    );
  });

  it('meldet einen Ladefehler ohne Details', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockRejectedValue(new Error('intern'));
    }
    rendern(MIT_PERSON);

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Die Behandlungsgrundlagen konnten nicht geladen werden.');
    expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(screen.queryByText('intern')).not.toBeInTheDocument();

    // Ein Weg heraus (UIK-16, WRT-01): erneut laden, ohne die Seite neu zu laden.
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([grundlage(G1, '2027-04-01'), grundlage(G2, '2027-01-01')]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([
      kontingent(G1, 10, 2),
      kontingent(G2, 6, 1),
    ]);
    await userEvent.click(within(kasten).getByRole('button', { name: 'Erneut versuchen' }));
    expect(
      await screen.findByRole('link', { name: /noch 8 Termine zu planen/ }),
    ).toBeInTheDocument();
  });

  it('ignoriert eine verstellte Kennung und fragt nach der Person', () => {
    rendern('/termine/dauertermin?patient=kein-uuid');

    expect(screen.getByLabelText('Patient:in suchen')).toBeInTheDocument();
    expect(fetchPatient).not.toHaveBeenCalled();
  });
});
