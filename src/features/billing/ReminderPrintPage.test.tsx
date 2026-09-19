import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';
import { rechnungsansicht } from './testdaten';

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

    expect(await screen.findByText(/DE02120300000000202051/)).toBeInTheDocument();
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
});
