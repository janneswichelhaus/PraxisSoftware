import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokuApi from './api';
import type { PatientTreatmentNotesEntry } from './api';
import type * as KiAuszug from '@/lib/ki/auszug';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders } from '@/test-utils';
import {
  AUSZUG_NACHBILDUNG,
  AUSZUG_RECHTSSATZ,
  AUSZUG_TERMINE,
  EINTRAEGE_NICHT_GELADEN,
  KEIN_EINTRAG,
  KEIN_SATZ,
} from './auszuege';

// Verlauf in Auszügen (ANN-861, ANN-862): gelesen wird erst auf Verlangen, hinaus gehen nur
// finalisierte Einträge der letzten Termine, und jede Zeile führt zu ihrem Eintrag.

const fetchPatientTreatmentNotesPage = vi.fn<() => Promise<PatientTreatmentNotesEntry[]>>();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof DokuApi>()),
  fetchPatientTreatmentNotesPage: (...a: unknown[]) =>
    (fetchPatientTreatmentNotesPage as (...b: unknown[]) => Promise<unknown>)(...a),
}));

const auszuegeAnfragen = vi.fn();
const auszugVerfuegbar = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/ki/auszug', async (importOriginal) => ({
  ...(await importOriginal<typeof KiAuszug>()),
  auszuegeAnfragen: (...a: unknown[]) =>
    auszuegeAnfragen(...a) as Promise<KiAuszug.Auszugsergebnis>,
  auszugVerfuegbar: () => auszugVerfuegbar(),
}));

const { VerlaufInAuszuegen } = await import('./VerlaufInAuszuegen');
const { quellenAus } = await import('./auszugsquellen');

const AKTE = '66666666-6666-4666-8666-000000000002';
const HIER = `/patienten/${AKTE}/vorbereiten`;

function eintrag(
  nummer: number,
  teil: Partial<PatientTreatmentNotesEntry['notes'][number]> = {},
): PatientTreatmentNotesEntry['notes'][number] {
  return {
    id: `88888888-8888-4888-8888-0000000000${String(nummer).padStart(2, '0')}`,
    appointment_id: `77777777-7777-4777-8777-0000000000${String(nummer).padStart(2, '0')}`,
    addendum_to_note_id: null,
    status: 'final',
    content: `Synthetisch: Eintrag ${String(nummer)}. Weiter üben.`,
    visit_without_treatment: false,
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
    finalized_at: '2026-11-02T10:05:00Z',
    finalisation_kind: 'manual',
    version_count: 1,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: 'Anna Beispiel',
    ...teil,
  };
}

function termin(
  nummer: number,
  notes: PatientTreatmentNotesEntry['notes'],
  tag = `2026-11-${String(30 - nummer).padStart(2, '0')}`,
): PatientTreatmentNotesEntry {
  return {
    appointment_id: `77777777-7777-4777-8777-0000000000${String(nummer).padStart(2, '0')}`,
    starts_at: `${tag}T09:00:00Z`,
    ends_at: `${tag}T09:45:00Z`,
    appointment_type: 'home_visit',
    appointment_status: 'completed',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
    notes,
  };
}

const SEITE = [
  termin(1, [
    eintrag(1),
    eintrag(11, { addendum_to_note_id: 'x', author_name: 'Jannes Beispiel' }),
  ]),
  termin(2, [eintrag(2, { status: 'draft' })]),
  termin(3, []),
  termin(4, [eintrag(4)]),
];

function rendern() {
  return renderWithProviders(<VerlaufInAuszuegen patientId={AKTE} hier={HIER} />, HIER);
}

describe('Verlauf in Auszügen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auszugVerfuegbar.mockResolvedValue(true);
    fetchPatientTreatmentNotesPage.mockResolvedValue(SEITE);
    auszuegeAnfragen.mockResolvedValue({
      ok: true,
      auszuege: [
        { id: eintrag(1).id, saetze: ['Synthetisch: Eintrag 1.', 'Weiter üben.'] },
        { id: eintrag(4).id, saetze: ['Weiter üben.'] },
      ],
      quelle: 'nachbildung',
    });
  });

  it('zeigt nichts, wenn der Gateway den Zweck nicht bedient', async () => {
    auszugVerfuegbar.mockResolvedValue(false);
    const { container } = rendern();
    await waitFor(() => expect(auszugVerfuegbar).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
  });

  it('liest die Einträge erst auf Verlangen', async () => {
    rendern();
    await screen.findByRole('button', { name: 'Auszüge zeigen' });
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
    expect(auszuegeAnfragen).not.toHaveBeenCalled();
  });

  it('schickt nur finalisierte Einträge mit Kennung und Wortlaut', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Auszüge zeigen' }));

    await screen.findByRole('list', { name: 'Auszüge je Eintrag' });
    expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledExactlyOnceWith(AKTE, null);
    const [auftrag] = auszuegeAnfragen.mock.calls[0] as [
      { akteId: string; eintraege: { id: string; text: string }[] },
    ];
    expect(auftrag.akteId).toBe(AKTE);
    expect(auftrag.eintraege.map((quelle) => quelle.id)).toEqual([
      eintrag(1).id,
      eintrag(11).id,
      eintrag(4).id,
    ]);
  });

  it('zeigt je Eintrag die Sätze im Wortlaut, mit Tag, Verfasser:in und dem Weg zum Eintrag', async () => {
    const nutzer = userEvent.setup();
    const { container } = rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Auszüge zeigen' }));

    const liste = await screen.findByRole('list', { name: 'Auszüge je Eintrag' });
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toHaveTextContent('29.11.');
    expect(zeilen[0]).toHaveTextContent('Synthetisch: Eintrag 1.');
    expect(zeilen[0]).toHaveTextContent('Weiter üben.');
    expect(zeilen[0]).toHaveTextContent('Anna Beispiel');
    expect(within(zeilen[0]!).getByRole('link')).toHaveAttribute(
      'href',
      `/termine/${termin(1, []).appointment_id}/abschluss?zurueck=${encodeURIComponent(HIER)}`,
    );
    expect(zeilen[1]).toHaveTextContent('26.11.');

    expect(screen.getByText(AUSZUG_NACHBILDUNG)).toBeInTheDocument();
    expect(screen.getByText(AUSZUG_RECHTSSATZ)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auszüge zeigen' })).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('kennzeichnet die Nachbildung nur, wenn sie es war', async () => {
    auszuegeAnfragen.mockResolvedValue({
      ok: true,
      auszuege: [{ id: eintrag(4).id, saetze: ['Weiter üben.'] }],
      quelle: 'anbieter',
    });
    const nutzer = userEvent.setup();
    rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Auszüge zeigen' }));
    await screen.findByRole('list', { name: 'Auszüge je Eintrag' });
    expect(screen.queryByText(AUSZUG_NACHBILDUNG)).not.toBeInTheDocument();
  });

  it('sagt es, wenn kein finalisierter Eintrag da ist, und fragt den Gateway nicht', async () => {
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      termin(2, [eintrag(2, { status: 'draft' })]),
    ]);
    const nutzer = userEvent.setup();
    rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Auszüge zeigen' }));
    expect(await screen.findByText(KEIN_EINTRAG)).toBeInTheDocument();
    expect(auszuegeAnfragen).not.toHaveBeenCalled();
  });

  it.each([
    ['die Einträge nicht geladen werden', 'laden', EINTRAEGE_NICHT_GELADEN],
    ['der Gateway ablehnt', 'gateway', 'Dafür fehlt hier die Berechtigung.'],
    ['kein Satz ausgewählt wurde', 'leer', KEIN_SATZ],
  ])('meldet es und lässt den Knopf stehen, wenn %s', async (_fall, art, text) => {
    if (art === 'laden') fetchPatientTreatmentNotesPage.mockRejectedValue(new Error('x'));
    if (art === 'gateway')
      auszuegeAnfragen.mockResolvedValue({ ok: false, fehler: 'forbidden', meldung: text });
    if (art === 'leer')
      auszuegeAnfragen.mockResolvedValue({ ok: true, auszuege: [], quelle: 'anbieter' });
    const nutzer = userEvent.setup();
    const { container } = rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Auszüge zeigen' }));

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auszüge zeigen' })).toBeEnabled();
    expect(screen.queryByRole('list', { name: 'Auszüge je Eintrag' })).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });
});

describe('quellenAus', () => {
  it('nimmt höchstens die letzten dokumentierten Termine, neueste zuerst', () => {
    const viele = Array.from({ length: AUSZUG_TERMINE + 3 }, (_wert, nummer) =>
      termin(nummer + 1, [eintrag(nummer + 1)]),
    );
    const quellen = quellenAus(viele, HIER);
    expect(quellen).toHaveLength(AUSZUG_TERMINE);
    expect(quellen[0]!.id).toBe(eintrag(1).id);
    expect(quellen.at(-1)!.id).toBe(eintrag(AUSZUG_TERMINE).id);
  });

  it('lässt Entwürfe, leere Einträge und Termine ohne Eintrag aus und zählt sie nicht mit', () => {
    const quellen = quellenAus(
      [...SEITE, termin(5, [eintrag(5, { content: '  ' })]), termin(6, [eintrag(6)])],
      HIER,
    );
    expect(quellen.map((quelle) => quelle.id)).toEqual([
      eintrag(1).id,
      eintrag(11).id,
      eintrag(4).id,
      eintrag(6).id,
    ]);
  });

  it('nennt den Nachtrag und den Tag in der Zeitzone der Praxis', () => {
    const [haupt, nachtrag] = quellenAus(
      [
        termin(
          1,
          [eintrag(1), eintrag(11, { addendum_to_note_id: 'x', author_name: null })],
          '2026-11-02',
        ),
      ],
      HIER,
    );
    expect(haupt).toMatchObject({ tag: '02.11.', meta: 'Anna Beispiel' });
    expect(nachtrag).toMatchObject({ tag: '02.11.', meta: 'Nachtrag' });

    const spaet = termin(2, [eintrag(2)]);
    expect(quellenAus([{ ...spaet, starts_at: '2026-11-02T23:30:00Z' }], HIER)[0]!.tag).toBe(
      '03.11.',
    );
  });
});
