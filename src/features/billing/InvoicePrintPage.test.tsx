import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { KeineStammdaten } from './api';
import { renderWithProviders } from '@/test-utils';
import { rechnungsansicht } from './testdaten';

const fetchRechnung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchRechnung: (id: string) => fetchRechnung(id) as Promise<BillingApi.Rechnungsansicht>,
  };
});

const { InvoicePrintPage } = await import('./InvoicePrintPage');

/** Die ausgestellte Fassung desselben Dokuments. */
function ausgestellt(): BillingApi.Rechnungsansicht {
  return rechnungsansicht(
    {
      status: 'issued',
      invoice_number: 'RG-2026-0001',
      issued_on: '2026-09-01',
      due_on: '2026-09-15',
    },
    { invoice_number: 'RG-2026-0001', issued_on: '2026-09-01', due_on: '2026-09-15' },
  );
}

function zeige(): void {
  renderWithProviders(<InvoicePrintPage />, '/abrechnung/rechnungen/r1/druck');
}

describe('Rechnungsblatt', () => {
  beforeEach(() => {
    fetchRechnung.mockReset();
  });

  it('trägt Nummer, Datum und die Pflichtangaben des Absenders', async () => {
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(
      await screen.findByRole('heading', { name: 'Rechnung RG-2026-0001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('01.09.2026')).toBeInTheDocument();
    expect(screen.getByText('86123/45678')).toBeInTheDocument();
    expect(screen.getByText(/DE02120300000000202051/)).toBeInTheDocument();
  });

  it('zeigt die Marke in der schwarzen Fassung — Rechnung ist genau ihr Fall', async () => {
    // `marke/README.md`: Schwarz steht „ausschließlich Rechnung und Fax".
    // Umgefärbt wird nie, deshalb die eigene Datei statt einer Filterregel.
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    const marke = await screen.findByAltText('Own Motion');
    expect(marke).toHaveAttribute('src', '/marke/own-motion-block-schwarz.svg');
    // 14 mm laut Markenregel, bei 96 dpi also 53 px.
    expect(marke).toHaveAttribute('height', '53');
  });

  it('nennt Empfänger und behandelte Person getrennt', async () => {
    // ADR-009 Punkt 2: Wer zahlt, ist nicht notwendig, wer behandelt wurde.
    fetchRechnung.mockResolvedValue(
      rechnungsansicht(
        { status: 'issued', invoice_number: 'RG-2026-0002', issued_on: '2026-09-01' },
        {
          recipient: {
            kind: 'aid_authority',
            name: 'Beihilfestelle Beispielland',
            street: 'Amtsweg',
            house_number: '3',
            postal_code: '70173',
            city: 'Beispielstadt',
            reference: 'AZ 4711',
          },
        },
      ),
    );
    zeige();

    expect(await screen.findByText('Beihilfestelle Beispielland')).toBeInTheDocument();
    expect(screen.getByText(/Aktenzeichen: AZ 4711/)).toBeInTheDocument();
    expect(screen.getByText('Erika Beispiel')).toBeInTheDocument();
  });

  it('weist die Leistungen mit Datum, Menge und Betrag aus', async () => {
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(await screen.findByText(/Krankengymnastik \(KG\)/)).toBeInTheDocument();
    expect(screen.getByText('03.08.2026')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Gesamtbetrag' })).toBeInTheDocument();
    expect(screen.getAllByText('45,00 €').length).toBeGreaterThan(0);
  });

  it('nennt die Behandlungsgrundlage ohne Diagnose', async () => {
    // Die Rechnung geht regelmäßig an Dritte; klinische Inhalte gehören nicht
    // dorthin (ADR-004 Fassung 2). Der Server liefert sie gar nicht erst.
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(
      await screen.findByText(/Erstverordnung vom 01.07.2026 · Dr. Fiktiv Beispiel/),
    ).toBeInTheDocument();
  });

  it('nennt Frist und Verwendungszweck', async () => {
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(await screen.findByText(/bis zum 15.09.2026 ohne Abzug/)).toBeInTheDocument();
    expect(
      screen.getByText(/Verwendungszweck die Rechnungsnummer RG-2026-0001/),
    ).toBeInTheDocument();
  });

  it('setzt den Hinweis nach § 19 UStG statt eines Steuerausweises', async () => {
    fetchRechnung.mockResolvedValue(
      rechnungsansicht(
        { status: 'issued', invoice_number: 'RG-2026-0003', issued_on: '2026-09-01' },
        {
          issuer: {
            ...rechnungsansicht().document.issuer,
            small_business: true,
          },
        },
      ),
    );
    zeige();

    expect(await screen.findByText(/§ 19 UStG/)).toBeInTheDocument();
  });

  it('stempelt den Entwurf als Entwurf — auch auf Papier', async () => {
    // Ein ausgedruckter Entwurf darf nicht wie eine Rechnung aussehen. Der
    // Vermerk steht deshalb im Blatt und nicht in `.nicht-drucken`.
    fetchRechnung.mockResolvedValue(rechnungsansicht());
    zeige();

    const vermerk = await screen.findByText(/Entwurf — keine Rechnung/);
    expect(vermerk).toBeInTheDocument();
    expect(vermerk.closest('.nicht-drucken')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rechnungsentwurf' })).toBeInTheDocument();
  });

  it('sagt, dass die Anwendung die gedruckte Datei nicht behält', async () => {
    // Der Preis von Weg 1 steht auf der Seite, nicht nur in der Entscheidung
    // (B14): ADR-009 Punkt 11 ist damit nicht erfüllt.
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(await screen.findByText(/legt sie nicht ab/)).toBeInTheDocument();
  });

  it('öffnet den Druckdialog des Browsers', async () => {
    const drucken = vi.fn();
    vi.stubGlobal('print', drucken);
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Rechnung drucken' }));
    expect(drucken).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sagt es, wenn die Praxis-Stammdaten fehlen', async () => {
    fetchRechnung.mockRejectedValue(new KeineStammdaten());
    zeige();

    expect(await screen.findByText(/keine Praxis-Stammdaten/)).toBeInTheDocument();
  });

  it('stempelt eine stornierte Rechnung — auch auf Papier', async () => {
    // Ein Nachdruck darf nicht wie eine gültige Forderung aussehen
    // (ABR-003c). Das Stornodokument selbst ist ein eigenes Blatt.
    fetchRechnung.mockResolvedValue(
      rechnungsansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        cancellation: {
          cancellation_number: 'RG-2026-0002',
          reason: 'Falscher Empfänger',
          cancelled_on: '2026-09-18',
        },
      }),
    );
    zeige();

    const stempel = await screen.findByText(/Storniert am 18.09.2026/);
    expect(stempel).toBeInTheDocument();
    expect(stempel.closest('.nicht-drucken')).toBeNull();
  });

  it('nennt auf der Korrekturrechnung die Rechnung, die sie ersetzt', async () => {
    fetchRechnung.mockResolvedValue(
      rechnungsansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0003',
        replaces_invoice_id: 'r0',
        replaces_invoice_number: 'RG-2026-0001',
      }),
    );
    zeige();

    expect(
      await screen.findByText(/Korrekturrechnung zur stornierten Rechnung RG-2026-0001/),
    ).toBeInTheDocument();
  });
});
