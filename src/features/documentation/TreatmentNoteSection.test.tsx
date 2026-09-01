import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
const termin: AppointmentsApi.Appointment = {
  id: TERMIN_ID,
  patient_id: '66666666-6666-4666-8666-000000000001',
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  location_id: '33333333-3333-4333-8333-000000000001',
  appointment_type: 'practice',
  status: 'scheduled',
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-01T10:00:00.000000+00',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  completed_at: null,
  patient_given_name: 'Berta',
  patient_family_name: 'Bestand',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: 'Hauptstandort Tuebingen',
  organization_time_zone: 'Europe/Berlin',
};

/** Synthetischer Inhalt - keine Zeile stammt aus einem realen Behandlungsfall. */
const INHALT = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert.';

const doku: DokumentationApi.TreatmentNote = {
  id: '99999999-9999-4999-8999-000000000001',
  appointment_id: TERMIN_ID,
  status: 'draft',
  content: INHALT,
  // Format wie von PostgREST geliefert: ISO 8601 mit Mikrosekunden und Offset.
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: '2027-05-12T08:30:00.654321+00:00',
  author_name: 'Anna Beispiel',
  last_editor_name: 'Tim Teamleitung',
};

const fetchTreatmentNote = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentNote: (id: string) =>
      fetchTreatmentNote(id) as Promise<DokumentationApi.TreatmentNote | null>,
  };
});

const { TreatmentNoteSection } = await import('./TreatmentNoteSection');

function rendern(
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  ueberschreiben: Partial<AppointmentsApi.Appointment> = {},
) {
  return renderWithProviders(
    <TreatmentNoteSection appointment={{ ...termin, ...ueberschreiben }} user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}`,
  );
}

describe('TreatmentNoteSection', () => {
  beforeEach(() => {
    fetchTreatmentNote.mockReset();
    fetchTreatmentNote.mockResolvedValue(doku);
  });

  it('zeigt den Entwurf mit Zustand, Urheberschaft und Aenderungszeitpunkt', async () => {
    rendern();

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.getByText(/noch nicht finalisiert/)).toBeInTheDocument();
    expect(screen.getByText(/Verfasst von Anna Beispiel/)).toBeInTheDocument();
    // 08:30 UTC ist 10:30 Ortszeit in Europe/Berlin.
    expect(screen.getByText(/12\. Mai 2027, 10:30 Uhr von Tim Teamleitung/)).toBeInTheDocument();
  });

  it('bietet therapeutischen Rollen das Bearbeiten an', async () => {
    rendern(['therapist']);

    const link = await screen.findByRole('link', { name: 'Dokumentation bearbeiten' });
    expect(link).toHaveAttribute('href', `/termine/${TERMIN_ID}/dokumentation`);
  });

  it('zeigt owner den Inhalt, aber keine Schaltflaeche zum Schreiben', async () => {
    rendern(['owner']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dokumentation bearbeiten' })).toBeNull();
  });

  it('fragt fuer office gar nicht erst ab und zeigt nichts an', async () => {
    const { container } = rendern(['office']);

    await waitFor(() => {
      expect(fetchTreatmentNote).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(INHALT)).toBeNull();
  });

  it('zeigt Patientenkonten nichts an', async () => {
    const { container } = rendern(['patient']);

    await waitFor(() => {
      expect(fetchTreatmentNote).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('bietet ohne vorhandene Dokumentation das Anlegen an', async () => {
    fetchTreatmentNote.mockResolvedValue(null);
    rendern(['therapist']);

    expect(
      await screen.findByText(
        'Für diesen Termin ist noch keine Behandlungsdokumentation hinterlegt.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Dokumentation anlegen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation`,
    );
  });

  it('bietet zu einem abgesagten Termin kein Anlegen an', async () => {
    fetchTreatmentNote.mockResolvedValue(null);
    rendern(['therapist'], { status: 'cancelled' });

    expect(
      await screen.findByText(
        'Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dokumentation anlegen' })).toBeNull();
  });

  it('zeigt eine vorhandene Dokumentation auch bei abgesagtem Termin weiter an', async () => {
    // Ein einmal geschriebener Text darf nicht verschwinden, nur weil der
    // Termin nachtraeglich abgesagt wurde (PROJECT_PRINCIPLES.md 13).
    rendern(['therapist'], { status: 'cancelled' });

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
  });

  it('meldet einen Ladefehler verstaendlich', async () => {
    fetchTreatmentNote.mockRejectedValue(new Error('kaputt'));
    rendern(['therapist']);

    expect(
      await screen.findByText('Die Behandlungsdokumentation konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});
