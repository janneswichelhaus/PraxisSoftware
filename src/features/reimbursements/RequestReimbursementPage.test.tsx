import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as ReimbursementsApi from './api';
import { testOverview, testPreview, testReimbursement } from './testdata';

/**
 * Erstattung beantragen, geführt (G10, ERS-001, ORG-008): Ladestrom 5 Tipps
 * mit dem Einstieg (Ladestrom, Monat, Haken, Absenden) - Stunden und Betrag
 * rechnet der Server -, aus dem Vorschlag im Eingang 3; Einkauf 7 und der
 * Betrag (mit der Kamera der App: fotografieren, auslösen, verwenden). Ohne
 * Kamera im Prüfbrowser nimmt der Einkauf den Dateiwähler.
 */

const fetchReimbursements = vi.fn();
const previewElectricity = vi.fn();
const submitElectricity = vi.fn();
const previewTourDistance = vi.fn();
const recordTourDistance = vi.fn();
const submitPurchase = vi.fn();
const uploadReceipt = vi.fn();
const discardReceipt = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ReimbursementsApi>();
  return {
    ...actual,
    fetchReimbursements: (...a: unknown[]) => fetchReimbursements(...a) as unknown,
    previewElectricity: (...a: unknown[]) => previewElectricity(...a) as unknown,
    submitElectricity: (...a: unknown[]) => submitElectricity(...a) as unknown,
    previewTourDistance: (...a: unknown[]) => previewTourDistance(...a) as unknown,
    recordTourDistance: (...a: unknown[]) => recordTourDistance(...a) as unknown,
    submitPurchase: (...a: unknown[]) => submitPurchase(...a) as unknown,
    uploadReceipt: (...a: unknown[]) => uploadReceipt(...a) as unknown,
    discardReceipt: (...a: unknown[]) => discardReceipt(...a) as unknown,
  };
});

const { RequestReimbursementPage } = await import('./RequestReimbursementPage');

function Ziel() {
  const ort = useLocation();
  const zustand = ort.state as { meldung?: string } | null;
  return (
    <p>
      Ziel {ort.pathname}: {zustand?.meldung ?? ''}
    </p>
  );
}

function rendern(
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  adresse = '/betrieb/erstattungen/beantragen',
) {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/erstattungen/beantragen',
        element: <RequestReimbursementPage user={testUser(rollen)} />,
      },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: [adresse] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function datei(name = 'beleg.jpg', type = 'image/jpeg') {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, { type });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:beleg');
  URL.revokeObjectURL = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  fetchReimbursements.mockReset().mockResolvedValue(testOverview());
  previewElectricity.mockReset().mockResolvedValue(testPreview());
  submitElectricity
    .mockReset()
    .mockResolvedValue({ id: 'neu', status: 'requested', amount_cents: 639 });
  // Ohne Kartendienst (bis zum Gate, ADR-019 Punkt 9) gibt es keine
  // Kilometer: Es gilt der Wert je Stunde (BEF-181).
  previewTourDistance.mockReset().mockResolvedValue(null);
  recordTourDistance.mockReset().mockResolvedValue(null);
  submitPurchase
    .mockReset()
    .mockResolvedValue({ id: 'neu', status: 'requested', amount_cents: 1739 });
  uploadReceipt.mockReset().mockResolvedValue('beleg-neu');
  discardReceipt.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RequestReimbursementPage', () => {
  it('beantragt Ladestrom in vier Tipps - mit dem Einstieg fünf', async () => {
    const user = userEvent.setup();
    rendern();
    let tipps = 1; // „Erstattung beantragen“ auf der Übersicht
    const tippe = async (ziel: HTMLElement) => {
      tipps += 1;
      await user.click(ziel);
    };

    const art = await screen.findByRole('dialog', { name: 'Was erstatten?' });
    expect(within(art).getByText('Es entscheidet: Praxisinhaber.')).toBeInTheDocument();
    await tippe(within(art).getByRole('button', { name: 'Ladestrom für das Lastenrad' }));

    const monat = screen.getByRole('dialog', { name: 'Für welchen Monat?' });
    // Die zwölf abgeschlossenen Monate vor dem laufenden, der jüngste zuerst;
    // der jüngste freie ist die Antwort im Fuß (Design- und Praxis-Review).
    const kacheln = within(monat)
      .getAllByRole('group')
      .flatMap((jahr) => within(jahr).getAllByRole('button'));
    expect(kacheln).toHaveLength(12);
    expect(kacheln[0]).toHaveAccessibleName('Sept. 2026');
    await tippe(within(monat).getByRole('button', { name: 'September 2026' }));
    expect(previewElectricity).toHaveBeenCalledWith('2026-09-01');

    // Kein Schritt für die Stunden: Der Server rechnet, der Abschluss nennt die Rechnung.
    const abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(within(abschluss).getByText('Schritt 3 von 3')).toBeInTheDocument();
    expect(within(abschluss).getByText('September 2026')).toBeInTheDocument();
    expect(await within(abschluss).findByText('160 h Arbeitszeit')).toBeInTheDocument();
    expect(
      within(abschluss).getByText('160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByText('6,39 €')).toBeInTheDocument();
    expect(within(abschluss).getByText('Auszahlung auf DE89 •••• 3000')).toBeInTheDocument();
    expect(
      within(abschluss).getByText(
        'Im Depot lädt die Praxis selbst – dann gibt es nichts zu erstatten.',
      ),
    ).toBeInTheDocument();
    const absenden = within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' });
    // Ohne „zu Hause geladen“ nicht.
    expect(absenden).toBeDisabled();
    await tippe(within(abschluss).getByRole('checkbox'));
    await act(() => pruefeBarrierefreiheit(abschluss));
    await tippe(absenden);

    expect(submitElectricity).toHaveBeenCalledWith({
      month: '2026-09-01',
      declared: true,
      iban: null,
    });
    expect(
      await screen.findByText(
        'Ziel /betrieb/erstattungen: Ladestrom September 2026 beantragt: 6,39 €. Es entscheidet: Praxisinhaber.',
      ),
    ).toBeInTheDocument();
    expect(tipps).toBe(5);
  });

  it('rechnet mit den Kilometern der geplanten Touren und lässt den Server sie eintragen (BEF-181)', async () => {
    const user = userEvent.setup();
    previewTourDistance.mockResolvedValue({ km: 412, source: 'anbieter' });
    recordTourDistance.mockResolvedValue({ km: 410, amountCents: 273 });
    rendern(['therapist'], '/betrieb/erstattungen/beantragen?monat=2026-09-01');

    const abschluss = await screen.findByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(previewTourDistance).toHaveBeenCalledWith('2026-09-01');
    expect(await within(abschluss).findByText('412 km geplante Touren')).toBeInTheDocument();
    expect(within(abschluss).getByText('Summe der Routen je Tag')).toBeInTheDocument();
    expect(within(abschluss).getByText('412 km × 18 Wh/km × 0,37 €/kWh')).toBeInTheDocument();
    // 412 × 18 × 37 / 1000 = 274,392 ct.
    expect(within(abschluss).getByText('2,74 €')).toBeInTheDocument();
    expect(within(abschluss).queryByText('160 h Arbeitszeit')).not.toBeInTheDocument();

    await user.click(within(abschluss).getByRole('checkbox'));
    await user.click(within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' }));

    expect(recordTourDistance).toHaveBeenCalledWith('2026-09-01', 'neu');
    // Die Meldung nennt, was der Server eingetragen hat.
    expect(
      await screen.findByText(/Ladestrom September 2026 beantragt: 2,73 €\./),
    ).toBeInTheDocument();
  });

  it('nennt die Nachbildung, wenn kein Kartendienst gerechnet hat', async () => {
    previewTourDistance.mockResolvedValue({ km: 12, source: 'nachbildung' });
    rendern(['therapist'], '/betrieb/erstattungen/beantragen?monat=2026-09-01');
    const abschluss = await screen.findByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(
      await within(abschluss).findByText('Summe der Routen je Tag · Nachbildung ohne Kartendienst'),
    ).toBeInTheDocument();
  });

  it('bleibt beim Betrag nach Stunden, wenn der Server nichts einträgt', async () => {
    const user = userEvent.setup();
    previewTourDistance.mockResolvedValue({ km: 412, source: 'anbieter' });
    rendern(['therapist'], '/betrieb/erstattungen/beantragen?monat=2026-09-01');
    const abschluss = await screen.findByRole('dialog', { name: 'Ladestrom beantragen?' });
    await user.click(await within(abschluss).findByRole('checkbox'));
    await user.click(within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' }));
    expect(
      await screen.findByText(/Ladestrom September 2026 beantragt: 6,39 €\./),
    ).toBeInTheDocument();
  });

  it('beginnt aus dem Vorschlag im Eingang an der Zusammenfassung - drei Tipps (ORG-008)', async () => {
    const user = userEvent.setup();
    rendern(['therapist'], '/betrieb/erstattungen/beantragen?monat=2026-08-01&zurueck=%2Fbetrieb');
    let tipps = 1; // „Beantragen“ im Eingang
    const abschluss = await screen.findByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(within(abschluss).getByText('August 2026')).toBeInTheDocument();
    expect(previewElectricity).toHaveBeenCalledWith('2026-08-01');
    tipps += 1;
    await user.click(await within(abschluss).findByRole('checkbox'));
    tipps += 1;
    await user.click(within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' }));
    expect(submitElectricity).toHaveBeenCalledWith({
      month: '2026-08-01',
      declared: true,
      iban: null,
    });
    expect(
      await screen.findByText(/^Ziel \/betrieb: Ladestrom August 2026 beantragt/),
    ).toBeInTheDocument();
    expect(tipps).toBe(3);
  });

  it('führt aus dem Vorschlag mit „Zurück“ zur Wahl des Monats', async () => {
    const user = userEvent.setup();
    rendern(['therapist'], '/betrieb/erstattungen/beantragen?monat=2026-08-01');
    await screen.findByRole('dialog', { name: 'Ladestrom beantragen?' });
    await user.click(screen.getByRole('button', { name: /Zurück/ }));
    expect(screen.getByRole('dialog', { name: 'Für welchen Monat?' })).toBeInTheDocument();
  });

  it.each([
    ['schon beantragt', '2026-09-01'],
    ['der laufende', '2026-10-01'],
    ['kein Monatserster', '2026-09-15'],
  ])('nimmt einen Monat aus der Adresse nicht an: %s', async (_, monat) => {
    fetchReimbursements.mockResolvedValue(
      testOverview({
        person: {
          ...testOverview().person!,
          reimbursements: [testReimbursement({ period_month: '2026-09-01', status: 'approved' })],
        },
      }),
    );
    rendern(['therapist'], `/betrieb/erstattungen/beantragen?monat=${monat}`);
    expect(await screen.findByRole('dialog', { name: 'Was erstatten?' })).toBeInTheDocument();
    expect(previewElectricity).not.toHaveBeenCalled();
  });

  it('sagt, wenn im Monat keine Arbeitsstunden geplant sind - Absenden bleibt gesperrt', async () => {
    const user = userEvent.setup();
    previewElectricity.mockResolvedValue(testPreview({ working_minutes: 0, amount_cents: 0 }));
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    await user.click(screen.getByRole('button', { name: 'Sept. 2026' }));
    const abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(
      await within(abschluss).findByText(
        'In diesem Monat sind keine Arbeitsstunden geplant – es gibt nichts zu erstatten.',
      ),
    ).toBeInTheDocument();
    expect(within(abschluss).queryByRole('checkbox')).toBeNull();
    expect(within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' })).toBeDisabled();
  });

  it('sperrt einen Monat, für den schon Ladestrom beantragt ist', async () => {
    const user = userEvent.setup();
    fetchReimbursements.mockResolvedValue(
      testOverview({
        person: {
          staff_member_id: testOverview().person!.staff_member_id,
          name: 'Anna Beispiel',
          account: testOverview().person!.account,
          reimbursements: [testReimbursement({ period_month: '2026-09-01', status: 'approved' })],
        },
      }),
    );
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    const kachel = screen.getByRole('button', { name: 'Sept. 2026, schon beantragt' });
    expect(kachel).toBeDisabled();
    expect(kachel).toHaveTextContent('✓ beantragt');
  });

  it('fragt ohne hinterlegte IBAN nach dem Konto und prüft die Prüfziffer', async () => {
    const user = userEvent.setup();
    fetchReimbursements.mockResolvedValue(
      testOverview({
        person: { ...testOverview().person!, account: null },
      }),
    );
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    await user.click(screen.getByRole('button', { name: 'Sept. 2026' }));

    const konto = screen.getByRole('dialog', { name: 'Auf welches Konto?' });
    expect(within(konto).getByText('Schritt 3 von 4')).toBeInTheDocument();
    const feld = within(konto).getByLabelText('IBAN');
    await user.type(feld, 'DE89 3704 0044 0532 0130 01');
    fireEvent.blur(feld);
    expect(
      within(konto).getByText('Die IBAN stimmt nicht – bitte die Ziffern prüfen.'),
    ).toBeInTheDocument();
    expect(within(konto).getByRole('button', { name: 'Weiter' })).toBeDisabled();
    await user.clear(feld);
    await user.type(feld, 'de89 3704 0044 0532 0130 00');
    await user.click(within(konto).getByRole('button', { name: 'Weiter' }));

    const abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(within(abschluss).getByText('Auszahlung auf DE89 •••• 3000')).toBeInTheDocument();
    await user.click(await within(abschluss).findByRole('checkbox'));
    await user.click(within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' }));
    expect(submitElectricity).toHaveBeenCalledWith({
      month: '2026-09-01',
      declared: true,
      iban: 'DE89370400440532013000',
    });
  });

  it('bietet im Funkloch beim Rechnen einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    previewElectricity.mockRejectedValueOnce(
      new Error('Die Arbeitsstunden konnten nicht gezählt werden.'),
    );
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    await user.click(screen.getByRole('button', { name: 'Sept. 2026' }));
    const abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(
      await within(abschluss).findByText('Die Arbeitsstunden konnten nicht gezählt werden.'),
    ).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await within(abschluss).findByText('6,39 €')).toBeInTheDocument();
  });

  it('beantragt einen Einkauf mit zwei Belegen - Betrag und Zweck je Beleg', async () => {
    const user = userEvent.setup();
    uploadReceipt.mockResolvedValueOnce('beleg-a').mockResolvedValueOnce('beleg-b');
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));

    const beleg = screen.getByRole('dialog', { name: 'Beleg?' });
    // Ohne Kamera im Prüfbrowser: der Dateiwähler (auch für PDF-Rechnungen).
    await user.upload(within(beleg).getByLabelText('Beleg wählen'), datei());
    expect(uploadReceipt).toHaveBeenCalledTimes(1);

    const posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    expect(
      within(posten).getByRole('img', { name: 'Der fotografierte Beleg' }),
    ).toBeInTheDocument();
    await user.type(within(posten).getByLabelText('Betrag in €'), '12,90');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Massageöl');
    await user.click(await within(posten).findByRole('button', { name: 'Weiter' }));

    let abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    expect(within(abschluss).getByText('Massageöl')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Weiterer Beleg' }));
    const zweiter = screen.getByRole('dialog', { name: 'Weiterer Beleg?' });
    await user.upload(
      within(zweiter).getByLabelText('Beleg wählen'),
      datei('rechnung.pdf', 'application/pdf'),
    );
    const posten2 = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    expect(within(posten2).getByText('PDF ausgewählt.')).toBeInTheDocument();
    await user.type(within(posten2).getByLabelText('Betrag in €'), '4,49');
    await user.type(within(posten2).getByLabelText('Wofür?'), 'Tape');
    await user.click(await within(posten2).findByRole('button', { name: 'Weiter' }));

    abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    expect(within(abschluss).getByText('Summe')).toBeInTheDocument();
    expect(within(abschluss).getByText('17,39 €')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Einkauf beantragen' }));
    expect(submitPurchase).toHaveBeenCalledWith({
      items: [
        { receiptId: 'beleg-a', amountCents: 1290, purpose: 'Massageöl' },
        { receiptId: 'beleg-b', amountCents: 449, purpose: 'Tape' },
      ],
      iban: null,
    });
    expect(
      await screen.findByText(
        'Ziel /betrieb/erstattungen: Einkauf beantragt: 17,39 €. Es entscheidet: Praxisinhaber.',
      ),
    ).toBeInTheDocument();
  });

  it('verwirft einen entfernten Beleg am Server', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));
    await user.upload(screen.getByLabelText('Beleg wählen'), datei());
    const posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    await user.type(within(posten).getByLabelText('Betrag in €'), '5');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Tape');
    await user.click(await within(posten).findByRole('button', { name: 'Weiter' }));
    const abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    // Leise und mit Rückfrage (Design- und Praxis-Review Überholung 10).
    await user.click(within(abschluss).getByRole('button', { name: 'Entfernen – Tape' }));
    expect(discardReceipt).not.toHaveBeenCalled();
    await user.click(within(abschluss).getByRole('button', { name: 'Ja, entfernen' }));
    expect(discardReceipt).toHaveBeenCalledWith('beleg-neu');
    expect(within(abschluss).getByRole('button', { name: 'Einkauf beantragen' })).toBeDisabled();
  });

  it('verwirft einen Beleg, der während seiner Übertragung entfernt wurde (Zweitreview)', async () => {
    const user = userEvent.setup();
    let fertig: (id: string) => void = () => undefined;
    uploadReceipt
      .mockResolvedValueOnce('beleg-neu')
      .mockImplementationOnce(() => new Promise<string>((resolve) => (fertig = resolve)));
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));
    await user.upload(screen.getByLabelText('Beleg wählen'), datei());
    const posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    await user.type(within(posten).getByLabelText('Betrag in €'), '5');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Tape');
    await user.click(await within(posten).findByRole('button', { name: 'Weiter' }));
    // Ein zweiter Beleg, noch in der Übertragung - zurück zur Zusammenfassung.
    await user.click(
      within(screen.getByRole('dialog', { name: 'Einkauf beantragen?' })).getByRole('button', {
        name: 'Weiterer Beleg',
      }),
    );
    await user.upload(screen.getByLabelText('Beleg wählen'), datei('zwei.jpg'));
    await user.click(screen.getByRole('button', { name: /Zurück/ }));
    await user.click(screen.getByRole('button', { name: /Zurück/ }));
    const abschluss = await screen.findByRole('dialog', { name: 'Einkauf beantragen?' });
    expect(within(abschluss).getByText('wird übertragen …')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Entfernen – Beleg' }));
    await user.click(within(abschluss).getByRole('button', { name: 'Ja, entfernen' }));
    expect(discardReceipt).not.toHaveBeenCalled();
    await act(() => Promise.resolve(fertig('beleg-spaet')));
    expect(discardReceipt).toHaveBeenCalledWith('beleg-spaet');
    expect(within(abschluss).queryByText('wird übertragen …')).toBeNull();
  });

  it('nennt einen gescheiterten Upload und überträgt erneut', async () => {
    const user = userEvent.setup();
    uploadReceipt
      .mockRejectedValueOnce(new Error('Der Beleg konnte nicht übertragen werden.'))
      .mockResolvedValueOnce('beleg-zwei');
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));
    await user.upload(screen.getByLabelText('Beleg wählen'), datei());
    const posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    expect(
      await within(posten).findByText('Der Beleg konnte nicht übertragen werden.'),
    ).toBeInTheDocument();
    await user.click(within(posten).getByRole('button', { name: 'Erneut übertragen' }));
    expect(uploadReceipt).toHaveBeenCalledTimes(2);
    await user.type(within(posten).getByLabelText('Betrag in €'), '5');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Tape');
    expect(await within(posten).findByRole('button', { name: 'Weiter' })).toBeEnabled();
  });

  it('ändert im Abschluss den Monat - die Erklärung gilt dem neuen Monat neu (Design-Review)', async () => {
    const user = userEvent.setup();
    previewElectricity.mockImplementation((month: string) =>
      Promise.resolve(
        month === '2026-08-01'
          ? testPreview({ month, working_minutes: 7_200, amount_cents: 479 })
          : testPreview({ month }),
      ),
    );
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    await user.click(screen.getByRole('button', { name: 'September 2026' }));
    let abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    await user.click(await within(abschluss).findByRole('checkbox'));

    await user.click(within(abschluss).getByRole('button', { name: 'Ändern: Monat' }));
    await user.click(screen.getByRole('button', { name: 'Aug. 2026' }));

    abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(within(abschluss).getByText('August 2026')).toBeInTheDocument();
    expect(await within(abschluss).findByText('120 h Arbeitszeit')).toBeInTheDocument();
    expect(within(abschluss).getByText('4,79 €')).toBeInTheDocument();
    expect(within(abschluss).getByRole('checkbox')).not.toBeChecked();
    expect(within(abschluss).getByRole('button', { name: 'Ladestrom beantragen' })).toBeDisabled();
  });

  it('kehrt beim selben Monat ohne Umweg in den Abschluss zurück', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    await user.click(screen.getByRole('button', { name: 'September 2026' }));
    const abschluss = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    await user.click(await within(abschluss).findByRole('checkbox'));
    await user.click(within(abschluss).getByRole('button', { name: 'Ändern: Monat' }));
    await user.click(screen.getByRole('button', { name: 'Sept. 2026' }));
    const wieder = screen.getByRole('dialog', { name: 'Ladestrom beantragen?' });
    expect(within(wieder).getByRole('checkbox')).toBeChecked();
  });

  it('ändert Betrag und Zweck eines Belegs aus dem Abschluss (Design-Review)', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));
    await user.upload(screen.getByLabelText('Beleg wählen'), datei());
    let posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    await user.type(within(posten).getByLabelText('Betrag in €'), '5');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Tape');
    await user.click(within(posten).getByRole('button', { name: 'Weiter' }));

    let abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    await user.click(within(abschluss).getByRole('button', { name: 'Ändern: Tape' }));
    posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    expect(within(posten).getByLabelText('Wofür?')).toHaveValue('Tape');
    await user.clear(within(posten).getByLabelText('Betrag in €'));
    await user.type(within(posten).getByLabelText('Betrag in €'), '6,50');
    await user.click(within(posten).getByRole('button', { name: 'Weiter' }));

    abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    expect(within(abschluss).getByText('6,50 €')).toBeInTheDocument();
    await user.click(within(abschluss).getByRole('button', { name: 'Einkauf beantragen' }));
    expect(submitPurchase).toHaveBeenCalledWith({
      items: [{ receiptId: 'beleg-neu', amountCents: 650, purpose: 'Tape' }],
      iban: null,
    });
  });

  it('geht im Funkloch schon weiter - nur das Absenden wartet auf den Beleg (Praxis-Review)', async () => {
    const user = userEvent.setup();
    let fertig: (id: string) => void = () => undefined;
    uploadReceipt.mockImplementationOnce(
      () => new Promise<string>((resolve) => (fertig = resolve)),
    );
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));
    await user.upload(screen.getByLabelText('Beleg wählen'), datei());
    const posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    await user.type(within(posten).getByLabelText('Betrag in €'), '5');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Tape');
    await user.click(within(posten).getByRole('button', { name: 'Weiter' }));

    const abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    expect(within(abschluss).getByText('wird übertragen …')).toBeInTheDocument();
    expect(
      within(abschluss).getByRole('button', { name: 'Beleg wird übertragen …' }),
    ).toBeDisabled();
    await act(() => Promise.resolve(fertig('beleg-spaet')));
    await user.click(within(abschluss).getByRole('button', { name: 'Einkauf beantragen' }));
    expect(submitPurchase).toHaveBeenCalledWith({
      items: [{ receiptId: 'beleg-spaet', amountCents: 500, purpose: 'Tape' }],
      iban: null,
    });
  });

  it('nennt einen gescheiterten Beleg im Abschluss und überträgt ihn dort erneut', async () => {
    const user = userEvent.setup();
    let scheitern: (fehler: Error) => void = () => undefined;
    uploadReceipt
      .mockImplementationOnce(() => new Promise<string>((_, reject) => (scheitern = reject)))
      .mockResolvedValueOnce('beleg-zwei');
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Einkauf mit Beleg' }));
    await user.upload(screen.getByLabelText('Beleg wählen'), datei());
    const posten = screen.getByRole('dialog', { name: 'Wie viel und wofür?' });
    await user.type(within(posten).getByLabelText('Betrag in €'), '5');
    await user.type(within(posten).getByLabelText('Wofür?'), 'Tape');
    await user.click(within(posten).getByRole('button', { name: 'Weiter' }));
    await act(() =>
      Promise.resolve(scheitern(new Error('Der Beleg konnte nicht übertragen werden.'))),
    );

    const abschluss = screen.getByRole('dialog', { name: 'Einkauf beantragen?' });
    expect(within(abschluss).getByText('Nicht übertragen')).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Einkauf beantragen' })).toBeDisabled();
    await user.click(within(abschluss).getByRole('button', { name: 'Erneut übertragen' }));
    expect(uploadReceipt).toHaveBeenCalledTimes(2);
    expect(
      await within(abschluss).findByRole('button', { name: 'Einkauf beantragen' }),
    ).toBeEnabled();
    expect(within(abschluss).queryByText('Nicht übertragen')).toBeNull();
  });

  it('lässt owner eintragen - es gilt als genehmigt', async () => {
    const user = userEvent.setup();
    fetchReimbursements.mockResolvedValue(testOverview({ can_decide: true, can_read_all: true }));
    submitElectricity.mockResolvedValue({ id: 'neu', status: 'approved', amount_cents: 639 });
    rendern(['owner']);
    expect(
      await screen.findByText('Sie tragen selbst ein; es gilt sofort als genehmigt.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ladestrom für das Lastenrad' }));
    await user.click(screen.getByRole('button', { name: 'Sept. 2026' }));
    const abschluss = screen.getByRole('dialog', { name: 'Ladestrom eintragen?' });
    await user.click(await within(abschluss).findByRole('checkbox'));
    await user.click(within(abschluss).getByRole('button', { name: 'Ladestrom eintragen' }));
    expect(
      await screen.findByText(
        'Ziel /betrieb/erstattungen: Ladestrom September 2026 eingetragen: 6,39 €. Er gilt als genehmigt.',
      ),
    ).toBeInTheDocument();
  });
});
