import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type * as TreatmentBasesApi from './api';
import type * as BerichtApi from '@/features/therapy-reports/api';
import type * as DateienApi from '@/features/files/api';
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

const fetchBerichteDerAkte = vi.fn();

vi.mock('@/features/therapy-reports/api', async (importOriginal) => {
  const actual = await importOriginal<typeof BerichtApi>();
  return {
    ...actual,
    fetchBerichteDerAkte: (id: string) =>
      fetchBerichteDerAkte(id) as Promise<BerichtApi.Berichtszeile[]>,
  };
});

// Der Scan an jeder Verordnung liest die Dateien der Akte - hier ohne Server.
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof DateienApi>()),
  fetchPatientFiles: () => Promise.resolve([]),
}));

const { Verordnungsbereich } = await import('./PatientTreatmentBasesPage');

function berichtszeile(rest: Partial<BerichtApi.Berichtszeile> = {}): BerichtApi.Berichtszeile {
  return {
    id: 'b1',
    treatment_basis_id: 'v1',
    status: 'abgeschlossen',
    created_at: '2026-09-20T08:00:00.000Z',
    author_name: 'Anna Beispiel',
    completed_at: '2026-09-21T08:00:00.000Z',
    completed_on: '2026-09-21',
    completed_by_name: 'Anna Beispiel',
    recommendation: 'Synthetisch: Keine weitere Verordnung.',
    recommendation_by_name: 'Anna Beispiel',
    recommendation_on: '2026-09-21',
    ...rest,
  };
}

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
    fetchBerichteDerAkte.mockReset();
    fetchBerichteDerAkte.mockResolvedValue([]);
  });

  // ---------------------------------------------------------------------------
  // DOK-005: Therapiebericht an der Verordnung. Die Empfehlung zum
  // Verordnungsende steht mit Quelle und Datum (ANN-014); schreiben dürfen die
  // behandelnden Rollen, office liest und druckt.
  // ---------------------------------------------------------------------------
  describe('Therapiebericht (DOK-005)', () => {
    it('zeigt die Empfehlung aus dem abgeschlossenen Bericht mit Quelle und Datum', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
      fetchBerichteDerAkte.mockResolvedValue([
        berichtszeile({ id: 'b0', status: 'entwurf', recommendation: 'Synthetisch: Entwurf.' }),
        berichtszeile(),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('Synthetisch: Keine weitere Verordnung.')).toBeInTheDocument();
      expect(
        screen.getByText('Anna Beispiel, 21.09.2026, aus dem Therapiebericht'),
      ).toBeInTheDocument();
      // Ein Entwurf ist noch keine Empfehlung an irgendwen.
      expect(screen.queryByText('Synthetisch: Entwurf.')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Bericht vom 21.09.2026/ })).toHaveAttribute(
        'href',
        '/patienten/' + patient.id + '/berichte/b1/druck',
      );
      expect(screen.getByRole('link', { name: 'Entwurf von Anna Beispiel' })).toHaveAttribute(
        'href',
        '/patienten/' + patient.id + '/berichte/b0',
      );
    });

    it('bietet der Therapeut:in einen neuen Bericht an, am Selbstzahler nicht', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([
        verordnung(),
        verordnung({
          id: 'sz1',
          treatment_basis_kind: 'self_pay',
          prescriber_id: null,
          prescriber_name: null,
          prescriber_practice_name: null,
          diagnosis: null,
        }),
      ]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent(),
        kontingent({ treatment_basis_id: 'sz1' }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findAllByRole('button', { name: 'Therapiebericht schreiben' }),
      ).toHaveLength(1);
    });

    it('lässt office den Bericht lesen, aber keinen schreiben', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
      fetchBerichteDerAkte.mockResolvedValue([berichtszeile({ status: 'entwurf' })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      // Auch ein Entwurf führt office auf das Blatt, nicht ins Formular.
      expect(
        await screen.findByRole('link', { name: 'Entwurf von Anna Beispiel' }),
      ).toHaveAttribute('href', '/patienten/' + patient.id + '/berichte/b1/druck');
      expect(
        screen.queryByRole('button', { name: 'Therapiebericht schreiben' }),
      ).not.toBeInTheDocument();
    });

    it('fragt ohne Leserecht gar nicht erst nach Berichten', () => {
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['patient'])} />);
      expect(fetchBerichteDerAkte).not.toHaveBeenCalled();
    });
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

      expect(await screen.findByText('8, davon 1 genutzt')).toBeInTheDocument();
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

      // Ein Wort je Zahl - „verplant" wie der Zustand - und durchgehend die
      // Einheit „Termine" (VER-08).
      expect(await screen.findByText('10, davon 7 genutzt')).toBeInTheDocument();
      expect(screen.getByText('8 verplant · 2 bevorstehend')).toBeInTheDocument();
      expect(screen.getByText('2 Termine')).toBeInTheDocument();
      expect(screen.queryByText(/Behandlungen|zugeordnet/)).not.toBeInTheDocument();
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
      expect(screen.queryByText('6, davon 0 genutzt')).not.toBeInTheDocument();
    });

    it('fuehrt von der Verordnung zu ihren Terminen', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent({ planned: 3 })]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      // Bauartneutral: am Selbstzahler gibt es keine Verordnung (VER-08).
      expect(await screen.findByRole('link', { name: 'Termine dieser Grundlage' })).toHaveAttribute(
        'href',
        `/patienten/${patient.id}/termine?verordnung=v1`,
      );
    });

    it('nennt eine Verordnung ohne Termin als solche, ohne Link', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent({ planned: 0, upcoming: 0, remaining: 3 }),
      ]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findByText('Noch kein Termin verplant')).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Termine dieser Grundlage' }),
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

    it('laesst office die Verordnung bearbeiten (PRX-010), die Trainingsbetreuung nicht', async () => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.getByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
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
      expect(screen.getByText(/6 von 6 Terminen genutzt · 6 verplant/)).toBeInTheDocument();
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
    // Keine Ratefrage nach der Anmeldung (WRT-01).
    expect(screen.queryByText(/angemeldet/)).not.toBeInTheDocument();
  });

  it('sagt bei leerer Akte, wo die erste Verordnung entsteht', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Keine laufende Behandlungsgrundlage')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Die nächste entsteht über „Grundlage erfassen“ – als Verordnung oder als Selbstzahler.',
      ),
    ).toBeInTheDocument();
  });

  // WRT-12: Rollen mit den Namen, die die Anwendung sonst zeigt - keine
  // „therapeutischen Rollen", die es nirgends gibt.
  it('zeigt dem Buero den Weg zur naechsten Grundlage (PRX-010)', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['office'])} />);

    expect(
      await screen.findByText(/Die nächste entsteht über „Grundlage erfassen“/),
    ).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
// UXR-007: Zustände, Sprung und Rückmeldung im Grundlagenbereich der Akte.
// -----------------------------------------------------------------------------
describe('Grundlagenbereich der Akte (UXR-007)', () => {
  const ausgeschoepft = verordnung({
    id: 'v0',
    issued_on: '2025-11-12',
    treatment_basis_kind: 'first',
    items: [position({ prescribed_quantity: 6, used_quantity: 6, remaining_quantity: 0 })],
  });
  const zahlenAusgeschoepft = kontingent({
    treatment_basis_id: 'v0',
    prescribed: 6,
    used: 6,
    planned: 6,
    upcoming: 0,
    remaining: 0,
  });

  beforeEach(() => {
    fetchPatientTreatmentBases.mockReset();
    fetchPatientTreatmentBasesClinical.mockReset();
    fetchPatientTreatmentBasisSlots.mockReset();
    fetchPatientTreatmentBases.mockResolvedValue([]);
    fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung(), ausgeschoepft]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent(), zahlenAusgeschoepft]);
    fetchBerichteDerAkte.mockReset();
    fetchBerichteDerAkte.mockResolvedValue([]);
  });

  /** Mit einem Verlaufseintrag samt Zustand, wie ihn `navigate(…, { state })` hinterlässt. */
  function mitVerlaufseintrag(eintrag: { pathname: string; state?: unknown }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: <Verordnungsbereich patient={patient} user={testUser(['therapist'])} />,
        },
      ],
      { initialEntries: [eintrag] },
    );
    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  describe('Terminzahlen getrennt von den Grundlagen (VER-14)', () => {
    it('zeigt die Grundlagen, wenn nur die Zahlen fehlen - ohne geratenen Zustand', async () => {
      fetchPatientTreatmentBasisSlots.mockRejectedValue(new Error('interne Ursache'));
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findByText(/Die Terminzahlen konnten nicht geladen werden\./),
      ).toBeInTheDocument();
      expect(screen.getByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
      expect(
        screen.queryByText('Die Behandlungsgrundlagen konnten nicht geladen werden.'),
      ).not.toBeInTheDocument();
      // Ohne Zahlen ist „Offen" nur geraten - das Abzeichen fehlt deshalb.
      expect(screen.queryByText('Offen')).not.toBeInTheDocument();
      // Die Aktionen bleiben (grundlagen.ts): Nichts verschwindet, weil eine
      // Nebenabfrage scheitert.
      expect(screen.getAllByRole('link', { name: 'Terminserie anlegen' })).not.toHaveLength(0);
      expect(screen.queryByText(/interne Ursache/)).not.toBeInTheDocument();
    });

    it('sagt, dass die Zahlen noch geladen werden', async () => {
      fetchPatientTreatmentBasisSlots.mockReturnValue(new Promise(() => {}));
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      expect(await screen.findAllByText('Terminzahlen werden geladen …')).not.toHaveLength(0);
      expect(screen.queryByText('Offen')).not.toBeInTheDocument();
    });

    it('bietet nach einem Ladefehler der Grundlagen einen neuen Versuch an (WRT-01)', async () => {
      fetchPatientTreatmentBasesClinical.mockRejectedValueOnce(new Error('interne Ursache'));
      const user = userEvent.setup();
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      const kasten = await screen.findByRole('alert');
      expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
      await user.click(within(kasten).getByRole('button', { name: 'Erneut versuchen' }));

      expect(await screen.findByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
    });
  });

  describe('Sprung aus der Terminliste (VER-06)', () => {
    it('markiert eine angesprungene laufende Grundlage und setzt den Fokus dorthin', async () => {
      const rollen = vi.spyOn(Element.prototype, 'scrollIntoView');
      renderWithProviders(
        <Verordnungsbereich patient={patient} user={testUser(['therapist'])} />,
        `/patienten/${patient.id}/verordnungen#verordnung-v1`,
      );

      const karte = (await screen.findByText('Folgeverordnung vom 18.06.2026')).closest('li')!;
      await vi.waitFor(() => expect(karte).toHaveFocus());
      expect(karte).toHaveAttribute('data-angesprungen');
      expect(rollen).toHaveBeenCalledWith({ block: 'start' });
      rollen.mockRestore();
    });

    it('klappt eine angesprungene ausgeschoepfte Grundlage auf', async () => {
      renderWithProviders(
        <Verordnungsbereich patient={patient} user={testUser(['therapist'])} />,
        `/patienten/${patient.id}/verordnungen#verordnung-v0`,
      );

      const zeile = await screen.findByText('Erstverordnung vom 12.11.2025');
      await vi.waitFor(() => expect(zeile.closest('details')).toHaveAttribute('open'));
      expect(zeile.closest('li')).toHaveFocus();
    });

    it('markiert ohne Sprungmarke keine Karte', async () => {
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

      const karte = (await screen.findByText('Folgeverordnung vom 18.06.2026')).closest('li')!;
      expect(karte).not.toHaveAttribute('data-angesprungen');
      expect(karte).not.toHaveAttribute('tabindex');
    });
  });

  describe('Rückmeldung aus „Termine übertragen" (VER-13)', () => {
    it('sagt, wie viele Termine gewandert sind', async () => {
      mitVerlaufseintrag({
        pathname: `/patienten/${patient.id}/verordnungen`,
        state: { termineUebertragen: 3 },
      });

      expect(await screen.findByText(/3 Termine übertragen\./)).toBeInTheDocument();
    });

    it('schweigt ohne Rueckmeldung und bei unbrauchbarem Zustand', async () => {
      mitVerlaufseintrag({
        pathname: `/patienten/${patient.id}/verordnungen`,
        state: { termineUebertragen: 'drei' },
      });

      await screen.findByText('Folgeverordnung vom 18.06.2026');
      expect(screen.queryByText(/übertragen\./)).not.toBeInTheDocument();
    });
  });

  // UX-005e: Ohne Scan steht nur die eingeklappte Zeile „Scan hinzufügen" -
  // weder eine Überschrift noch ein Satz über den fehlenden Scan.
  it.each([['office'], ['therapist']] as const)(
    'bietet %s ohne Scan nur das eingeklappte Hinzufügen an (PRX-010, UX-005e)',
    async (role) => {
      fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
      renderWithProviders(<Verordnungsbereich patient={patient} user={testUser([role])} />);

      expect(await screen.findByText('Scan hinzufügen')).toBeInTheDocument();
      expect(screen.queryByText(/Ein Foto des Rezepts/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Noch kein Scan/)).not.toBeInTheDocument();
      expect(screen.queryByText('Scan des Rezepts')).not.toBeInTheDocument();
    },
  );

  it('klappt das Hinzufügen des Scans ein, ohne großen Leerzustand (VER-01)', async () => {
    fetchPatientTreatmentBasesClinical.mockResolvedValue([verordnung()]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent()]);
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    const kopf = await screen.findByText('Scan hinzufügen');
    expect(kopf.closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByText('Keine Datei')).toBeNull();
  });

  it('erklärt die Abschnitte nicht in Dauersätzen (UX-005e)', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    await screen.findByText('Folgeverordnung vom 18.06.2026');
    expect(screen.queryByText(/deren mögliche Termine/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nach Jahr, neueste zuerst/)).not.toBeInTheDocument();
    // „Offen" ist der Regelfall und trägt kein Etikett.
    expect(screen.queryByText('Offen')).not.toBeInTheDocument();
  });

  it('zeigt am Kopf einer ausgeschoepften Grundlage ein Aufklappzeichen (RSP-07)', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    const kopf = (await screen.findByText('Erstverordnung vom 12.11.2025')).closest('summary')!;
    expect(kopf.querySelector('[data-aufklappzeichen]')).not.toBeNull();
    expect(within(kopf).queryByText('Details')).not.toBeInTheDocument();
  });

  // Seit dem Design-Handoff vom 2026-10-01 entscheidet die Breite der Karte
  // (1024 px), nicht die des Fensters: Neben der Akte steht ab 900 px eine
  // Kontextspalte, und bei 1280 px Fensterbreite wäre die Karte sonst wieder
  // zu schmal für zwei Spalten.
  it('stellt Zahlen und Angaben erst ab 1024 px Kartenbreite nebeneinander (VER-20)', async () => {
    renderWithProviders(<Verordnungsbereich patient={patient} user={testUser(['therapist'])} />);

    const karte = (await screen.findByText('Folgeverordnung vom 18.06.2026')).closest('li')!;
    const raster = karte.querySelector('.grid')!;
    expect(raster).toHaveClass('@5xl:grid-cols-2');
    expect(raster.closest('.\\@container')).not.toBeNull();
    expect(raster).not.toHaveClass('lg:grid-cols-2');
    expect(raster).not.toHaveClass('xl:grid-cols-2');
  });
});
