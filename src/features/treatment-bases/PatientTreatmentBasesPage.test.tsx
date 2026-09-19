import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TreatmentBasesApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const fetchPatientTreatmentBases = vi.fn();
const fetchPatientTreatmentBasesClinical = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TreatmentBasesApi>();
  return {
    ...actual,
    fetchPatientTreatmentBases: (id: string) =>
      fetchPatientTreatmentBases(id) as Promise<TreatmentBasesApi.TreatmentBasis[]>,
    fetchPatientTreatmentBasesClinical: (id: string) =>
      fetchPatientTreatmentBasesClinical(id) as Promise<TreatmentBasesApi.ClinicalTreatmentBasis[]>,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<TreatmentBasesApi.TreatmentBasisKontingent[]>,
  };
});

const { Verordnungsbereich } = await import('./PatientTreatmentBasesPage');

const patient = testPatient();

function position(
  rest: Partial<TreatmentBasesApi.TreatmentBasisItem> = {},
): TreatmentBasesApi.TreatmentBasisItem {
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
  rest: Partial<TreatmentBasesApi.ClinicalTreatmentBasis> = {},
): TreatmentBasesApi.ClinicalTreatmentBasis {
  return {
    id: 'v1',
    prescriber_id: 'p1',
    prescriber_name: 'Dr. med. Petra Probst',
    prescriber_practice_name: 'Praxis Fiktiv',
    treatment_basis_kind: 'follow_up',
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

/** Kontingent einer Verordnung, wie es `list_patient_treatment_basis_slots` liefert. */
function kontingent(
  rest: Partial<TreatmentBasesApi.TreatmentBasisKontingent> = {},
): TreatmentBasesApi.TreatmentBasisKontingent {
  return {
    treatment_basis_id: 'v1',
    prescribed: 10,
    used: 7,
    planned: 8,
    upcoming: 1,
    remaining: 2,
    covered: 8,
    uncovered: 0,
    ...rest,
  };
}

describe('Verordnungsbereich der Akte', () => {
  beforeEach(() => {
    fetchPatientTreatmentBases.mockReset();
    fetchPatientTreatmentBasesClinical.mockReset();
    fetchPatientTreatmentBasisSlots.mockReset();
    fetchPatientTreatmentBases.mockResolvedValue([]);
    fetchPatientTreatmentBasesClinical.mockResolvedValue([]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
  });

  it('zeigt der Therapeut:in die klinischen Felder', async () => {
    fetchPatientTreatmentBasesClinical.mockResolvedValue([
      verordnung({ follow_up_recommendation: 'Synthetisch: Folgeverordnung sinnvoll.' }),
    ]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Synthetisch: Schulter rechts.')).toBeInTheDocument();
    // ANN-014: die Beschriftung nennt ausdrücklich, wessen Empfehlung das ist.
    expect(screen.getByText('Empfehlung der Therapeut:in zum Verordnungsende')).toBeInTheDocument();
    expect(fetchPatientTreatmentBases).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // GRD-001 / ADR-020 Punkt 7: Die Oberflaeche nennt die Bauart, nicht das
  // Oberwort. Ein Selbstzahler ist keine Verordnung - und die Akte behauptet
  // auch nicht, es gaebe eine Verordner:in oder einen Rezeptscan.
  // ---------------------------------------------------------------------------
  describe('Die zweite Bauart: Selbstzahler', () => {
    const selbstzahler = () =>
      verordnung({
        id: 'sz1',
        treatment_basis_kind: 'self_pay',
        prescriber_id: null,
        prescriber_name: null,
        prescriber_practice_name: null,
        issued_on: '2026-09-03',
        diagnosis: null,
        frequency_note: '1x pro Woche',
      });

    it('nennt ihn "Selbstzahler seit" statt "Verordnung vom"', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([selbstzahler()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ treatment_basis_id: 'sz1' }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('Selbstzahler seit 03.09.2026')).toBeInTheDocument();
      expect(screen.queryByText(/Verordnung vom/)).not.toBeInTheDocument();
    });

    it('zeigt weder Verordner:in noch Rezeptscan', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([selbstzahler()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ treatment_basis_id: 'sz1' }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      await screen.findByText('Selbstzahler seit 03.09.2026');
      expect(screen.queryByText('Dr. med. Petra Probst')).not.toBeInTheDocument();
      expect(screen.queryByText('Scan des Rezepts')).not.toBeInTheDocument();
    });

    it('bekommt Kontingent und Serienplanung wie eine Verordnung', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([selbstzahler()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ treatment_basis_id: 'sz1', prescribed: 8, used: 1, planned: 2, remaining: 6 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('8 · 1 genutzt')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Terminserie anlegen' })).toHaveAttribute(
        'href',
        `/patienten/${patient.id}/verordnungen/sz1/serie`,
      );
    });

    it('steht mit der Verordnung unter einer gemeinsamen Ueberschrift', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung(), selbstzahler()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent(),
        kontingent({ treatment_basis_id: 'sz1' }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
      expect(screen.getByText('Selbstzahler seit 03.09.2026')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Aktuelle Behandlungsgrundlagen' }),
      ).toBeInTheDocument();
    });
  });

  it('ruft fuer office die klinische Sicht und zeigt die Diagnose (E15)', async () => {
    fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Synthetisch: Schulter rechts.')).toBeInTheDocument();
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
    expect(fetchPatientTreatmentBasesClinical).toHaveBeenCalledWith(patient.id);
    expect(fetchPatientTreatmentBases).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // AKTE-002: Mögliche, genutzte, verplante und planbare Termine sind
  // verschiedene Zahlen. Vorher stand über allen dasselbe Wort "Kontingent",
  // und die obere war die Summe der Heilmittel (VER-EPIC-002, ANN-064).
  // ---------------------------------------------------------------------------
  describe('Terminzahlen getrennt', () => {
    it('benennt jede Zahl und zählt durchgehend Termine', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ prescribed: 10, used: 7, planned: 8, upcoming: 2, remaining: 2 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('10 · 7 genutzt')).toBeInTheDocument();
      expect(screen.getByText('8 zugeordnet · 2 bevorstehend')).toBeInTheDocument();
      expect(screen.getByText('2 Behandlungen')).toBeInTheDocument();
      expect(screen.getByText('Mögliche Termine')).toBeInTheDocument();
      expect(screen.getByText('Termine')).toBeInTheDocument();
      expect(screen.getByText('Noch planbar')).toBeInTheDocument();
      // Die alte Bezeichnung ist weg - sie stand über einer Summe.
      expect(screen.queryByText('Leistungseinheiten')).not.toBeInTheDocument();
    });

    it('nennt eine ungenutzte Grundlage ohne die Null', async () => {
      // "0 von 6 genutzt" waere seit VER-EPIC-002 eine Zahl ohne Aussage:
      // Genutzt pflegt bis ABR-002 niemand mehr von Hand (ANN-064).
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ prescribed: 6, used: 0, planned: 0, upcoming: 0, remaining: 6 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('6')).toBeInTheDocument();
      expect(screen.queryByText('6 · 0 genutzt')).not.toBeInTheDocument();
    });

    it('fuehrt von der Verordnung zu ihren Terminen', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent({ planned: 3 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findByRole('link', { name: 'Termine dieser Verordnung' }),
      ).toHaveAttribute('href', `/patienten/${patient.id}/termine?verordnung=v1`);
    });

    it('nennt eine Verordnung ohne Termin als solche, ohne Link', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
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
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent({ remaining: 3 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByRole('link', { name: 'Terminserie anlegen' })).toHaveAttribute(
        'href',
        `/patienten/${patient.id}/verordnungen/v1/serie`,
      );
    });

    // Bis CAL-022 fehlte die Serie hier: An einer vollstaendig verplanten
    // Grundlage waere sie ein Angebot ueber null Termine gewesen. Seit CAL-022
    // ist sie eines ueber weitere - ueber das Kontingent hinaus zu planen ist
    // zulaessig, und die Serienseite sagt, was dabei ungedeckt bleibt.
    it('bietet die Serie auch an, wenn jede Einheit verplant ist', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({
          prescribed: 10,
          used: 7,
          planned: 10,
          upcoming: 3,
          remaining: 0,
          covered: 10,
          uncovered: 0,
        }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByText('Vollständig verplant')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Terminserie anlegen' })).toBeInTheDocument();
    });

    it('bietet einer inaktiven Person keine Serie an', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent({ remaining: 3 })]);
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
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // CAL-022: Ungedeckte Termine sind sichtbar, und sie lassen sich uebertragen.
  // ---------------------------------------------------------------------------
  describe('Deckung', () => {
    it('nennt die ungedeckten Termine an der Grundlage', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ prescribed: 6, used: 2, planned: 10, upcoming: 8, covered: 6, uncovered: 4 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('6 von 10 zugeordneten Terminen gedeckt · 4 ohne Deckung'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('deckungszeichen')).toHaveTextContent('Ohne Deckung');
    });

    it('schweigt, solange die Grundlage jeden Termin traegt', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ planned: 8, covered: 8, uncovered: 0 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.queryByText('Deckung')).not.toBeInTheDocument();
    });

    it('bietet der ueberplanten Grundlage den Weg zum Uebertragen', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent({ uncovered: 4 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByRole('link', { name: 'Termine übertragen' })).toHaveAttribute(
        'href',
        `/patienten/${patient.id}/termine-uebertragen`,
      );
      // Auf sich selbst uebernimmt eine Grundlage nichts.
      expect(screen.queryByRole('link', { name: 'Termine übernehmen' })).not.toBeInTheDocument();
    });

    it('bietet der zweiten Grundlage das Uebernehmen mit sich als Ziel', async () => {
      const zweite = verordnung({ id: 'v2', issued_on: '2026-09-08' });
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung(), zweite]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ uncovered: 4 }),
        kontingent({ treatment_basis_id: 'v2', planned: 0, upcoming: 0, covered: 0, uncovered: 0 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByRole('link', { name: 'Termine übernehmen' })).toHaveAttribute(
        'href',
        `/patienten/${patient.id}/termine-uebertragen?ziel=v2`,
      );
    });

    it('bietet das Uebernehmen nicht an, wenn nichts ungedeckt ist', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent({ uncovered: 0 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.queryByRole('link', { name: 'Termine übernehmen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Termine übertragen' })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AKTE-002: Ausgeschoepfte Verordnungen kompakt.
  // ---------------------------------------------------------------------------
  describe('Ausgeschoepfte Verordnungen', () => {
    const ausgeschoepft = verordnung({
      id: 'v0',
      issued_on: '2025-11-12',
      treatment_basis_kind: 'first',
      items: [position({ prescribed_quantity: 6, used_quantity: 6, remaining_quantity: 0 })],
    });

    beforeEach(() => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung(), ausgeschoepft]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent(),
        kontingent({
          treatment_basis_id: 'v0',
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
        await screen.findByRole('heading', { name: 'Ausgeschöpfte Behandlungsgrundlagen' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '2025' })).toBeInTheDocument();
      expect(screen.getByText(/6 von 6 Terminen genutzt · 6 geplant/)).toBeInTheDocument();
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

  it('fuehrt keinen zweiten Weg "Grundlage erfassen" neben dem der Akte', async () => {
    // Der Weg steht im Kopf der Akte und ist aus jedem Bereich erreichbar.
    // Zweimal derselbe Knopf auf einer Seite waere ein Raetsel; der
    // Rollenschnitt dahinter wird am Kopf geprueft.
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    await screen.findByText('Keine laufende Behandlungsgrundlage');
    expect(screen.queryByRole('link', { name: 'Grundlage erfassen' })).not.toBeInTheDocument();
  });

  it('zeigt einem Patientenkonto den Abschnitt gar nicht', () => {
    const { container } = renderWithProviders(
      <Verordnungsbereich patient={patient} user={testUser(['patient'])} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(fetchPatientTreatmentBases).not.toHaveBeenCalled();
    expect(fetchPatientTreatmentBasesClinical).not.toHaveBeenCalled();
    expect(fetchPatientTreatmentBasisSlots).not.toHaveBeenCalled();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPatientTreatmentBasesClinical.mockRejectedValue(new Error('interne Ursache'));
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['team_lead'])} />);

    expect(
      await screen.findByText('Die Behandlungsgrundlagen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/interne Ursache/)).not.toBeInTheDocument();
  });

  it('sagt bei leerer Akte, wo die erste Verordnung entsteht', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Keine laufende Behandlungsgrundlage')).toBeInTheDocument();
  });
});
