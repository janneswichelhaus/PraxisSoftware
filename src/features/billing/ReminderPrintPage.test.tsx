import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';
import { rechnungsansicht } from './testdaten';
import { zeigeMitRouten } from './testumgebung';

const fetchErinnerung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchErinnerung: (id: string) => fetchErinnerung(id) as Promise<BillingApi.Erinnerungsdokument>,
  };
});

const { ReminderPrintPage } = await import('./ReminderPrintPage');

function dokument(
  rest: Partial<BillingApi.Erinnerungsdokument> = {},
): BillingApi.Erinnerungsdokument {
  return {
    id: 'e1',
    invoice_id: 'r1',
    invoice_number: 'RG-2026-0001',
    issued_on: '2026-08-20',
    invoice_due_on: '2026-09-03',
    reminder_on: '2026-09-10',
    due_on: '2026-09-24',
    outstanding_cents: 4500,
    currency: 'EUR',
    ...rest,
    document: rechnungsansicht().document,
  };
}

function zeige(): void {
  renderWithProviders(<ReminderPrintPage />, '/abrechnung/erinnerungen/e1');
}

describe('Zahlungserinnerung als Blatt', () => {
  beforeEach(() => {
    fetchErinnerung.mockReset();
  });

  it('heißt Zahlungserinnerung und nennt keine Stufe', async () => {
    // Eine Stufe ist eine Rechtsfolge mit eigenen Voraussetzungen; sie
    // entscheidet ABR-005, nicht dieses Blatt (ANN-080).
    fetchErinnerung.mockResolvedValue(dokument());
    zeige();

    expect(await screen.findByRole('heading', { name: 'Zahlungserinnerung' })).toBeInTheDocument();

    // Geprüft wird das Blatt, nicht der Hinweis daneben: Der erklärt der
    // Praxis gerade, dass dies KEINE Mahnung ist.
    const blatt = document.querySelector('article');
    expect(blatt?.textContent).not.toMatch(/Mahnung|Mahnstufe|Gebühr|Verzugszins/);
  });

  it('nennt die Person im Training nicht behandelt (TRN-008)', async () => {
    fetchErinnerung.mockResolvedValue({
      ...dokument({ invoice_number: 'TR-2026-0001' }),
      document: rechnungsansicht(
        {},
        {
          service_area: 'training',
          patient: { name: 'Tina Trainingskundin', date_of_birth: null },
          treatment_bases: [],
        },
      ).document,
    });
    zeige();

    expect(await screen.findByText('Leistung für')).toBeInTheDocument();
    expect(screen.queryByText('Behandelte Person')).not.toBeInTheDocument();
  });

  it('nennt Rechnung, alte Fälligkeit, offenen Betrag und neue Frist', async () => {
    fetchErinnerung.mockResolvedValue(dokument());
    zeige();

    expect(await screen.findByText(/RG-2026-0001 vom 20.08.2026/)).toBeInTheDocument();
    expect(screen.getByText(/am 03.09.2026 fällig/)).toBeInTheDocument();
    expect(screen.getByText(/bis zum 24.09.2026 aus/)).toBeInTheDocument();
    expect(screen.getAllByText('45,00 €').length).toBeGreaterThan(0);
  });

  it('zeigt den festgeschriebenen Betrag, nicht den heutigen', async () => {
    // Der Beleg trägt den Betrag seines Tages (ANN-080); was seitdem bezahlt
    // wurde, steht an der Rechnung.
    fetchErinnerung.mockResolvedValue(dokument({ outstanding_cents: 2500 }));
    zeige();

    expect(await screen.findAllByText('25,00 €')).not.toHaveLength(0);
    expect(screen.queryByText('45,00 €')).toBeNull();
  });

  it('nimmt die gekreuzte Zahlung vorweg', async () => {
    fetchErinnerung.mockResolvedValue(dokument());
    zeige();

    expect(await screen.findByText(/gekreuzt/)).toBeInTheDocument();
  });

  it('trägt Bankverbindung und Verwendungszweck', async () => {
    fetchErinnerung.mockResolvedValue(dokument());
    zeige();

    // ABR-28: in Vierergruppen, wie sie abgetippt wird.
    expect(await screen.findByText(/IBAN DE02 1203 0000 0000 2020 51/)).toBeInTheDocument();
    expect(
      screen.getByText(/Verwendungszweck die Rechnungsnummer RG-2026-0001/),
    ).toBeInTheDocument();
  });

  it('öffnet den Druckdialog des Browsers', async () => {
    const drucken = vi.fn();
    vi.stubGlobal('print', drucken);
    fetchErinnerung.mockResolvedValue(dokument());
    zeige();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Zahlungserinnerung drucken' }),
    );
    expect(drucken).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  describe('UXR-010', () => {
    function zeigeMitRoute() {
      return zeigeMitRouten(
        [{ path: '/abrechnung/erinnerungen/:reminderId', element: <ReminderPrintPage /> }],
        '/abrechnung/erinnerungen/e1',
      );
    }

    it('führt beim Ladefehler zu den Rechnungen, sonst zur Rechnung (ABR-30, ABR-33, WRT-01)', async () => {
      fetchErinnerung.mockRejectedValue(new Error('Netz weg'));
      zeigeMitRoute();

      expect(
        await screen.findByText('Bitte die Verbindung prüfen und erneut versuchen.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
      expect(screen.getByRole('link', { name: /Zurück zu den Rechnungen/ })).toHaveAttribute(
        'href',
        '/abrechnung',
      );
    });

    it('führt mit geladener Erinnerung zu ihrer Rechnung (ABR-33)', async () => {
      fetchErinnerung.mockResolvedValue(dokument());
      zeigeMitRoute();

      expect(await screen.findByRole('link', { name: /Zurück zur Rechnung/ })).toHaveAttribute(
        'href',
        '/abrechnung/rechnungen/r1',
      );
    });

    it('trägt denselben Briefkopf wie die Rechnung (ABR-22, ABR-B05, ABR-34)', async () => {
      fetchErinnerung.mockResolvedValue(dokument());
      zeige();

      expect(await screen.findByRole('heading', { name: 'Zahlungserinnerung' })).toHaveClass(
        'text-h4',
        'font-bold',
      );
      expect(screen.getByText('Behandelte Person')).toHaveClass('w-40', 'shrink-0');
      expect(screen.getByAltText('Own Motion').parentElement).toHaveClass('print:min-h-[33mm]');
      expect(screen.getByText(/Verwendungszweck die Rechnungsnummer/)).toHaveClass(
        'print:text-ink',
      );
    });
  });
});
