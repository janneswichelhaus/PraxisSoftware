import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PrescriptionsApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const fetchPatientPrescriptions = vi.fn();
const fetchPatientPrescriptionsClinical = vi.fn();
const fetchPatientPrescriptionSlots = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PrescriptionsApi>();
  return {
    ...actual,
    fetchPatientPrescriptions: (id: string) =>
      fetchPatientPrescriptions(id) as Promise<PrescriptionsApi.Prescription[]>,
    fetchPatientPrescriptionsClinical: (id: string) =>
      fetchPatientPrescriptionsClinical(id) as Promise<PrescriptionsApi.ClinicalPrescription[]>,
    fetchPatientPrescriptionSlots: (id: string) =>
      fetchPatientPrescriptionSlots(id) as Promise<PrescriptionsApi.PrescriptionKontingent[]>,
  };
});

const { Verordnungsbereich } = await import('./PatientPrescriptionsPage');

const patient = testPatient();

function position(
  rest: Partial<PrescriptionsApi.PrescriptionItem> = {},
): PrescriptionsApi.PrescriptionItem {
  return {
    id: 'i1',
    sort_order: 1,
    remedy: 'Krankengymnastik',
    prescribed_quantity: 10,
    used_quantity: 7,
    remaining_quantity: 3,
    ...rest,
  };
}

function verordnung(
  rest: Partial<PrescriptionsApi.ClinicalPrescription> = {},
): PrescriptionsApi.ClinicalPrescription {
  return {
    id: 'v1',
    prescriber_id: 'p1',
    prescriber_name: 'Dr. med. Petra Probst',
    prescriber_practice_name: 'Praxis Fiktiv',
    prescription_kind: 'follow_up',
    issued_on: '2026-06-18',
    frequency_note: '2x pro Woche',
    note: null,
    items: [position()],
    updated_at: '2026-06-18T10:00:00.000Z',
    diagnosis: 'Synthetisch: Schulter rechts.',
    therapy_goal: null,
    prescriber_note: null,
    follow_up_recommendation: null,
    ...rest,
  };
}

/** Kontingent einer Verordnung, wie es `list_patient_prescription_slots` liefert. */
function kontingent(
  rest: Partial<PrescriptionsApi.PrescriptionKontingent> = {},
): PrescriptionsApi.PrescriptionKontingent {
  return {
    prescription_id: 'v1',
    prescribed: 10,
    used: 7,
    planned: 8,
    upcoming: 1,
    remaining: 2,
    ...rest,
  };
}

describe('Verordnungsbereich der Akte', () => {
  beforeEach(() => {
    fetchPatientPrescriptions.mockReset();
    fetchPatientPrescriptionsClinical.mockReset();
    fetchPatientPrescriptionSlots.mockReset();
    fetchPatientPrescriptions.mockResolvedValue([]);
    fetchPatientPrescriptionsClinical.mockResolvedValue([]);
    fetchPatientPrescriptionSlots.mockResolvedValue([]);
  });

  it('zeigt der Therapeut:in die klinischen Felder', async () => {
    fetchPatientPrescriptionsClinical.mockResolvedValue([
      verordnung({ follow_up_recommendation: 'Synthetisch: Folgeverordnung sinnvoll.' }),
    ]);
    fetchPatientPrescriptionSlots.mockResolvedValue([kontingent()]);
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Synthetisch: Schulter rechts.')).toBeInTheDocument();
    // ANN-014: die Beschriftung nennt ausdrücklich, wessen Empfehlung das ist.
    expect(screen.getByText('Empfehlung der Therapeut:in zum Verordnungsende')).toBeInTheDocument();
    expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
  });

  it('ruft fuer office die klinische Sicht und zeigt die Diagnose (E15)', async () => {
    fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
    fetchPatientPrescriptionSlots.mockResolvedValue([kontingent()]);
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Synthetisch: Schulter rechts.')).toBeInTheDocument();
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
    expect(fetchPatientPrescriptionsClinical).toHaveBeenCalledWith(patient.id);
    expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // AKTE-002: Leistungseinheiten und Termine sind zwei verschiedene Zahlen.
  // Vorher stand über beiden dasselbe Wort "Kontingent".
  // ---------------------------------------------------------------------------
  describe('Einheiten und Termine getrennt', () => {
    it('benennt beide Zahlen mit ihrer Einheit', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([
        kontingent({ prescribed: 10, used: 7, planned: 8, upcoming: 2, remaining: 2 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('7 von 10 genutzt · 3 offen')).toBeInTheDocument();
      expect(screen.getByText('8 zugeordnet · 2 bevorstehend')).toBeInTheDocument();
      expect(screen.getByText('2 Behandlungen')).toBeInTheDocument();
      expect(screen.getByText('Leistungseinheiten')).toBeInTheDocument();
      expect(screen.getByText('Termine')).toBeInTheDocument();
      expect(screen.getByText('Noch planbar')).toBeInTheDocument();
    });

    it('fuehrt von der Verordnung zu ihren Terminen', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([kontingent({ planned: 3 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findByRole('link', { name: 'Termine dieser Verordnung' }),
      ).toHaveAttribute('href', `/patienten/${patient.id}/termine?verordnung=v1`);
    });

    it('nennt eine Verordnung ohne Termin als solche, ohne Link', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([
        kontingent({ planned: 0, upcoming: 0, remaining: 3 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('Noch kein Termin zugeordnet')).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Termine dieser Verordnung' }),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AKTE-002: Aktionen passen zum Zustand.
  // ---------------------------------------------------------------------------
  describe('Aktionen passen zum Zustand', () => {
    it('bietet die Serie an, solange sich etwas planen laesst', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([kontingent({ remaining: 3 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByRole('link', { name: 'Terminserie anlegen' })).toHaveAttribute(
        'href',
        `/patienten/${patient.id}/verordnungen/v1/serie`,
      );
    });

    it('bietet keine Serie an, wenn jede Einheit verplant ist', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([
        kontingent({ prescribed: 10, used: 7, planned: 10, upcoming: 3, remaining: 0 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByText('Vollständig verplant')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Terminserie anlegen' })).not.toBeInTheDocument();
    });

    it('bietet einer inaktiven Person keine Serie an', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([kontingent({ remaining: 3 })]);
      renderWithProviders(
        <Verordnungsbereich
          patient={testPatient({ status: 'inactive' })}
          user={testUser(['office'])}
        />,
      );

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.queryByRole('link', { name: 'Terminserie anlegen' })).not.toBeInTheDocument();
    });

    it('laesst office die Verordnung nicht bearbeiten', async () => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([kontingent()]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AKTE-002: Ausgeschoepfte Verordnungen kompakt.
  // ---------------------------------------------------------------------------
  describe('Ausgeschoepfte Verordnungen', () => {
    const ausgeschoepft = verordnung({
      id: 'v0',
      issued_on: '2025-11-12',
      prescription_kind: 'first',
      items: [position({ prescribed_quantity: 6, used_quantity: 6, remaining_quantity: 0 })],
    });

    beforeEach(() => {
      fetchPatientPrescriptionsClinical.mockResolvedValue([verordnung(), ausgeschoepft]);
      fetchPatientPrescriptionSlots.mockResolvedValue([
        kontingent(),
        kontingent({
          prescription_id: 'v0',
          prescribed: 6,
          used: 6,
          planned: 6,
          upcoming: 0,
          remaining: 0,
        }),
      ]);
    });

    it('trennt sie von den laufenden und gruppiert sie nach Jahr', async () => {
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findByRole('heading', { name: 'Ausgeschöpfte Verordnungen' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '2025' })).toBeInTheDocument();
      expect(screen.getByText(/6 von 6 Einheiten genutzt · 6 Termine/)).toBeInTheDocument();
    });

    it('haelt ihre Einzelheiten bis zum Aufklappen zurueck', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      const zeile = await screen.findByText('Erstverordnung vom 12.11.2025');
      // Zugeklappt steht der klinische Inhalt zwar im Dokument, aber nicht im
      // Bild - `details` blendet ihn aus.
      expect(zeile.closest('details')).not.toHaveAttribute('open');

      await user.click(zeile);
      expect(zeile.closest('details')).toHaveAttribute('open');
    });
  });

  it('fuehrt keinen zweiten Weg "Verordnung erfassen" neben dem der Akte', async () => {
    // Der Weg steht im Kopf der Akte und ist aus jedem Bereich erreichbar.
    // Zweimal derselbe Knopf auf einer Seite waere ein Raetsel; der
    // Rollenschnitt dahinter wird am Kopf geprueft.
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    await screen.findByText('Keine laufende Verordnung');
    expect(screen.queryByRole('link', { name: 'Verordnung erfassen' })).not.toBeInTheDocument();
  });

  it('zeigt einem Patientenkonto den Abschnitt gar nicht', () => {
    const { container } = renderWithProviders(
      <Verordnungsbereich patient={patient} user={testUser(['patient'])} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
    expect(fetchPatientPrescriptionsClinical).not.toHaveBeenCalled();
    expect(fetchPatientPrescriptionSlots).not.toHaveBeenCalled();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPatientPrescriptionsClinical.mockRejectedValue(new Error('interne Ursache'));
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['team_lead'])} />);

    expect(
      await screen.findByText('Die Verordnungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/interne Ursache/)).not.toBeInTheDocument();
  });

  it('sagt bei leerer Akte, wo die erste Verordnung entsteht', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Keine laufende Verordnung')).toBeInTheDocument();
  });
});
