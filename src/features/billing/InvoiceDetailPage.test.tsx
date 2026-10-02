import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { todayInTimeZone } from '@/features/appointments/api';
import { rechnungsansicht } from './testdaten';
import { zeigeMitRouten } from './testumgebung';

const fetchRechnung = vi.fn();
const fetchEmpfaenger = vi.fn();
const saveEmpfaenger = vi.fn();
const setzeEmpfaenger = vi.fn();
const stelleRechnungAus = vi.fn();
const deleteEntwurf = vi.fn();
const fetchRechnungszahlungen = vi.fn();
const bucheZahlung = vi.fn();
const storniereRechnung = vi.fn();
const erstelleKorrektur = vi.fn();
const fetchErinnerungen = vi.fn();
const erstelleErinnerung = vi.fn();
const verrechneMitKorrektur = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchRechnung: (id: string) => fetchRechnung(id) as Promise<BillingApi.Rechnungsansicht>,
    fetchEmpfaenger: (id: string) => fetchEmpfaenger(id) as Promise<BillingApi.Empfaenger[]>,
    saveEmpfaenger: (...args: unknown[]) => saveEmpfaenger(...args) as Promise<void>,
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
    verrechneMitKorrektur: (...args: unknown[]) => verrechneMitKorrektur(...args) as Promise<void>,
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
    saveEmpfaenger.mockReset();
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

    // Erst auf einen Text warten, dann die Rolle prüfen: Eine Rollenabfrage je
    // Warteschritt ist auf dieser Seite teuer und riss unter Last die Wartezeit.
    expect(await screen.findByText(/Die Nummer entsteht beim Ausstellen/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entwurf · Erika Beispiel' })).toBeInTheDocument();
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
    // Keine Diagnose - und seit UX-005i auch kein Satz, der das erklärt.
    expect(screen.queryByText(/Diagnose/)).toBeNull();
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

  it('nennt den Grund der Steuerbefreiung an der steuerfreien Gruppe (BEF-019)', async () => {
    // Dieselbe Angabe wie auf dem Blatt, weil beide dasselbe Dokument zeigen:
    // Pflichtangabe nach § 14 Abs. 4 Nr. 8 UStG (ADR-009 Punkt 18).
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(
      await screen.findByText(/Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG/),
    ).toBeInTheDocument();
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

    await nutzer.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));
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

  it('schickt eine Trainingsrechnung an die Kundin selbst und nennt sie nicht behandelt (TRN-008)', async () => {
    fetchRechnung.mockResolvedValue(
      ansicht(
        { patient_id: null },
        {
          service_area: 'training',
          recipient: {
            kind: 'self',
            name: 'Tina Trainingskundin',
            street: 'Trainingsweg 5',
            house_number: null,
            postal_code: '72076',
            city: 'Tuebingen',
            reference: null,
          },
          patient: { name: 'Tina Trainingskundin', date_of_birth: null },
          treatment_bases: [],
        },
      ),
    );

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(
      await screen.findByText(/Eine Trainingsrechnung geht an die Kund:in selbst/),
    ).toBeInTheDocument();
    // Geht die Rechnung an die Kund:in selbst, steht ihr Name nicht ein
    // zweites Mal unter der Empfängerin (UX-005i).
    expect(screen.queryByText(/Leistung für:/)).toBeNull();
    expect(screen.getByText('Kund:in selbst')).toBeInTheDocument();
    expect(screen.queryByText('Patient:in selbst')).not.toBeInTheDocument();
    expect(screen.getByText(/Trainingsweg 5, 72076 Tuebingen/)).toBeInTheDocument();
    expect(screen.queryByText(/Behandelt:/)).not.toBeInTheDocument();
    // ANN-182: Die hinterlegten Empfänger hängen an der Akte - im Training
    // wird weder gefragt noch gewählt.
    expect(screen.queryByLabelText(/Rechnung geht an/)).not.toBeInTheDocument();
    expect(fetchEmpfaenger).not.toHaveBeenCalled();
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

    expect(
      await screen.findByRole('heading', { name: 'RG-2026-0001 · Erika Beispiel' }),
    ).toBeInTheDocument();
    // Die Frist steht in der Zustandszeile, der Satz über die
    // Unveränderlichkeit nicht mehr (UX-005i).
    expect(screen.getByText(/Zahlbar bis 15\.09\.2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Ausgestellt und unveränderlich/)).toBeNull();
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

    expect(await screen.findByText(/noch keine Praxisstammdaten erfasst/)).toBeInTheDocument();
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

      await nutzer.selectOptions(await screen.findByLabelText('Art'), 'Rückzahlung');
      // ABR-09: Die Rückzahlung übernimmt nicht den offenen Betrag - als
      // Rückzahlung wäre er fast immer falsch. Der Hinweis nennt, was
      // eingegangen ist, und zwar den Wert des Servers.
      const rueckzahlung = screen.getByLabelText('Rückzahlung');
      expect(rueckzahlung).toHaveValue('');
      expect(screen.getByText('Eingegangen: 20,00 €')).toBeInTheDocument();

      await nutzer.type(rueckzahlung, '15,00');
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(bucheZahlung).toHaveBeenCalledWith(
        expect.objectContaining({ richtung: 'refund', betragCent: 1500 }),
      );
    });

    it('bietet an einer stornierten Rechnung kein Formular an (R3-004)', async () => {
      // Der Server weist die Buchung ab ('a cancelled invoice takes no
      // payment'). Ein Formular, das nur noch Fehlermeldungen erzeugt, ist
      // kein Angebot - die gebuchten Zahlungen bleiben aber sichtbar.
      // Ohne Eingang (seit ABN-008 bietet ein Eingang Rückzahlung und
      // Verrechnung an, eigener Test unter „Storno und Korrektur“).
      fetchRechnung.mockResolvedValue({
        ...ausgestellt(),
        paid_cents: 0,
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

      // ABR-06: An einer stornierten Rechnung steht keine Forderung mehr.
      expect(await screen.findByText('Storniert – keine Forderung')).toBeInTheDocument();
      expect(screen.queryByText('Noch offen')).toBeNull();
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

    it('storniert trotz gebuchter Zahlung und sagt, was mit dem Betrag geschieht (ABN-008)', async () => {
      fetchRechnung.mockResolvedValue({ ...ausgestellt(), paid_cents: 4500 });
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await userEvent.click(await screen.findByRole('button', { name: 'Rechnung stornieren' }));
      expect(screen.getByText(/Der Betrag bleibt nach dem Storno stehen/)).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Grund'), 'Doppelt erfasst');
      await userEvent.click(screen.getByRole('button', { name: 'Storno ausstellen' }));

      expect(storniereRechnung).toHaveBeenCalledWith('r1', 'Doppelt erfasst');
    });

    it('bietet an der stornierten Rechnung mit Eingang Rückzahlung und Verrechnung an (ABN-008)', async () => {
      verrechneMitKorrektur.mockResolvedValue(undefined);
      fetchRechnung.mockResolvedValue(
        ansicht({
          status: 'issued',
          invoice_number: 'RG-2026-0001',
          paid_cents: 4500,
          cancellation: {
            cancellation_number: 'RG-2026-0002',
            reason: 'Falscher Empfänger',
            cancelled_on: '2026-09-18',
          },
          correction_invoice_id: 'r2',
          correction_invoice_number: 'RG-2026-0003',
        }),
      );
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(
        await screen.findByText('Storniert – eingegangen, noch zurückzuzahlen oder zu verrechnen'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rückzahlung buchen' })).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Mit Korrekturrechnung RG-2026-0003 verrechnen' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Verrechnung buchen' }));

      expect(verrechneMitKorrektur).toHaveBeenCalledWith({
        stornierteId: 'r1',
        korrekturId: 'r2',
        betragCent: 4500,
      });
    });

    it('verrechnet erst mit der ausgestellten Korrekturrechnung (ABN-008)', async () => {
      fetchRechnung.mockResolvedValue(
        ansicht({
          status: 'issued',
          invoice_number: 'RG-2026-0001',
          paid_cents: 4500,
          cancellation: {
            cancellation_number: 'RG-2026-0002',
            reason: 'Falscher Empfänger',
            cancelled_on: '2026-09-18',
          },
          correction_invoice_id: 'r2',
          correction_invoice_number: null,
        }),
      );
      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(
        await screen.findByText(/Verrechnen lässt sich mit der Korrekturrechnung, sobald/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /verrechnen/ })).toBeNull();
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

      expect(
        await screen.findByRole('heading', { name: 'RG-2026-0001 · Erika Beispiel' }),
      ).toBeInTheDocument();
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
      // ABR-25: Der Link nennt das Blatt, das er öffnet.
      expect(
        screen.getByRole('link', { name: 'Erinnerung vom 20.09.2026 öffnen' }),
      ).toHaveAttribute('href', '/abrechnung/erinnerungen/e2');
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

  describe('UXR-010', () => {
    /** Mit echten Routen: Die Abfrage heißt dann wie in der Anwendung ['rechnung', 'r1']. */
    function zeigeRechnung(nutzer = testUser(['office'])) {
      return zeigeMitRouten(
        [
          {
            path: '/abrechnung/rechnungen/:invoiceId',
            element: <InvoiceDetailPage user={nutzer} />,
          },
          { path: '/abrechnung/erinnerungen/:reminderId', element: <p>Erinnerungsblatt</p> },
          { path: '/abrechnung', element: <p>Rechnungsliste</p> },
        ],
        '/abrechnung/rechnungen/r1',
      );
    }

    const ausgestellt = (rest: Partial<BillingApi.Rechnungsansicht> = {}) =>
      ansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-01',
        due_on: '2026-09-15',
        paid_cents: 2000,
        outstanding_cents: 2500,
        payment_state: 'partially_paid',
        ...rest,
      });

    const bezahlt = () =>
      ausgestellt({ paid_cents: 4500, outstanding_cents: 0, payment_state: 'paid' });

    it('nennt beim Laden keinen falschen Zustand (ABR-05, ZST-09)', async () => {
      // Vorher stand hier „Rechnungsentwurf – Noch ohne Nummer", auch beim
      // Laden einer ausgestellten Rechnung.
      fetchRechnung.mockReturnValue(new Promise(() => undefined));

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByRole('heading', { name: 'Rechnung' })).toBeInTheDocument();
      expect(screen.getByText('Rechnung wird geladen …')).toBeInTheDocument();
      expect(screen.queryByText(/Nummer entsteht beim Ausstellen/)).toBeNull();
    });

    it('nennt im Kopf Nummer, Person, Monat, Betrag und Zahlungsstand (ABR-05)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt({ overdue: true }));

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText('August 2026 · 45,00 €')).toBeInTheDocument();
      const titel = screen.getByRole('heading', { name: 'RG-2026-0001 · Erika Beispiel' });
      expect(
        within(titel.closest('header')!).getByRole('link', { name: 'Rechnungsblatt öffnen' }),
      ).toHaveAttribute('href', '/abrechnung/rechnungen/r1/druck');

      // Der Zahlungsstand steht vor dem ersten Abschnitt, nicht erst unter
      // „Zahlungen" - bei 390 px zwei Bildschirmhöhen tiefer.
      const stand = screen.getAllByText('Teilweise bezahlt')[0]!;
      const empfaenger = screen.getByRole('heading', { name: 'Empfänger' });
      expect(
        stand.compareDocumentPosition(empfaenger) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getAllByText('Überfällig')[0]).toBeInTheDocument();
    });

    it('führt mit ganzem Satz zurück zur Liste (NAV-16)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByRole('link', { name: /Zurück zu den Rechnungen/ })).toHaveAttribute(
        'href',
        '/abrechnung',
      );
    });

    it('nennt die Grundlage mit den Wörtern der Akte (ABR-18)', async () => {
      fetchRechnung.mockResolvedValue(
        ansicht(
          {},
          { treatment_bases: [{ kind: 'self_pay', issued_on: '2026-09-03', prescriber: null }] },
        ),
      );

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText('Selbstzahler seit 03.09.2026')).toBeInTheDocument();
      expect(screen.queryByText(/Selbstzahlerin/)).toBeNull();
    });

    it('gliedert die IBAN und kürzt das Geburtsdatum wie überall (ABR-28, WRT-15)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByText(/IBAN DE02 1203 0000 0000 2020 51/)).toBeInTheDocument();
      expect(screen.getByText(/geb\. 17\.09\.1963/)).toBeInTheDocument();
    });

    it('zeigt an einer bezahlten Rechnung nicht „Bezahlt 0,00 €" (ABR-B01)', async () => {
      // Der Wert kommt richtig vom Server (0 offen); falsch war die
      // Beschriftung daneben. Jetzt heißt die Zeile, was sie zeigt.
      fetchRechnung.mockResolvedValue(bezahlt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      const zeile = (await screen.findByText('Noch offen')).closest('div')!;
      expect(within(zeile).getByText('0,00 €')).toBeInTheDocument();
      // Der Zahlungsstand steht einmal, in der Zustandszeile oben (UX-005i).
      expect(screen.getByText('Bezahlt')).toBeInTheDocument();
      expect(within(zeile).queryByText('Bezahlt')).toBeNull();
      // Keine Summenzeile heißt „Bezahlt". Gesucht wird die Beschriftung einer
      // Summenzeile (`text-liste` in 600) - das Gewicht allein trägt seit dem
      // Design-Handoff vom 2026-10-01 auch das Abzeichen oben.
      expect(screen.queryByText('Bezahlt', { selector: '.text-liste.font-semibold' })).toBeNull();
      expect(screen.getByText('Noch offen').matches('.text-liste.font-semibold')).toBe(true);
    });

    it('zeigt nach einer Buchung an der Rechnung sofort den neuen offenen Betrag (ABR-01)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValueOnce(ausgestellt()).mockResolvedValue(bezahlt());

      zeigeRechnung();

      expect(await screen.findByText('25,00 €')).toBeInTheDocument();
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      const zeile = (await screen.findByText('0,00 €')).closest('div')!;
      expect(within(zeile).getByText('Noch offen')).toBeInTheDocument();
      expect(fetchRechnung).toHaveBeenCalledTimes(2);
      expect(bucheZahlung).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'r1', betragCent: 2500, richtung: 'incoming' }),
      );
    });

    it('klappt das Formular an einer bezahlten Rechnung ein (ABR-09)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(bezahlt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      const knopf = await screen.findByRole('button', { name: 'Zahlung buchen' });
      expect(screen.queryByLabelText('Betrag')).toBeNull();
      await nutzer.click(knopf);
      expect(screen.getByLabelText('Betrag')).toHaveValue('');
    });

    it('bietet Zahlungs- und Rechnungsstorno nebeneinander an (ABR-07, ABN-008)', async () => {
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
          voided_at: null,
          void_reason: null,
        },
      ]);

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByRole('button', { name: 'Zahlung stornieren' })).toBeInTheDocument();
      // Seit ABN-008 sperrt die Zahlung das Storno der Rechnung nicht mehr.
      expect(screen.getByRole('button', { name: 'Rechnung stornieren' })).toBeInTheDocument();
    });

    it('meldet das Ausstellen mit der Nummer und setzt den Fokus aufs Blatt (ABR-10)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(ansicht());

      const { client } = zeigeRechnung();
      const neuLaden = vi.spyOn(client, 'invalidateQueries');

      await nutzer.click(await screen.findByRole('button', { name: 'Rechnung ausstellen' }));

      const meldung = await screen.findByText('Rechnung RG-2026-0001 ausgestellt.');
      expect(meldung).toHaveAttribute('role', 'status');
      const blatt = within(meldung.parentElement!).getByRole('link', {
        name: 'Rechnungsblatt öffnen',
      });
      expect(blatt).toHaveAttribute('href', '/abrechnung/rechnungen/r1/druck');
      await waitFor(() => expect(blatt).toHaveFocus());

      // ABR-01: auch offene Posten und Leistungen laden neu. Der Aufruf bleibt.
      await waitFor(() =>
        expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['abrechnung-leistungen'] }),
      );
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['offene-posten'] });
      expect(stelleRechnungAus).toHaveBeenCalledWith('r1');
    });

    it('lädt nach der Korrektur die stornierte Rechnung neu (ABR-01)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(
        ausgestellt({
          cancellation: {
            cancellation_number: 'RG-2026-0002',
            reason: 'Falscher Empfänger',
            cancelled_on: '2026-09-18',
          },
        }),
      );

      const { client } = zeigeRechnung();
      const neuLaden = vi.spyOn(client, 'invalidateQueries');

      await nutzer.click(
        await screen.findByRole('button', { name: 'Korrekturrechnung erstellen' }),
      );

      await waitFor(() => expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['rechnung', 'r1'] }));
      expect(erstelleKorrektur).toHaveBeenCalledWith('r1');
    });

    it('zeigt einen Fehlschlag beim Verwerfen im offenen Kasten (ABR-03)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(ansicht());
      deleteEntwurf.mockRejectedValue(new Error('Der Entwurf konnte nicht verworfen werden.'));

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await nutzer.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
      await nutzer.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Der Entwurf konnte nicht verworfen werden. Bitte die Verbindung prüfen und erneut versuchen.',
      );
      // Der Kasten bleibt offen: Der Entwurf existiert noch.
      expect(screen.getByRole('group', { name: 'Entwurf verwerfen' })).toBeInTheDocument();
    });

    it('sagt dem Office, wer die Stammdaten erfasst (ABR-17)', async () => {
      const { KeineStammdaten } = await import('./api');
      fetchRechnung.mockRejectedValue(new KeineStammdaten());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(
        await screen.findByText(/Die Praxisinhaber:in muss sie erst erfassen/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Zu den Praxisstammdaten' })).toBeNull();
    });

    it('führt die Praxisinhaberin zu den Stammdaten (ABR-17)', async () => {
      const { KeineStammdaten } = await import('./api');
      fetchRechnung.mockRejectedValue(new KeineStammdaten());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['owner'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(await screen.findByRole('link', { name: 'Zu den Praxisstammdaten' })).toHaveAttribute(
        'href',
        '/abrechnung/stammdaten',
      );
    });

    it('zeigt einen Ladefehler der Erinnerungen statt „Noch keine" (ABR-30)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt({ overdue: true }));
      fetchErinnerungen.mockRejectedValue(new Error('Netz weg'));

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(
        await screen.findByText('Die Zahlungserinnerungen konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Noch keine Erinnerung ausgestellt.')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Zahlungserinnerung ausstellen' })).toBeNull();
    });

    it('sperrt die zweite Erinnerung am selben Tag und sagt warum (ABR-B03)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt({ overdue: true }));
      fetchErinnerungen.mockResolvedValue([
        {
          id: 'e1',
          reminder_on: todayInTimeZone('Europe/Berlin'),
          due_on: '2026-10-11',
          outstanding_cents: 2500,
          currency: 'EUR',
        },
      ]);

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      expect(
        await screen.findByText('Heute ist bereits eine Erinnerung ausgestellt.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zahlungserinnerung ausstellen' })).toBeDisabled();
    });

    it('öffnet nach dem Ausstellen der Erinnerung ihr Blatt (ABR-10)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(ausgestellt({ overdue: true }));

      const { router } = zeigeRechnung();
      // Beobachtet wird der Seitenwechsel selbst, nicht sein Ergebnis: Unter
      // Node 24 scheitert jede Navigation des Data Routers in jsdom an einem
      // fremden `AbortSignal` (siehe die Router-Fälle der lokalen
      // Basisfehlschläge). Das Ziel lässt sich trotzdem genau prüfen.
      const wechsel = vi.spyOn(router, 'navigate').mockResolvedValue(undefined);

      await nutzer.click(
        await screen.findByRole('button', { name: 'Zahlungserinnerung ausstellen' }),
      );

      await waitFor(() => expect(wechsel).toHaveBeenCalled());
      expect(wechsel.mock.calls[0]?.[0]).toBe('/abrechnung/erinnerungen/e1');
      expect(erstelleErinnerung).toHaveBeenCalledWith('r1');
    });

    it('sperrt die Empfängerwahl, solange sie gesetzt wird, und meldet den Erfolg (ABR-10)', async () => {
      const nutzer = userEvent.setup();
      let fertig: () => void = () => undefined;
      setzeEmpfaenger.mockReturnValue(
        new Promise<void>((erledigt) => {
          fertig = erledigt;
        }),
      );
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
          reference: null,
          is_default: false,
        },
      ]);

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await screen.findByRole('option', { name: /Beihilfestelle Testland/ });
      const auswahl = screen.getByLabelText(/Rechnung geht an/);
      await nutzer.selectOptions(auswahl, 'e1');

      // Die Auswahl zeigt schon die neue Wahl und nimmt keinen zweiten Wechsel an.
      expect(auswahl).toBeDisabled();
      expect(auswahl).toHaveValue('e1');

      fertig();
      expect(await screen.findByText('Empfänger gesetzt.')).toBeInTheDocument();
      expect(auswahl).toBeEnabled();
    });

    it('nennt am Empfängerformular den fehlenden Namen am Feld (ABR-20, RSP-12)', async () => {
      const nutzer = userEvent.setup();
      fetchRechnung.mockResolvedValue(ansicht());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      await nutzer.click(await screen.findByRole('button', { name: 'Empfänger hinterlegen' }));
      const speichern = screen.getByRole('button', { name: 'Empfänger speichern' });
      // Nicht mehr ohne Grund gesperrt: Der Grund steht nach dem Tipp am Feld.
      expect(speichern).toBeEnabled();
      await nutzer.click(speichern);

      const name = screen.getByLabelText('Name oder Stelle *');
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(name).toHaveAccessibleDescription('Bitte ausfüllen.');
      expect(name).toHaveFocus();
      expect(saveEmpfaenger).not.toHaveBeenCalled();
      expect(screen.getByLabelText('PLZ')).toHaveAttribute('inputmode', 'numeric');
    });

    it('ordnet Leistungszeilen am Handy zweizeilig (ABR-B08)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      const text = await screen.findByText(/1 × Krankengymnastik \(KG\)/);
      expect(text.closest('li')).toHaveClass('grid', 'grid-cols-[1fr_auto]');
      // Unter 640 px volle Breite in der zweiten Zeile, darüber die Mittelspalte.
      expect(text.parentElement).toHaveClass('col-span-2', 'row-start-2', 'sm:col-span-1');
    });

    it('kennzeichnet das Ausfallhonorar ohne Warnzeichen (ABR-16)', async () => {
      fetchRechnung.mockResolvedValue(
        ansicht(
          {},
          {
            items: [
              {
                performed_on: '2026-08-05',
                code: 'AUS',
                label: 'Ausfall kurzfristig',
                item_kind: 'absence_fee',
                quantity: 1,
                unit_price_cents: 3000,
                line_total_cents: 3000,
                currency: 'EUR',
                tax_treatment: 'not_taxable',
                tax_rate_permille: 0,
              },
            ],
          },
        ),
      );

      renderWithProviders(
        <InvoiceDetailPage user={testUser(['office'])} />,
        '/abrechnung/rechnungen/r1',
      );

      const etikett = await screen.findByText('Ausfallhonorar');
      expect(etikett.textContent).toBe('Ausfallhonorar');
    });
  });
});
