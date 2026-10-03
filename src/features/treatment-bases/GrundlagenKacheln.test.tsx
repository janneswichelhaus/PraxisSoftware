import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TreatmentBasesApi from './api';
import type * as DateienApi from '@/features/files/api';
import type * as BillingApi from '@/features/billing/api';
import { renderWithProviders, testUser } from '@/test-utils';
import type { VerordnungMitZahlen } from './grundlagen';

/**
 * Kachelleiste und „Daten übertragen" (Akte entschlacken, 2026-10-03).
 * Alle Daten synthetisch.
 */
const PATIENT = '11111111-1111-4111-8111-000000000001';
const FOTO = '22222222-2222-4222-8222-000000000001';
const NEU = '33333333-3333-4333-8333-000000000009';

const fetchPatientFiles = vi.fn();
const ordneScanZu = vi.fn();
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof DateienApi>()),
  fetchPatientFiles: () => fetchPatientFiles() as Promise<DateienApi.PatientFile[]>,
  ordneScanZu: (fileId: string, id: string) => ordneScanZu(fileId, id) as Promise<void>,
}));

const createTreatmentBasis = vi.fn();
const updateTreatmentBasis = vi.fn();
const fetchTreatmentBasis = vi.fn();
const setTreatmentBasisIcd10 = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TreatmentBasesApi>()),
  createTreatmentBasis: (...args: unknown[]) => createTreatmentBasis(...args) as Promise<string>,
  updateTreatmentBasis: (...args: unknown[]) => updateTreatmentBasis(...args) as Promise<void>,
  fetchTreatmentBasis: (id: string) =>
    fetchTreatmentBasis(id) as Promise<TreatmentBasesApi.TreatmentBasisDetail | null>,
  fetchPrescribers: () =>
    Promise.resolve([
      {
        id: 'p1',
        title: 'Dr. med.',
        given_name: 'Petra',
        family_name: 'Probst',
        practice_name: 'Praxis Fiktiv',
        speciality: null,
        street: null,
        house_number: null,
        postal_code: null,
        city: null,
        phone: null,
        fax: null,
        email: null,
      },
    ]),
  setTreatmentBasisIcd10: (id: string, code: string) =>
    setTreatmentBasisIcd10(id, code) as Promise<void>,
}));

vi.mock('@/features/billing/api', async (importOriginal) => ({
  ...(await importOriginal<typeof BillingApi>()),
  fetchKatalogVersionen: () =>
    Promise.resolve([
      { id: 'k1', label: '2026', valid_from: '2026-01-01', published_at: '2026-01-01T00:00:00Z' },
    ]),
  fetchKatalogPositionen: () =>
    Promise.resolve([
      {
        id: 'kp1',
        catalog_version_id: 'k1',
        sort_order: 1,
        code: 'X0501',
        label: 'Krankengymnastik',
        item_kind: 'treatment',
        remedy: 'Krankengymnastik',
        unit_price_cents: 3000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
        service_area: 'therapy',
      },
    ]),
}));

const { GrundlagenKacheln } = await import('./GrundlagenKacheln');

function scan(rest: Partial<DateienApi.PatientFile> = {}): DateienApi.PatientFile {
  return {
    id: FOTO,
    treatment_basis_id: null,
    document_type: 'verordnungsscan',
    is_clinical: true,
    display_name: 'Verordnung, 13.09.2026',
    mime_type: 'image/jpeg',
    byte_size: 1000,
    uploaded_at: '2026-09-13T08:00:00.000Z',
    uploaded_by_name: 'Anna Beispiel',
    object_missing: false,
    verified_at: null,
    ...rest,
  };
}

function eintrag(
  rest: Partial<TreatmentBasesApi.ClinicalTreatmentBasis> = {},
  zustand: VerordnungMitZahlen['zustand'] = 'offen',
): VerordnungMitZahlen {
  return {
    verordnung: {
      id: 'v1',
      prescriber_id: 'p1',
      prescriber_name: 'Dr. med. Petra Probst',
      prescriber_practice_name: 'Praxis Fiktiv',
      treatment_basis_kind: 'first',
      issued_on: '2026-09-01',
      frequency_note: null,
      note: null,
      items: [
        {
          id: 'i1',
          sort_order: 1,
          remedy: 'Krankengymnastik',
          prescribed_quantity: 10,
          used_quantity: 7,
          remaining_quantity: 3,
        },
      ],
      updated_at: '2026-09-01T10:00:00.000Z',
      diagnosis: 'Synthetisch: Rückenschmerz.',
      diagnosis_icd10: 'M54.5',
      therapy_goal: null,
      prescriber_note: null,
      follow_up_recommendation: null,
      ...rest,
    },
    kontingent: null,
    zustand,
  };
}

const laufend = eintrag();
const selbstzahler = eintrag({
  id: 'v2',
  treatment_basis_kind: 'self_pay',
  prescriber_id: null,
  prescriber_name: null,
  diagnosis_icd10: null,
});
const alt = eintrag({ id: 'v3', issued_on: '2026-01-10' }, 'ausgeschoepft');

function zeigen(roles: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <GrundlagenKacheln
      patientId={PATIENT}
      user={testUser(roles)}
      aktuell={[laufend, selbstzahler]}
      abgeschlossen={[alt]}
    />,
    `/patienten/${PATIENT}/verordnungen`,
  );
}

describe('GrundlagenKacheln', () => {
  beforeEach(() => {
    fetchPatientFiles.mockReset().mockResolvedValue([scan()]);
    ordneScanZu.mockReset().mockResolvedValue(undefined);
    createTreatmentBasis.mockReset().mockResolvedValue(NEU);
    updateTreatmentBasis.mockReset().mockResolvedValue(undefined);
    fetchTreatmentBasis.mockReset();
    setTreatmentBasisIcd10.mockReset().mockResolvedValue(undefined);
  });

  it('zeigt erst das Foto ohne Daten, dann die laufenden, zuletzt die abgeschlossenen', async () => {
    zeigen();
    await screen.findByText('Daten fehlen');
    const kacheln = within(screen.getByRole('list')).getAllByRole('button');

    expect(kacheln).toHaveLength(4);
    expect(kacheln[0]).toHaveTextContent('Daten übertragen');
    expect(kacheln[0]).toHaveTextContent('Foto 13.09.2026');
    expect(kacheln[1]).toHaveTextContent('Verordnung');
    expect(kacheln[1]).toHaveTextContent('Dr. med. Petra Probst');
    expect(kacheln[1]).toHaveTextContent('KG7/10');
    expect(kacheln[1]).toHaveTextContent('ICD M54.5');
    expect(kacheln[2]).toHaveTextContent('Selbstzahler');
    expect(kacheln[2]).toHaveTextContent('ohne Verordnung');
    expect(kacheln[2]).toHaveTextContent('Vereinbarung');
    expect(kacheln[3]).toHaveTextContent('Abgeschlossen');
    expect(kacheln[3]).toHaveClass('bg-surface-sunken');
    expect(screen.getByRole('heading', { name: /Behandlungsgrundlagen/ })).toHaveTextContent(
      '· 3 Grundlagen',
    );
  });

  it('überträgt die Daten vom Foto: legt die Verordnung an, setzt ICD-10 und ordnet das Foto zu', async () => {
    const user = userEvent.setup();
    zeigen();
    await user.click(
      await screen.findByRole('button', { name: /Verordnungsfoto vom 13\.09\.2026/ }),
    );

    const fenster = await screen.findByRole('dialog', { name: 'Daten übertragen' });
    const f = within(fenster);
    await user.type(f.getByLabelText('Ausstellungsdatum'), '2026-09-12');
    await user.selectOptions(f.getByLabelText('Art'), 'first');
    await user.selectOptions(await f.findByLabelText('Verordnende Ärzt:in'), 'p1');
    await user.type(f.getByLabelText('Diagnose (ICD-10)'), 'm54.5');
    // Die Pos.-Nr. kommt aus der gültigen Preisliste.
    await f.findByRole('option', { name: 'Krankengymnastik (KG) · Pos. X0501' });
    await user.selectOptions(f.getByLabelText('Heilmittel'), 'Krankengymnastik');
    await user.type(f.getByLabelText('Anzahl'), '6');
    await user.click(f.getByLabelText('Hausbesuch je Termin'));
    await user.click(f.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(ordneScanZu).toHaveBeenCalledWith(FOTO, NEU));
    const [patientId, werte, positionen] = createTreatmentBasis.mock.calls[0] as [
      string,
      { appointment_count: number },
      TreatmentBasesApi.Heilmittelposition[],
    ];
    expect(patientId).toBe(PATIENT);
    // ANN-227: ohne eigene Angabe die größte Anzahl einer Position.
    expect(werte.appointment_count).toBe(6);
    expect(positionen).toEqual([
      expect.objectContaining({ remedy: 'Krankengymnastik', menge: 6 }),
      expect.objectContaining({ remedy: 'Hausbesuch', menge: 6 }),
    ]);
    expect(setTreatmentBasisIcd10).toHaveBeenCalledWith(NEU, 'M54.5');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('weist einen ICD-10-Code im falschen Format ab und speichert nichts', async () => {
    const user = userEvent.setup();
    zeigen();
    await user.click(await screen.findByRole('button', { name: /Verordnungsfoto/ }));
    const f = within(await screen.findByRole('dialog', { name: 'Daten übertragen' }));
    await user.type(f.getByLabelText('Diagnose (ICD-10)'), 'Rücken');
    await user.click(f.getByRole('button', { name: 'Speichern' }));

    expect(
      await f.findByText('Bitte einen ICD-10-Code wie G20.00 oder M54.5 eingeben.'),
    ).toBeInTheDocument();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
    expect(ordneScanZu).not.toHaveBeenCalled();
  });

  it('öffnet eine Verordnung mit ihren Daten und ändert sie über den bestehenden Weg', async () => {
    fetchTreatmentBasis.mockResolvedValue({
      ...laufend.verordnung,
      patient_id: PATIENT,
      appointment_count: 10,
    });
    const user = userEvent.setup();
    zeigen();
    await user.click(await screen.findByRole('button', { name: /^Verordnung01\.09/ }));

    const f = within(await screen.findByRole('dialog', { name: 'Daten übertragen' }));
    expect(await f.findByLabelText('Diagnose (ICD-10)')).toHaveValue('M54.5');
    expect(f.getByLabelText('Anzahl')).toHaveValue('10');
    await user.click(f.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(updateTreatmentBasis).toHaveBeenCalled());
    expect(createTreatmentBasis).not.toHaveBeenCalled();
    // Unveränderter Code: kein zweiter Schreibzugriff.
    expect(setTreatmentBasisIcd10).not.toHaveBeenCalled();
    expect(ordneScanZu).not.toHaveBeenCalled();
  });

  it('öffnet für einen Selbstzahler kein Fenster', async () => {
    const user = userEvent.setup();
    zeigen();
    await user.click(await screen.findByRole('button', { name: /Selbstzahler/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zeigt ohne Grundlage und ohne Foto nichts', async () => {
    fetchPatientFiles.mockResolvedValue([]);
    const { container } = renderWithProviders(
      <GrundlagenKacheln
        patientId={PATIENT}
        user={testUser(['therapist'])}
        aktuell={[]}
        abgeschlossen={[]}
      />,
    );
    await waitFor(() => expect(fetchPatientFiles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
