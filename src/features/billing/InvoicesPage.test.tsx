import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { todayInTimeZone } from '@/features/appointments/api';
import { zeigeMitRouten } from './testumgebung';

const fetchKandidaten = vi.fn();
const fetchRechnungen = vi.fn();
const fetchOffenePosten = vi.fn();
const createEntwurf = vi.fn();
const erstelleKorrektur = vi.fn();
const bucheZahlung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchKandidaten: () => fetchKandidaten() as Promise<BillingApi.Kandidat[]>,
    fetchRechnungen: (...args: unknown[]) =>
      fetchRechnungen(...args) as Promise<BillingApi.Rechnung[]>,
    fetchOffenePosten: () => fetchOffenePosten() as Promise<BillingApi.OffenerPosten[]>,
    createEntwurf: (...args: unknown[]) => createEntwurf(...args) as Promise<string>,
    erstelleKorrektur: (id: string) => erstelleKorrektur(id) as Promise<string>,
    bucheZahlung: (...args: unknown[]) => bucheZahlung(...args) as Promise<void>,
  };
});

const { InvoicesPage } = await import('./InvoicesPage');

function kandidat(rest: Partial<BillingApi.Kandidat> = {}): BillingApi.Kandidat {
  return {
    patient_id: 'p1',
    training_relationship_id: null,
    patient_name: 'Erika Beispiel',
    period_month: '2026-08-01',
    service_area: 'therapy',
    service_count: 3,
    total_cents: 13_500,
    currency: 'EUR',
    has_draft: false,
    draft_id: null,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
    first_performed_on: null,
    last_performed_on: null,
    cancelled_invoice_id: null,
    cancelled_invoice_number: null,
    draft_replaces_invoice_number: null,
    ...rest,
  };
}

function rechnung(rest: Partial<BillingApi.Rechnung> = {}): BillingApi.Rechnung {
  return {
    id: 'r1',
    status: 'issued',
    invoice_number: 'RG-2026-0001',
    period_month: '2026-08-01',
    service_area: 'therapy',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    patient_id: 'p1',
    training_relationship_id: null,
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    recipient_kind: 'self',
    total_cents: 13_500,
    currency: 'EUR',
    item_count: 3,
    paid_cents: 0,
    outstanding_cents: 13_500,
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
    total_count: 1,
    ...rest,
  };
}

function posten(rest: Partial<BillingApi.OffenerPosten> = {}): BillingApi.OffenerPosten {
  return {
    id: 'r1',
    invoice_number: 'RG-2026-0001',
    patient_id: 'p1',
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    period_month: '2026-08-01',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    total_cents: 13_500,
    paid_cents: 0,
    outstanding_cents: 13_500,
    currency: 'EUR',
    overdue: false,
    open_total_cents: 13_500,
    total_count: 1,
    ...rest,
  };
}

describe('InvoicesPage', () => {
  beforeEach(() => {
    fetchKandidaten.mockReset();
    erstelleKorrektur.mockReset();
    fetchRechnungen.mockReset();
    fetchOffenePosten.mockReset();
    createEntwurf.mockReset();
    bucheZahlung.mockReset();
    fetchKandidaten.mockResolvedValue([]);
    fetchRechnungen.mockResolvedValue([]);
    fetchOffenePosten.mockResolvedValue([]);
    bucheZahlung.mockResolvedValue(undefined);
  });

  it('buendelt Abzurechnendes nach Person und Monat', async () => {
    fetchKandidaten.mockResolvedValue([kandidat()]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByText('August 2026')).toBeInTheDocument();
    expect(screen.getByText(/3 Leistungen · 135,00 €/)).toBeInTheDocument();
    // ABR-009: Der Bereich ist der dritte Schlüssel der Klammer.
    expect(screen.getByText('Behandlung')).toBeInTheDocument();
  });

  it('fuehrt beide Bereiche derselben Person als getrennte Zeilen (ABR-009)', async () => {
    const nutzer = userEvent.setup();
    fetchKandidaten.mockResolvedValue([
      kandidat(),
      // Seit TRN-008 hängt die Trainingszeile am Trainingsverhältnis, nicht an
      // der Akte - auch bei derselben Person (ADR-021 Punkt 3).
      kandidat({
        patient_id: null,
        training_relationship_id: 'v1',
        service_area: 'training',
        service_count: 1,
        total_cents: 7_500,
      }),
    ]);
    createEntwurf.mockResolvedValue('neu-2');

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('Behandlung')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();

    // Zwei Zeilen, zwei Entwürfe: Eine Person mit beiden Verhältnissen bekommt
    // in einem Monat zwei Rechnungen (ADR-009, Konsequenz zu Punkt 16).
    const knoepfe = screen.getAllByRole('button', { name: 'Entwurf anlegen' });
    expect(knoepfe).toHaveLength(2);
    await nutzer.click(knoepfe[1]!);
    expect(createEntwurf).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: null,
        training_relationship_id: 'v1',
        period_month: '2026-08-01',
        service_area: 'training',
      }),
    );
  });

  it('legt einen Entwurf fuer genau diesen Monat und Bereich an', async () => {
    const nutzer = userEvent.setup();
    fetchKandidaten.mockResolvedValue([kandidat()]);
    createEntwurf.mockResolvedValue('neu-1');

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    await nutzer.click(await screen.findByRole('button', { name: 'Entwurf anlegen' }));

    expect(createEntwurf).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 'p1',
        training_relationship_id: null,
        period_month: '2026-08-01',
        service_area: 'therapy',
      }),
    );
  });

  it('buendelt nach Verordnung und legt den Entwurf fuer sie an (ABR-032)', async () => {
    const nutzer = userEvent.setup();
    fetchKandidaten.mockResolvedValue([
      kandidat({
        treatment_basis_id: 'g1',
        basis_kind: 'follow_up',
        basis_issued_on: '2026-07-15',
        first_performed_on: '2026-07-22',
        last_performed_on: '2026-08-27',
      }),
    ]);
    createEntwurf.mockResolvedValue('neu-2');

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('Folgeverordnung vom 15.07.2026')).toBeInTheDocument();
    expect(screen.getByText('22.07.2026 bis 27.08.2026')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf anlegen' }));
    expect(createEntwurf).toHaveBeenCalledWith(
      expect.objectContaining({ treatment_basis_id: 'g1' }),
    );
  });

  it('nennt an der Rechnung ihre Verordnung statt des Monats (ABR-032)', async () => {
    fetchRechnungen.mockResolvedValue([
      rechnung({ basis_kind: 'first', basis_issued_on: '2026-07-15', treatment_basis_id: 'g1' }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(
      await screen.findByText(/Erstverordnung vom 15.07.2026 · Behandlung/),
    ).toBeInTheDocument();
  });

  it('führt nach einem Storno nur über die Korrekturrechnung weiter (BEF-062)', async () => {
    const nutzer = userEvent.setup();
    fetchKandidaten.mockResolvedValue([
      kandidat({ cancelled_invoice_id: 'alt-1', cancelled_invoice_number: 'RG-2026-0007' }),
    ]);
    erstelleKorrektur.mockResolvedValue('neu-3');

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    // Die Herkunft steht an der Zeile, mit dem Weg zur stornierten Rechnung.
    const link = await screen.findByRole('link', { name: 'RG-2026-0007' });
    expect(link).toHaveAttribute('href', '/abrechnung/rechnungen/alt-1');
    expect(screen.getByText(/wird ihre Korrekturrechnung/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf anlegen' })).not.toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Korrekturrechnung erstellen' }));
    expect(erstelleKorrektur).toHaveBeenCalledWith('alt-1');
    expect(createEntwurf).not.toHaveBeenCalled();
  });

  it('sagt ehrlich, wenn ein Entwurf ohne Bezug im Weg steht (BEF-062)', async () => {
    fetchKandidaten.mockResolvedValue([
      kandidat({
        cancelled_invoice_id: 'alt-1',
        cancelled_invoice_number: 'RG-2026-0007',
        draft_replaces_invoice_number: null,
        has_draft: true,
        draft_id: 'e1',
      }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(
      await screen.findByText(/Entwurf ohne Bezug zur stornierten Rechnung/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Entwurf' })).toHaveAttribute(
      'href',
      '/abrechnung/rechnungen/e1',
    );
    expect(
      screen.queryByRole('button', { name: 'Korrekturrechnung erstellen' }),
    ).not.toBeInTheDocument();
  });

  it('nennt die wartende Korrektur, wenn zwei Stornos in einer Klammer liegen (ANN-321)', async () => {
    fetchKandidaten.mockResolvedValue([
      kandidat({
        cancelled_invoice_id: 'alt-1',
        cancelled_invoice_number: 'RG-2026-0007',
        has_draft: true,
        draft_id: 'k2',
        draft_replaces_invoice_number: 'RG-2026-0008',
      }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(
      await screen.findByText(
        'Für diesen Zeitraum steht die Korrektur zu RG-2026-0008 als Entwurf. Ist sie ausgestellt, lässt sich hier die Korrekturrechnung zu RG-2026-0007 erstellen.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ohne Bezug/)).not.toBeInTheDocument();
  });

  it('hängt an einen Hinweis mit eigenem Weg keinen Satz zur Verbindung (UX-008b)', async () => {
    const nutzer = userEvent.setup();
    const { WegHinweis } = await import('./api');
    fetchKandidaten.mockResolvedValue([kandidat()]);
    createEntwurf.mockRejectedValue(new WegHinweis('Bitte die Liste neu laden.'));

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');
    await nutzer.click(await screen.findByRole('button', { name: 'Entwurf anlegen' }));

    expect(await screen.findByText('Bitte die Liste neu laden.')).toBeInTheDocument();
    expect(screen.queryByText(/Verbindung prüfen/)).not.toBeInTheDocument();
  });

  it('bietet keinen zweiten Entwurf fuer denselben Monat an', async () => {
    fetchKandidaten.mockResolvedValue([kandidat({ has_draft: true })]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText(/bereits ein Entwurf/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf anlegen' })).not.toBeInTheDocument();
  });

  it('zeigt der Therapeutin keine Schaltflaeche zum Anlegen (ANN-076)', async () => {
    fetchKandidaten.mockResolvedValue([kandidat()]);

    renderWithProviders(<InvoicesPage user={testUser(['therapist'])} />, '/abrechnung');

    expect(await screen.findByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf anlegen' })).not.toBeInTheDocument();
  });

  it('nennt den Entwurf ohne Nummer und die ausgestellte Rechnung mit', async () => {
    fetchRechnungen.mockResolvedValue([
      rechnung(),
      rechnung({
        id: 'r2',
        status: 'draft',
        invoice_number: null,
        issued_on: null,
        due_on: null,
      }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    // Die Nummer ist der Link zur Rechnung (UX-005i); „Ausgestellt" ist der
    // Regelfall und trägt kein Etikett mehr.
    expect(
      await screen.findByRole('link', { name: 'Rechnung RG-2026-0001 ansehen' }),
    ).toHaveAttribute('href', '/abrechnung/rechnungen/r1');
    expect(screen.getByRole('link', { name: 'Entwurf ohne Nummer öffnen' })).toHaveTextContent(
      'Ohne Nummer',
    );
    expect(screen.queryByText('Ausgestellt')).toBeNull();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Rechnung ansehen' })).toBeNull();
  });

  it('nennt einen fremden Empfaenger mit seiner Art', async () => {
    fetchRechnungen.mockResolvedValue([
      rechnung({ recipient_kind: 'guardian', recipient_name: 'Betreuungsbuero Fiktiv GmbH' }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(
      await screen.findByText(/Betreuungsbuero Fiktiv GmbH \(Betreuung\)/),
    ).toBeInTheDocument();
  });

  describe('Offene Posten (ABR-004)', () => {
    it('stehen ohne einen einzigen Tap auf der Seite, mit ihrer Summe', async () => {
      // OPTIMIERUNG.md: "Offene Posten sehen: 0 Taps auf der Einstiegsseite".
      fetchOffenePosten.mockResolvedValue([
        posten({ outstanding_cents: 4500, open_total_cents: 9000, total_count: 2 }),
        posten({
          id: 'r2',
          invoice_number: 'RG-2026-0002',
          outstanding_cents: 4500,
          open_total_cents: 9000,
          total_count: 2,
        }),
      ]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
      expect(screen.getByText(/2 Rechnungen · 90,00 € offen/)).toBeInTheDocument();
    });

    it('nimmt die Summe vom Server und addiert die Zeilen nicht selbst', async () => {
      // Die Liste ist gekuerzt, die Summe gilt trotzdem fuer alle offenen
      // Posten - deshalb steht sie an der Zeile und wird nicht gerechnet.
      fetchOffenePosten.mockResolvedValue([
        posten({ outstanding_cents: 4500, open_total_cents: 120_000 }),
      ]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText(/1\.200,00 € offen/)).toBeInTheDocument();
    });

    it('kennzeichnet eine ueberfaellige Rechnung', async () => {
      fetchOffenePosten.mockResolvedValue([posten({ overdue: true })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText('Überfällig')).toBeInTheDocument();
    });

    it('bucht eine Zahlung mit dem offenen Betrag als Vorbelegung', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      expect(screen.getByLabelText('Betrag')).toHaveValue('45,00');

      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(bucheZahlung).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'r1', betragCent: 4500, richtung: 'incoming' }),
      );
    });

    it('nimmt eine Teilzahlung im selben Formular entgegen', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      await nutzer.clear(screen.getByLabelText('Betrag'));
      await nutzer.type(screen.getByLabelText('Betrag'), '20,00');
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(bucheZahlung).toHaveBeenCalledWith(expect.objectContaining({ betragCent: 2000 }));
    });

    it('bietet der Therapeutin kein Buchen an (ANN-076)', async () => {
      fetchOffenePosten.mockResolvedValue([posten()]);

      renderWithProviders(<InvoicesPage user={testUser(['therapist'])} />, '/abrechnung');

      expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zahlung buchen' })).not.toBeInTheDocument();
    });
  });

  it('kennzeichnet eine stornierte Rechnung und nennt keinen Zahlungsstand mehr', async () => {
    // Storniert steht neben dem Zustand, nicht an seiner Stelle: ausgestellt
    // ist sie gewesen (ABR-003c, ANN-079).
    fetchKandidaten.mockResolvedValue([]);
    fetchRechnungen.mockResolvedValue([rechnung({ cancelled: true })]);
    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('Storniert')).toBeInTheDocument();
    expect(screen.getByText('RG-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('Offen')).toBeNull();
  });

  it('führt vom Monat mit Entwurf zu diesem Entwurf (BEF-018)', async () => {
    fetchKandidaten.mockResolvedValue([kandidat({ has_draft: true, draft_id: 'r7' })]);
    fetchRechnungen.mockResolvedValue([]);
    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByRole('link', { name: 'Zum Entwurf' })).toHaveAttribute(
      'href',
      '/abrechnung/rechnungen/r7',
    );
  });

  describe('UXR-010', () => {
    it('meldet die Buchung am Posten und setzt den Fokus dorthin (ABR-10)', async () => {
      // Das Formular schließt nach der Buchung, ein bezahlter Posten
      // verschwindet ganz. Die Meldung steht über der Liste und hat den Fokus.
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      const meldung = await screen.findByText('45,00 € zu RG-2026-0001 gebucht.');
      expect(meldung).toHaveAttribute('role', 'status');
      await waitFor(() => expect(meldung.parentElement).toHaveFocus());
      // Das Formular ist zu; der Knopf an der Karte heißt wieder wie vorher.
      expect(screen.queryByLabelText('Betrag')).toBeNull();
    });

    it('lädt nach der Buchung auch die Rechnung neu (ABR-01)', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      const { client } = zeigeMitRouten(
        [{ path: '/abrechnung', element: <InvoicesPage user={testUser(['office'])} /> }],
        '/abrechnung',
      );
      const neuLaden = vi.spyOn(client, 'invalidateQueries');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      await waitFor(() => expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['rechnung', 'r1'] }));
      // Der Aufruf bleibt derselbe wie vorher.
      expect(bucheZahlung).toHaveBeenCalledWith({
        invoiceId: 'r1',
        betragCent: 4500,
        tag: expect.any(String) as string,
        weg: 'bank_transfer',
        richtung: 'incoming',
        notiz: null,
      });
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['offene-posten'] });
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['rechnungszahlungen', 'r1'] });
    });

    it('schreibt einen Datumsfehler an das Datum, nicht an den Betrag (ABR-09, ZST-11)', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      const datum = screen.getByLabelText('Eingegangen am');
      // Morgen in der Zeitzone der Praxis, in der das Formular prüft - nicht
      // in der des Geräts (BEF-083): Zwischen 22 und 24 Uhr UTC ist das
      // UTC-„morgen" in Berlin schon heute.
      const heute = todayInTimeZone('Europe/Berlin');
      const morgen = new Date(`${heute}T12:00:00Z`);
      morgen.setUTCDate(morgen.getUTCDate() + 1);
      fireEvent.change(datum, { target: { value: morgen.toISOString().slice(0, 10) } });
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(datum).toHaveAttribute('aria-invalid', 'true');
      expect(datum).toHaveAccessibleDescription(/nicht für die Zukunft buchen/);
      expect(screen.getByLabelText('Betrag')).not.toHaveAttribute('aria-invalid');
      expect(datum).toHaveFocus();
      expect(bucheZahlung).not.toHaveBeenCalled();

      // Die nächste Eingabe am Datum nimmt den Fehler zurück.
      fireEvent.change(datum, { target: { value: '2026-09-01' } });
      expect(datum).not.toHaveAttribute('aria-invalid');
    });

    it('nennt den Tausenderpunkt als Grund, statt „größer als null" zu verlangen (ABR-09)', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      const betrag = screen.getByLabelText('Betrag');
      await nutzer.clear(betrag);
      await nutzer.type(betrag, '1.234,56');
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(betrag).toHaveAccessibleDescription(/ohne Tausenderpunkt/);
      expect(bucheZahlung).not.toHaveBeenCalled();
    });

    it('beschriftet Datum und Weg vollständig und nennt die Rückzahlung knapp (ABR-09, WRT-11)', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500, paid_cents: 3000 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      expect(screen.getByLabelText('Zahlungsweg')).toBeInTheDocument();
      // Der offene Betrag steht schon im Feld; ein Hinweis dazu nur bei der
      // Rückzahlung (UX-005i).
      expect(screen.getByLabelText('Betrag')).toHaveValue('45,00');
      expect(screen.queryByText('Offen: 45,00 €')).toBeNull();

      await nutzer.selectOptions(screen.getByLabelText('Art'), 'Rückzahlung');
      expect(screen.getByLabelText('Rückzahlung')).toHaveValue('');
      expect(screen.getByLabelText('Zurückgezahlt am')).toBeInTheDocument();
      expect(screen.getByText('Eingegangen: 30,00 €')).toBeInTheDocument();

      // Zurück zum Eingang: Der offene Betrag steht wieder da.
      await nutzer.selectOptions(screen.getByLabelText('Art'), 'Zahlungseingang');
      expect(screen.getByLabelText('Betrag')).toHaveValue('45,00');
    });

    it('trägt an einer ausgestellten Rechnung kein Etikett „Ausgestellt" mehr (ABR-16, UX-005i)', async () => {
      fetchRechnungen.mockResolvedValue([rechnung()]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await screen.findByText('RG-2026-0001');
      expect(screen.queryByText('Ausgestellt')).toBeNull();
      expect(screen.queryByText('Entwurf')).toBeNull();
    });

    it('nennt an einer stornierten Rechnung keine Zahlungsfrist mehr (ABR-06)', async () => {
      fetchRechnungen.mockResolvedValue([rechnung({ cancelled: true })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText(/ausgestellt am 01\.09\.2026/)).toBeInTheDocument();
      expect(screen.queryByText(/zahlbar bis/)).toBeNull();
    });

    it('setzt „Entwurf anlegen" als Kartenaktion statt als Hauptknopf (ABR-24)', async () => {
      fetchKandidaten.mockResolvedValue([kandidat()]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      const knopf = await screen.findByRole('button', { name: 'Entwurf anlegen' });
      // Die gefüllte Fläche des Hauptknopfs, nicht `hover:bg-accent-soft`.
      expect(knopf.className.split(/\s+/)).not.toContain('bg-accent');
      expect(knopf.className.split(/\s+/)).toContain('min-h-11');
    });

    it('stellt Posten und Monate als Karten auf Papier (ABR-33)', async () => {
      fetchOffenePosten.mockResolvedValue([posten()]);
      fetchKandidaten.mockResolvedValue([kandidat()]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      const nummer = await screen.findByText('RG-2026-0001');
      expect(nummer.closest('.rounded-card')).toHaveClass('bg-surface');
      // Posten (Empfängerin) und Monat (Person) nennen denselben Namen.
      const namen = screen.getAllByText('Erika Beispiel');
      expect(namen).toHaveLength(2);
      for (const name of namen) expect(name.closest('.rounded-card')).toHaveClass('bg-surface');
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      fetchKandidaten.mockRejectedValue(new Error('Netz weg'));

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(
        await screen.findByText('Die abzurechnenden Leistungen konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
    });
  });
});

describe('Rechnungsliste mit Suche, Filter und Weitere laden (ABR-034, BEF-061)', () => {
  beforeEach(() => {
    fetchKandidaten.mockReset();
    fetchRechnungen.mockReset();
    fetchOffenePosten.mockReset();
    fetchKandidaten.mockResolvedValue([]);
    fetchOffenePosten.mockResolvedValue([]);
  });

  function seite(anzahl: number, gesamt: number, ab = 0): BillingApi.Rechnung[] {
    return Array.from({ length: anzahl }, (_, i) =>
      rechnung({
        id: `r${ab + i}`,
        invoice_number: `RG-2026-${String(ab + i + 1).padStart(4, '0')}`,
        total_count: gesamt,
      }),
    );
  }

  it('sagt, wie viele es sind, und lädt weitere nach', async () => {
    fetchRechnungen.mockImplementation((auswahl: { offset?: number }) =>
      Promise.resolve((auswahl.offset ?? 0) === 0 ? seite(100, 130) : seite(30, 130, 100)),
    );
    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('100 von 130 Rechnungen gezeigt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Weitere laden' }));
    expect(await screen.findByText('130 Rechnungen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weitere laden' })).toBeNull();
    expect(fetchRechnungen).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100 }));
  });

  it('sucht auf dem Server nach dem Getippten, mit Filter', async () => {
    fetchRechnungen.mockResolvedValue(seite(1, 1));
    const user = userEvent.setup();
    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');
    await screen.findByText('1 Rechnung');

    await user.type(screen.getByRole('searchbox', { name: 'Suche' }), 'Erika');
    await user.selectOptions(screen.getByLabelText('Zustand'), 'overdue');
    await waitFor(() =>
      expect(fetchRechnungen).toHaveBeenLastCalledWith(
        expect.objectContaining({ suche: 'Erika', filter: 'overdue', offset: 0 }),
      ),
    );
    expect(await screen.findByText('1 Treffer')).toBeInTheDocument();
  });

  it('sagt ohne Treffer, wo gesucht wird', async () => {
    fetchRechnungen.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');
    await screen.findByText('Noch keine Rechnung');
    await user.type(screen.getByRole('searchbox', { name: 'Suche' }), 'xyz');
    expect(await screen.findByText('Keine passende Rechnung')).toBeInTheDocument();
  });

  it('nennt bei gekürzten offenen Posten die volle Zahl', async () => {
    fetchRechnungen.mockResolvedValue([]);
    fetchOffenePosten.mockResolvedValue([posten({ total_count: 140, open_total_cents: 900_000 })]);
    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');
    expect(
      await screen.findByText(/140 Rechnungen · 9\.000,00 € offen · die 1 am frühesten fälligen/),
    ).toBeInTheDocument();
  });
});
