import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TreatmentBasesApi from './api';
import type * as DateienApi from '@/features/patients/files/api';
import type * as KiVerordnung from '@/lib/ki/verordnung';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders, testUser } from '@/test-utils';
import { FELDER_NACHBILDUNG, FELDER_RECHTSSATZ, NICHTS_GEFUNDEN } from './felderVorschlag';

// Felder vom Foto im Fenster „Daten übertragen“ (ANN-861, ANN-862): erst das Foto, dann der
// Vorschlag mit seiner Zeile vom Foto; eingetragen nur in leere Felder, gespeichert nur mit
// „Speichern“. Alle Daten synthetisch.

const PATIENT = '11111111-1111-4111-8111-000000000001';
const FOTO = '22222222-2222-4222-8222-000000000001';
const NEU = '33333333-3333-4333-8333-000000000009';
const BILD = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: 'image/jpeg' });

const fetchPatientFiles = vi.fn();
const ordneScanZu = vi.fn();
const ladeDateiZumAnzeigen = vi.fn();
vi.mock('@/features/patients/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof DateienApi>()),
  fetchPatientFiles: () => fetchPatientFiles() as Promise<DateienApi.PatientFile[]>,
  ordneScanZu: (fileId: string, id: string) => ordneScanZu(fileId, id) as Promise<void>,
  ladeDateiZumAnzeigen: (fileId: string) =>
    ladeDateiZumAnzeigen(fileId) as Promise<{ bild: Blob; mimeType: string; name: string }>,
}));

const createTreatmentBasis = vi.fn();
const setTreatmentBasisIcd10 = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TreatmentBasesApi>()),
  createTreatmentBasis: (...args: unknown[]) => createTreatmentBasis(...args) as Promise<string>,
  setTreatmentBasisIcd10: (id: string, code: string) =>
    setTreatmentBasisIcd10(id, code) as Promise<void>,
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
}));

const felderVorschlagen = vi.fn();
const felderVerfuegbar = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/ki/verordnung', async (importOriginal) => ({
  ...(await importOriginal<typeof KiVerordnung>()),
  felderVorschlagen: (...a: unknown[]) =>
    felderVorschlagen(...a) as Promise<KiVerordnung.Felderergebnis>,
  felderVerfuegbar: () => felderVerfuegbar(),
}));

const { GrundlagenKacheln } = await import('./GrundlagenKacheln');

const FUNDSTELLEN: KiVerordnung.Fundstelle[] = [
  { feld: 'ausgestellt_am', wert: '02.11.2026', zeile: 'Ausgestellt am 02.11.2026' },
  { feld: 'art', wert: 'Folgeverordnung', zeile: 'Folgeverordnung' },
  { feld: 'verordnende', wert: 'Dr. med. Petra Probst', zeile: 'Dr. med. Petra Probst' },
  { feld: 'icd10', wert: 'M17.1', zeile: 'ICD-10: M17.1' },
  { feld: 'diagnose', wert: 'Gonarthrose rechts', zeile: 'Gonarthrose rechts' },
  { feld: 'heilmittel', wert: 'Krankengymnastik 6 x', zeile: 'Krankengymnastik 6 x' },
  { feld: 'hausbesuch', wert: 'Hausbesuch: ja', zeile: 'Hausbesuch: ja' },
];

function scan(): DateienApi.PatientFile {
  return {
    id: FOTO,
    treatment_basis_id: null,
    document_type: 'verordnungsscan',
    is_clinical: true,
    display_name: 'Verordnung, 03.11.2026',
    mime_type: 'image/jpeg',
    byte_size: 1000,
    uploaded_at: '2026-11-03T08:00:00.000Z',
    uploaded_by_name: 'Anna Beispiel',
    object_missing: false,
    verified_at: null,
    released_at: null,
  };
}

async function oeffnen() {
  const nutzer = userEvent.setup();
  const ergebnis = renderWithProviders(
    <GrundlagenKacheln
      patientId={PATIENT}
      user={testUser(['office'])}
      aktuell={[]}
      abgeschlossen={[]}
      ladePosNummern={() => Promise.resolve(new Map())}
    />,
    `/patienten/${PATIENT}/verordnungen`,
  );
  await nutzer.click(await screen.findByRole('button', { name: /Verordnungsfoto/ }));
  const fenster = within(await screen.findByRole('dialog', { name: 'Daten übertragen' }));
  return { nutzer, fenster, ...ergebnis };
}

async function vorschlagen(
  nutzer: ReturnType<typeof userEvent.setup>,
  fenster: Awaited<ReturnType<typeof oeffnen>>['fenster'],
) {
  await nutzer.click(fenster.getByRole('button', { name: 'Foto anzeigen' }));
  await nutzer.click(await fenster.findByRole('button', { name: 'Felder vorschlagen' }));
}

describe('Felder vom Foto vorschlagen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T09:00:00Z'));
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:foto');
    URL.revokeObjectURL = vi.fn();
    fetchPatientFiles.mockResolvedValue([scan()]);
    ordneScanZu.mockResolvedValue(undefined);
    createTreatmentBasis.mockResolvedValue(NEU);
    setTreatmentBasisIcd10.mockResolvedValue(undefined);
    ladeDateiZumAnzeigen.mockResolvedValue({ bild: BILD, mimeType: 'image/jpeg', name: 'x' });
    felderVerfuegbar.mockResolvedValue(true);
    felderVorschlagen.mockResolvedValue({
      ok: true,
      fundstellen: FUNDSTELLEN,
      quelle: 'nachbildung',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bietet den Vorschlag erst an, wenn das Foto geladen ist', async () => {
    const { nutzer, fenster } = await oeffnen();
    expect(fenster.queryByRole('button', { name: 'Felder vorschlagen' })).toBeNull();
    await nutzer.click(fenster.getByRole('button', { name: 'Foto anzeigen' }));
    expect(await fenster.findByRole('button', { name: 'Felder vorschlagen' })).toBeEnabled();
  });

  it('bietet nichts an, wenn der Gateway den Zweck nicht bedient', async () => {
    felderVerfuegbar.mockResolvedValue(false);
    const { nutzer, fenster } = await oeffnen();
    await nutzer.click(fenster.getByRole('button', { name: 'Foto anzeigen' }));
    await fenster.findByRole('img', { name: 'Foto der Verordnung' });
    await waitFor(() => expect(felderVerfuegbar).toHaveBeenCalled());
    expect(fenster.queryByRole('button', { name: 'Felder vorschlagen' })).toBeNull();
  });

  it('schickt genau das geladene Foto und zeigt je Wert seine Zeile vom Foto', async () => {
    const { nutzer, fenster, container } = await oeffnen();
    await vorschlagen(nutzer, fenster);

    const liste = await fenster.findByRole('list', { name: 'Vorgeschlagene Felder' });
    expect(felderVorschlagen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ dateiId: FOTO, bild: BILD }),
    );
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen).toHaveLength(7);
    expect(zeilen[0]).toHaveTextContent('Ausstellungsdatum');
    expect(zeilen[0]).toHaveTextContent('Aus: „Ausgestellt am 02.11.2026“');
    expect(zeilen[2]).toHaveTextContent('Dr. med. Petra Probst');
    expect(zeilen[5]).toHaveTextContent('Krankengymnastik · 6');
    expect(fenster.getByText(FELDER_NACHBILDUNG)).toBeInTheDocument();
    expect(fenster.getByText(FELDER_RECHTSSATZ)).toBeInTheDocument();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
    await pruefeBarrierefreiheit(container);
  });

  it('trägt auf ausdrücklichen Tipp ein - gespeichert wird erst mit „Speichern“', async () => {
    const { nutzer, fenster } = await oeffnen();
    await vorschlagen(nutzer, fenster);
    await nutzer.click(await fenster.findByRole('button', { name: 'Übernehmen' }));

    expect(await fenster.findByText('7 Felder übernommen.')).toBeInTheDocument();
    expect(fenster.queryByRole('list', { name: 'Vorgeschlagene Felder' })).toBeNull();
    expect(fenster.getByLabelText('Ausstellungsdatum')).toHaveValue('2026-11-02');
    expect(fenster.getByLabelText('Art')).toHaveValue('follow_up');
    expect(fenster.getByLabelText('Verordnende Ärzt:in')).toHaveValue('p1');
    expect(fenster.getByLabelText('Diagnose (ICD-10)')).toHaveValue('M17.1');
    expect(fenster.getByLabelText('Diagnose oder Leitsymptomatik')).toHaveValue(
      'Gonarthrose rechts',
    );
    expect(fenster.getByLabelText('Heilmittel')).toHaveValue('Krankengymnastik');
    expect(fenster.getByLabelText('Anzahl')).toHaveValue('6');
    expect(fenster.getByLabelText('Hausbesuch je Termin')).toBeChecked();
    expect(createTreatmentBasis).not.toHaveBeenCalled();

    await nutzer.click(fenster.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(ordneScanZu).toHaveBeenCalledWith(FOTO, NEU));
    const [, werte, positionen] = createTreatmentBasis.mock.calls[0] as [
      string,
      { issued_on: string; treatment_basis_kind: string; prescriber_id: string },
      TreatmentBasesApi.Heilmittelposition[],
    ];
    expect(werte).toMatchObject({
      issued_on: '2026-11-02',
      treatment_basis_kind: 'follow_up',
      prescriber_id: 'p1',
    });
    expect(positionen).toEqual([
      expect.objectContaining({ remedy: 'Krankengymnastik', menge: 6 }),
      expect.objectContaining({ remedy: 'Hausbesuch', menge: 6 }),
    ]);
    expect(setTreatmentBasisIcd10).toHaveBeenCalledWith(NEU, 'M17.1');
  });

  it('lässt stehen, was schon eingetragen ist', async () => {
    const { nutzer, fenster } = await oeffnen();
    await nutzer.type(fenster.getByLabelText('Diagnose (ICD-10)'), 'M54.5');
    await vorschlagen(nutzer, fenster);
    await nutzer.click(await fenster.findByRole('button', { name: 'Übernehmen' }));

    expect(await fenster.findByText('6 Felder übernommen. 1 ausgefülltes blieb.')).toBeVisible();
    expect(fenster.getByLabelText('Diagnose (ICD-10)')).toHaveValue('M54.5');
  });

  it('zeigt einen Wert ohne sichere Zuordnung mit Grund und trägt ihn nicht ein', async () => {
    felderVorschlagen.mockResolvedValue({
      ok: true,
      fundstellen: [
        { feld: 'verordnende', wert: 'Dr. Erna Fremd', zeile: 'Dr. Erna Fremd' },
        { feld: 'icd10', wert: 'M17.1', zeile: 'ICD-10: M17.1' },
      ],
      quelle: 'anbieter',
    });
    const { nutzer, fenster } = await oeffnen();
    await vorschlagen(nutzer, fenster);

    const liste = await fenster.findByRole('list', { name: 'Vorgeschlagene Felder' });
    expect(within(liste).getAllByRole('listitem')[0]).toHaveTextContent('Nicht im Verzeichnis');
    expect(fenster.queryByText(FELDER_NACHBILDUNG)).toBeNull();
    await nutzer.click(fenster.getByRole('button', { name: 'Übernehmen' }));
    expect(fenster.getByLabelText('Verordnende Ärzt:in')).toHaveValue('');
    expect(fenster.getByLabelText('Diagnose (ICD-10)')).toHaveValue('M17.1');
  });

  it('verwirft den Vorschlag, ohne ein Feld zu berühren', async () => {
    const { nutzer, fenster } = await oeffnen();
    await vorschlagen(nutzer, fenster);
    await nutzer.click(await fenster.findByRole('button', { name: 'Verwerfen' }));

    expect(fenster.queryByRole('list', { name: 'Vorgeschlagene Felder' })).toBeNull();
    expect(fenster.getByLabelText('Ausstellungsdatum')).toHaveValue('');
    expect(fenster.getByRole('button', { name: 'Felder vorschlagen' })).toBeEnabled();
  });

  it.each([
    [
      'der Gateway ablehnt',
      { ok: false, fehler: 'forbidden', meldung: 'Dafür fehlt hier die Berechtigung.' },
      'Dafür fehlt hier die Berechtigung.',
    ],
    ['nichts gefunden wurde', { ok: true, fundstellen: [], quelle: 'anbieter' }, NICHTS_GEFUNDEN],
  ])('meldet es und lässt den Knopf stehen, wenn %s', async (_fall, ergebnis, text) => {
    felderVorschlagen.mockResolvedValue(ergebnis);
    const { nutzer, fenster, container } = await oeffnen();
    await vorschlagen(nutzer, fenster);

    expect(await fenster.findByText(text)).toBeInTheDocument();
    expect(fenster.getByRole('button', { name: 'Felder vorschlagen' })).toBeEnabled();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
    await pruefeBarrierefreiheit(container);
  });
});
