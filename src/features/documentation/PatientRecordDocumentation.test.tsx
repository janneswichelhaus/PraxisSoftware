import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import { renderWithProviders, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const patient: PatientsApi.Patient = {
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  given_name: 'Berta',
  family_name: 'Bestand',
  date_of_birth: '1985-07-19',
  email: null,
  phone: null,
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
};

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
function termin(
  nr: number,
  rest: Partial<DokumentationApi.TreatmentEvidenceEntry> = {},
): DokumentationApi.TreatmentEvidenceEntry {
  const id = `77777777-7777-4777-8777-${String(nr).padStart(12, '0')}`;
  return {
    appointment_id: id,
    starts_at: '2027-05-12T07:00:00+00:00',
    ends_at: '2027-05-12T08:00:00+00:00',
    appointment_type: 'practice',
    appointment_status: 'scheduled',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
    documentation_status: 'none',
    documented_at: null,
    ...rest,
  };
}

const fetchTreatmentEvidencePage = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentEvidencePage: (patientId: string, cursor: DokumentationApi.AkteCursor | null) =>
      fetchTreatmentEvidencePage(patientId, cursor) as Promise<
        DokumentationApi.TreatmentEvidenceEntry[]
      >,
  };
});

const { PatientRecordDocumentation } = await import('./PatientRecordDocumentation');
const { AKTE_SEITENGROESSE } = await import('./api');

describe('PatientRecordDocumentation: Behandlungsnachweis (DOK-003)', () => {
  beforeEach(() => {
    fetchTreatmentEvidencePage.mockReset();
    fetchTreatmentEvidencePage.mockResolvedValue([
      termin(1, {
        appointment_status: 'completed',
        documentation_status: 'final',
        documented_at: '2027-05-12T09:32:00+00:00',
      }),
      termin(2, {
        starts_at: '2027-05-05T07:00:00+00:00',
        ends_at: '2027-05-05T07:45:00+00:00',
        appointment_type: 'home_visit',
        staff_given_name: 'Tim',
        staff_family_name: 'Teamleitung',
        documentation_status: 'draft',
      }),
      termin(3, {
        starts_at: '2027-04-28T07:00:00+00:00',
        ends_at: '2027-04-28T07:45:00+00:00',
        appointment_status: 'cancelled',
      }),
    ]);
  });

  it('zeigt office je Termin Datum, Zeit, Person, Status und Dokumentationsstand - ohne Inhalt', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    const abschnitt = await screen.findByRole('region', { name: 'Behandlungsnachweis' });
    const zeilen = await within(abschnitt).findAllByRole('listitem');
    expect(zeilen).toHaveLength(3);

    expect(zeilen[0]).toHaveTextContent('Mittwoch, 12. Mai 2027');
    expect(zeilen[0]).toHaveTextContent('09:00–10:00 Uhr · Praxis · Anna Beispiel');
    expect(zeilen[0]).toHaveTextContent('Abgeschlossen');
    expect(zeilen[0]).toHaveTextContent(
      'Dokumentation finalisiert am Mittwoch, 12. Mai 2027, 11:32 Uhr.',
    );

    expect(zeilen[1]).toHaveTextContent('Hausbesuch · Tim Teamleitung');
    expect(zeilen[1]).toHaveTextContent(
      'Dokumentation als Entwurf vorhanden, noch nicht finalisiert.',
    );

    expect(zeilen[2]).toHaveTextContent('Abgesagt');
    expect(zeilen[2]).toHaveTextContent('Keine Dokumentation.');

    expect(fetchTreatmentEvidencePage).toHaveBeenCalledWith(PATIENT_ID, null);
  });

  it('verlinkt jeden Termin', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    const links = await screen.findAllByRole('link', { name: 'Zum Termin' });
    expect(links[0]).toHaveAttribute('href', '/termine/77777777-7777-4777-8777-000000000001');
    expect(links).toHaveLength(3);
  });

  it('nennt den leeren Zustand, wenn es keine Termine in der Akte gibt', async () => {
    fetchTreatmentEvidencePage.mockResolvedValue([]);
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByText('Für diese Person gibt es noch keine Termine in der Akte.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
    ).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchTreatmentEvidencePage.mockRejectedValue(new Error('boom'));
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByText('Der Behandlungsnachweis konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('laedt eine weitere Seite ueber den Cursor der letzten Zeile', async () => {
    const user = userEvent.setup();
    const ersteSeite = Array.from({ length: AKTE_SEITENGROESSE }, (_, i) =>
      termin(i + 1, { starts_at: `2027-03-${String(28 - i).padStart(2, '0')}T07:00:00+00:00` }),
    );
    fetchTreatmentEvidencePage.mockResolvedValueOnce(ersteSeite);
    fetchTreatmentEvidencePage.mockResolvedValueOnce([
      termin(99, { starts_at: '2027-02-01T07:00:00+00:00' }),
    ]);

    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Ältere Termine anzeigen' }));

    const letzte = ersteSeite[ersteSeite.length - 1]!;
    await waitFor(() =>
      expect(fetchTreatmentEvidencePage).toHaveBeenLastCalledWith(PATIENT_ID, {
        beforeStartsAt: letzte.starts_at,
        beforeId: letzte.appointment_id,
      }),
    );

    const abschnitt = screen.getByRole('region', { name: 'Behandlungsnachweis' });
    await waitFor(() =>
      expect(within(abschnitt).getAllByRole('listitem')).toHaveLength(AKTE_SEITENGROESSE + 1),
    );
    // Die zweite Seite war nicht voll: es gibt keine weitere.
    expect(
      screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
    ).not.toBeInTheDocument();
  });

  it('bietet nach einer nicht vollen Seite keine weitere an', async () => {
    renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['office'])} />,
    );

    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'Ältere Termine anzeigen' }),
    ).not.toBeInTheDocument();
  });

  it('rendert fuer ein Patientenkonto keinen Abschnitt und fragt nichts ab', () => {
    const { container } = renderWithProviders(
      <PatientRecordDocumentation patient={patient} user={testUser(['patient'])} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchTreatmentEvidencePage).not.toHaveBeenCalled();
  });
});
