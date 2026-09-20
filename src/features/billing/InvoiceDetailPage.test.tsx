import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { rechnungsansicht } from './testdaten';
import { ZahlungStehtNoch } from './api';

const fetchRechnung = vi.fn();
const fetchEmpfaenger = vi.fn();
const setzeEmpfaenger = vi.fn();
const stelleRechnungAus = vi.fn();
const deleteEntwurf = vi.fn();
const fetchRechnungszahlungen = vi.fn();
const bucheZahlung = vi.fn();
const storniereRechnung = vi.fn();
const erstelleKorrektur = vi.fn();
const fetchErinnerungen = vi.fn();
const erstelleErinnerung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchRechnung: (id: string) => fetchRechnung(id) as Promise<BillingApi.Rechnungsansicht>,
    fetchEmpfaenger: (id: string) => fetchEmpfaenger(id) as Promise<BillingApi.Empfaenger[]>,
    setzeEmpfaenger: (...args: unknown[]) => setzeEmpfaenger(...args) as Promise<void>,
    stelleRechnungAus: (id: string) => stelleRechnungAus(id) as Promise<string>,
    deleteEntwurf: (id: string) => deleteEntwurf(id) as Promise<void>,
    fetchRechnungszahlungen: (id: string) =>
      fetchRechnungszahlungen(id) as Promise<BillingApi.Zahlung[]>,
    bucheZahlung: (...args: unknown[]) => bucheZahlung(...args) as Promise<void>,
    storniereRechnung: (...args: unknown[]) => storniereRechnung(...args) as Promise<string>,
    erstelleKorrektur: (id: string) => erstelleKorrektur(id) as Promise<string>,
    fetchErinnerungen: (id: string) => fetchErinnerungen(id) as Promise<BillingApi.Erinnerung[]>,
    erstelleErinnerung: (id: string) => erstelleErinnerung(id) as Promise<string>,
  };
});

const { InvoiceDetailPage } = await import('./InvoiceDetailPage');

/**
 * Der Ausgangswert steht in `testdaten.ts`: Rechnungsseite und
 * Rechnungsblatt zeigen dasselbe Dokument (ABR-003b).
 */
const ansicht = rechnungsansicht;

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    fetchRechnung.mockReset();
    fetchEmpfaenger.mockReset();
    setzeEmpfaenger.mockReset();
    stelleRechnungAus.mockReset();
    deleteEntwurf.mockReset();
    fetchRechnungszahlungen.mockReset();
    bucheZahlung.mockReset();
    storniereRechnung.mockReset();
    erstelleKorrektur.mockReset();
    fetchErinnerungen.mockReset();
    erstelleErinnerung.mockReset();
    fetchEmpfaenger.mockResolvedValue([]);
    setzeEmpfaenger.mockResolvedValue(undefined);
    stelleRechnungAus.mockResolvedValue('RG-2026-0001');
    fetchRechnungszahlungen.mockResolvedValue([]);
    bucheZahlung.mockResolvedValue(undefined);
    storniereRechnung.mockResolvedValue('RG-2026-0002');
    erstelleKorrektur.mockResolvedValue('r2');
    fetchErinnerungen.mockResolvedValue([]);
    erstelleErinnerung.mockResolvedValue('e1');
  });

  it('nennt den Entwurf ohne Nummer und sagt, wann sie entsteht', async () => {
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByRole('heading', { name: 'Rechnungsentwurf' })).toBeInTheDocument();
    expect(screen.getByText(/Die Nummer entsteht beim Ausstellen/)).toBeInTheDocument();
  });

  it('zeigt Leistungen, Summe und die Behandlungsgrundlage ohne Diagnose', async () => {
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/1 × Krankengymnastik \(KG\)/)).toBeInTheDocument();
    expect(screen.getByText('Gesamtbetrag')).toBeInTheDocument();
    expect(
      screen.getByText(/Erstverordnung vom 01.07.2026 · Dr. Fiktiv Beispiel/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ohne Diagnose/)).toBeInTheDocument();
  });

  it('weist die enthaltene Umsatzsteuer aus, wenn es eine gibt', async () => {
    fetchRechnung.mockResolvedValue(
      ansicht(
        {},
        {
          tax_groups: [
            {
              tax_treatment: 'taxable',
              tax_rate_permille: 190,
              gross_cents: 6000,
              tax_cents: 958,
              net_cents: 5042,
            },
          ],
          totals: { total_cents: 6000, tax_total_cents: 958 },
        },
      ),
    );

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(
      await screen.findByText(/darin enthaltene Umsatzsteuer 9,58 € \(19 %\)/),
    ).toBeInTheDocument();
  });

  it('nennt den Hinweis nach Par. 19 UStG, wenn keine Umsatzsteuer ausgewiesen wird', async () => {
    const daten = ansicht();
    daten.document.issuer.small_business = true;
    fetchRechnung.mockResolvedValue(daten);

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/§ 19 UStG/)).toBeInTheDocument();
  });

  it('stellt den Entwurf auf Wunsch aus', async () => {
    const nutzer = userEvent.setup();
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    await nutzer.click(await screen.findByRole('button', { name: 'Rechnung ausstellen' }));

    expect(stelleRechnungAus).toHaveBeenCalledWith('r1');
  });

  it('fragt vor dem Verwerfen nach und nennt die Folge', async () => {
    const nutzer = userEvent.setup();
    fetchRechnung.mockResolvedValue(ansicht());
    deleteEntwurf.mockResolvedValue(undefined);

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    await nutzer.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
    expect(screen.getByText(/es entsteht also keine Lücke/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(deleteEntwurf).toHaveBeenCalledWith('r1');
  });

  it('waehlt einen hinterlegten Empfaenger', async () => {
    const nutzer = userEvent.setup();
    fetchRechnung.mockResolvedValue(ansicht());
    fetchEmpfaenger.mockResolvedValue([
      {
        id: 'e1',
        recipient_kind: 'aid_authority',
        name: 'Beihilfestelle Testland',
        street: null,
        house_number: null,
        postal_code: null,
        city: null,
        reference: 'BH-1',
        is_default: false,
      },
    ]);

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    // Erst warten, bis die hinterlegten Empfänger geladen sind — vorher steht
    // in der Auswahl nur die Patientin selbst.
    await screen.findByRole('option', { name: /Beihilfestelle Testland/ });
    await nutzer.selectOptions(screen.getByLabelText(/Rechnung geht an/), 'e1');

    expect(setzeEmpfaenger).toHaveBeenCalledWith('r1', 'e1');
  });

  it('bietet an der ausgestellten Rechnung nichts mehr zum Aendern an', async () => {
    fetchRechnung.mockResolvedValue(
      ansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-01',
        due_on: '2026-09-15',
      }),
    );

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByRole('heading', { name: 'RG-2026-0001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechnung ausstellen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf verwerfen' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Rechnung geht an/)).not.toBeInTheDocument();
  });

  it('zeigt der Therapeutin keine Entwurfsaktionen (ANN-076)', async () => {
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['therapist'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/1 × Krankengymnastik/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechnung ausstellen' })).not.toBeInTheDocument();
  });

  it('sagt es, wenn die Praxis-Stammdaten fehlen', async () => {
    const { KeineStammdaten } = await import('./api');
    fetchRechnung.mockRejectedValue(new KeineStammdaten());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/noch keine Praxis-Stammdaten erfasst/)).toBeInTheDocument();
  });

  describe('Zahlungen (ABR-004)', () => {
    const ausgestellt = () =>
      ansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-01',
        due_on: '2026-09-15',
        paid_cents: 2000,
        outstanding_cents: 2500,
        payment_state: 'partially_paid',
      });

    it('stehen am Entwurf gar nicht - an ihm kann niemand zahlen', async () => {
      fetchRechnung.mockResolvedValue(ansicht());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText(/1 × Krankengymnastik/)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Zahlungen' })).not.toBeInTheDocument();
    });

    it('nehmen den offenen Betrag vom Server und rechnen ihn nicht nach', async () => {
      // Der Server ist die eine Quelle (ADR-009 Punkt 12). Die Zahlungsliste
      // widerspricht hier absichtlich dem gemeldeten Stand: Angezeigt wird,
      // was der Server sagt.
      fetchRechnung.mockResolvedValue(ausgestellt());
      fetchRechnungszahlungen.mockResolvedValue([
        {
          id: 'z1',
          direction: 'incoming',
          amount_cents: 9999,
          currency: 'EUR',
          paid_on: '2026-09-05',
          method: 'bank_transfer',
          note: null,
          voided_at: null,
          void_reason: null,
        },
      ]);

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText('Noch offen')).toBeInTheDocument();
      expect(screen.getByText('25,00 €')).toBeInTheDocument();
    });

    it('lassen eine stornierte Buchung mit ihrem Grund stehen', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      fetchRechnungszahlungen.mockResolvedValue([
        {
          id: 'z1',
          direction: 'incoming',
          amount_cents: 2000,
          currency: 'EUR',
          paid_on: '2026-09-05',
          method: 'bank_transfer',
          note: null,
          voided_at: '2026-09-06T10:00:00Z',
          void_reason: 'Doppelt erfasst',
        },
      ]);

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText('Storniert')).toBeInTheDocument();
      expect(screen.getByText(/Storniert: Doppelt erfasst/)).toBeInTheDocument();
    });

    it('buchen eine Rueckzahlung als eigene Richtung', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(ausgestellt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await nutzer.selectOptions(
        await screen.findByLabelText('Art'),
        'Rückzahlung an den Empfänger',
      );
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(bucheZahlung).toHaveBeenCalledWith(
        expect.objectContaining({ richtung: 'refund', betragCent: 2500 }),
      );
    });

    it('bietet an einer stornierten Rechnung kein Formular an (R3-004)', async () => {
      // Der Server weist die Buchung ab ('a cancelled invoice takes no
      // payment'). Ein Formular, das nur noch Fehlermeldungen erzeugt, ist
      // kein Angebot - die gebuchten Zahlungen bleiben aber sichtbar.
      fetchRechnung.mockResolvedValue({
        ...ausgestellt(),
        cancellation: {
          cancellation_number: 'RG-2026-0002',
          reason: 'Leistung doppelt erfasst',
          cancelled_on: '2026-09-18',
        },
      });

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText('Noch offen')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zahlung buchen' })).not.toBeInTheDocument();
    });

    it('bietet der Therapeutin kein Formular an (ANN-076)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['therapist'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText('Noch offen')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zahlung buchen' })).not.toBeInTheDocument();
    });
  });

  describe('Storno und Korrektur (ABR-003c)', () => {
    const ausgestellt = () =>
      ansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-01',
        due_on: '2026-09-15',
      });

    it('verlangt einen Grund, bevor es storniert', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await userEvent.click(await screen.findByRole('button', { name: 'Rechnung stornieren' }));
      await userEvent.click(screen.getByRole('button', { name: 'Storno ausstellen' }));

      expect(await screen.findByText(/Bitte einen Grund angeben/)).toBeInTheDocument();
      expect(storniereRechnung).not.toHaveBeenCalled();
    });

    it('storniert mit Grund', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await userEvent.click(await screen.findByRole('button', { name: 'Rechnung stornieren' }));
      await userEvent.type(screen.getByLabelText('Grund'), 'Falscher Empfänger');
      await userEvent.click(screen.getByRole('button', { name: 'Storno ausstellen' }));

      expect(storniereRechnung).toHaveBeenCalledWith('r1', 'Falscher Empfänger');
    });

    it('sagt bei einer gebuchten Zahlung, was zuerst zu tun ist', async () => {
      // Erst das Geld, dann das Dokument - sonst bliebe ein Eingang ohne
      // Forderung stehen.
      fetchRechnung.mockResolvedValue(ausgestellt());
      storniereRechnung.mockRejectedValue(new ZahlungStehtNoch());
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await userEvent.click(await screen.findByRole('button', { name: 'Rechnung stornieren' }));
      await userEvent.type(screen.getByLabelText('Grund'), 'Doppelt erfasst');
      await userEvent.click(screen.getByRole('button', { name: 'Storno ausstellen' }));

      expect(await screen.findByText(/Erst die Zahlung stornieren/)).toBeInTheDocument();
    });

    it('zeigt an der stornierten Rechnung Nummer, Grund und den Weg zum Dokument', async () => {
      fetchRechnung.mockResolvedValue(
        ansicht({
          status: 'issued',
          invoice_number: 'RG-2026-0001',
          cancellation: {
            cancellation_number: 'RG-2026-0002',
            reason: 'Leistung doppelt erfasst',
            cancelled_on: '2026-09-18',
          },
        }),
      );
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(
        await screen.findByText(/Stornodokument RG-2026-0002 vom 18.09.2026/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Grund: Leistung doppelt erfasst/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Stornodokument öffnen' })).toHaveAttribute(
        'href',
        '/abrechnung/rechnungen/r1/storno',
      );
      // Storniert heisst: kein Storno mehr anbieten.
      expect(screen.queryByRole('button', { name: 'Rechnung stornieren' })).toBeNull();
    });

    it('legt die Korrekturrechnung an', async () => {
      fetchRechnung.mockResolvedValue(
        ansicht({
          status: 'issued',
          invoice_number: 'RG-2026-0001',
          cancellation: {
            cancellation_number: 'RG-2026-0002',
            reason: 'Falscher Empfänger',
            cancelled_on: '2026-09-18',
          },
        }),
      );
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await userEvent.click(
        await screen.findByRole('button', { name: 'Korrekturrechnung erstellen' }),
      );
      expect(erstelleKorrektur).toHaveBeenCalledWith('r1');
    });

    it('führt von der Korrektur zurück zur ersetzten Rechnung', async () => {
      fetchRechnung.mockResolvedValue(
        ansicht({ replaces_invoice_id: 'r0', replaces_invoice_number: 'RG-2026-0001' }),
      );
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByRole('link', { name: 'RG-2026-0001' })).toHaveAttribute(
        'href',
        '/abrechnung/rechnungen/r0',
      );
    });

    it('bietet der Therapeutin kein Storno an', async () => {
      // Die Oberfläche blendet aus, der Server weist ab (ANN-076, ADR-004).
      fetchRechnung.mockResolvedValue(ausgestellt());
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['therapist'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await screen.findByRole('heading', { name: 'RG-2026-0001' });
      expect(screen.queryByRole('button', { name: 'Rechnung stornieren' })).toBeNull();
    });
  });

  describe('Zahlungserinnerung (ABR-003d)', () => {
    const faellig = (rest: Partial<BillingApi.Rechnungsansicht> = {}) =>
      ansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-08-20',
        due_on: '2026-09-03',
        outstanding_cents: 4500,
        overdue: true,
        ...rest,
      });

    it('stellt eine Erinnerung aus, sobald die Rechnung fällig ist', async () => {
      fetchRechnung.mockResolvedValue(faellig());
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await userEvent.click(
        await screen.findByRole('button', { name: 'Zahlungserinnerung ausstellen' }),
      );
      expect(erstelleErinnerung).toHaveBeenCalledWith('r1');
    });

    it('bietet vor der Fälligkeit keine an und sagt warum', async () => {
      fetchRechnung.mockResolvedValue(faellig({ overdue: false }));
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText(/noch nicht fällig/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zahlungserinnerung ausstellen' })).toBeDisabled();
    });

    it('führt jede ausgestellte Erinnerung mit ihrem eigenen Betrag', async () => {
      // Keine Stufen: zwei Erinnerungen sind zwei Erinnerungen, jede mit dem
      // offenen Betrag ihres Tages (ANN-080).
      fetchRechnung.mockResolvedValue(faellig());
      fetchErinnerungen.mockResolvedValue([
        {
          id: 'e2',
          reminder_on: '2026-09-20',
          due_on: '2026-10-04',
          outstanding_cents: 2500,
          currency: 'EUR',
        },
        {
          id: 'e1',
          reminder_on: '2026-09-10',
          due_on: '2026-09-24',
          outstanding_cents: 4500,
          currency: 'EUR',
        },
      ]);
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText(/Frist bis 04.10.2026 · 25,00 € offen/)).toBeInTheDocument();
      expect(screen.getByText(/Frist bis 24.09.2026 · 45,00 € offen/)).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'Blatt öffnen' })[0]).toHaveAttribute(
        'href',
        '/abrechnung/erinnerungen/e2',
      );
      expect(screen.queryByText(/Mahnstufe/)).toBeNull();
    });

    it('erinnert an eine stornierte Rechnung gar nicht', async () => {
      fetchRechnung.mockResolvedValue(
        faellig({
          cancellation: {
            cancellation_number: 'RG-2026-0002',
            reason: 'Falscher Empfänger',
            cancelled_on: '2026-09-18',
          },
        }),
      );
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await screen.findByText(/Stornodokument RG-2026-0002/);
      expect(screen.queryByText('Zahlungserinnerung')).toBeNull();
    });
  });
});
