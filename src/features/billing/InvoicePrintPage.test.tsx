import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { KeineStammdaten } from './api';
import { renderWithProviders } from '@/test-utils';
import { rechnungsansicht } from './testdaten';
import { zeigeMitRouten } from './testumgebung';

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
function ausgestellt(
  dokument: Partial<BillingApi.Rechnungsdokument> = {},
): BillingApi.Rechnungsansicht {
  return rechnungsansicht(
    {
      status: 'issued',
      invoice_number: 'RG-2026-0001',
      issued_on: '2026-09-01',
      due_on: '2026-09-15',
    },
    { invoice_number: 'RG-2026-0001', issued_on: '2026-09-01', due_on: '2026-09-15', ...dokument },
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
    // ABR-28: in Vierergruppen, wie sie abgetippt wird.
    expect(screen.getByText(/IBAN DE02 1203 0000 0000 2020 51/)).toBeInTheDocument();
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

  it('nennt im Training die Person nicht behandelt und das Kürzel TR (TRN-008)', async () => {
    fetchRechnung.mockResolvedValue(
      rechnungsansicht(
        {
          status: 'issued',
          patient_id: null,
          invoice_number: 'TR-2026-0001',
          issued_on: '2026-09-01',
        },
        {
          service_area: 'training',
          patient: { name: 'Tina Trainingskundin', date_of_birth: null },
          treatment_bases: [],
        },
      ),
    );
    zeige();

    expect(await screen.findByText('TR-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Leistung für')).toBeInTheDocument();
    expect(screen.queryByText('Behandelte Person')).not.toBeInTheDocument();
    expect(screen.queryByText(/Geburtsdatum/)).not.toBeInTheDocument();
  });

  it('weist die Leistungen mit Datum, Menge und Betrag aus', async () => {
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(await screen.findByText(/Krankengymnastik \(KG\)/)).toBeInTheDocument();
    expect(screen.getByText('03.08.2026')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Gesamtbetrag' })).toBeInTheDocument();
    expect(screen.getAllByText('45,00 €').length).toBeGreaterThan(0);
  });

  it('nennt die Behandlungsgrundlage - ein Snapshot vor schema_version 4 ohne Diagnose', async () => {
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(
      await screen.findByText(/Erstverordnung vom 01.07.2026 · Dr. Fiktiv Beispiel/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Diagnose:/)).not.toBeInTheDocument();
  });

  it('nennt seit schema_version 4 die Diagnose der Verordnung (ANN-228)', async () => {
    fetchRechnung.mockResolvedValue(
      ausgestellt({
        schema_version: 4,
        treatment_bases: [
          {
            kind: 'first',
            issued_on: '2026-07-01',
            prescriber: 'Dr. Fiktiv Beispiel',
            diagnosis_icd10: 'M54.2',
            diagnosis: 'Synthetisch: Zervikalsyndrom.',
          },
        ],
      }),
    );
    zeige();

    expect(
      await screen.findByText('Diagnose: M54.2 Synthetisch: Zervikalsyndrom.'),
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

  it('nennt den Grund der Steuerbefreiung an der steuerfreien Gruppe (BEF-019)', async () => {
    // Pflichtangabe nach § 14 Abs. 4 Nr. 8 UStG (ADR-009 Punkt 18): Sie fehlte
    // bis ABR-006 auf jeder Rechnung mit einer Heilbehandlung. Der Satz kommt
    // aus dem Dokument — erzeugte ihn die Seite, stünde er nicht im Snapshot.
    fetchRechnung.mockResolvedValue(ausgestellt());
    zeige();

    expect(
      await screen.findByText(/Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG/),
    ).toBeInTheDocument();
  });

  it('nennt an einer steuerpflichtigen Gruppe keinen Befreiungsgrund', async () => {
    // Dort steht die Steuer selbst; ein Befreiungsgrund daneben wäre falsch.
    fetchRechnung.mockResolvedValue(
      rechnungsansicht(
        { status: 'issued', invoice_number: 'RG-2026-0004', issued_on: '2026-09-01' },
        {
          tax_groups: [
            {
              tax_treatment: 'taxable',
              tax_rate_permille: 190,
              exemption_reason: null,
              gross_cents: 6000,
              tax_cents: 958,
              net_cents: 5042,
            },
          ],
          totals: { total_cents: 6000, tax_total_cents: 958 },
        },
      ),
    );
    zeige();

    expect(await screen.findByText(/darin enthaltene Umsatzsteuer/)).toBeInTheDocument();
    expect(screen.queryByText(/Buchstabe a UStG/)).not.toBeInTheDocument();
  });

  it('stempelt den Entwurf als Entwurf — auch auf Papier', async () => {
    // Ein ausgedruckter Entwurf darf nicht wie eine Rechnung aussehen. Der
    // Vermerk steht deshalb im Blatt und nicht in `.nicht-drucken`.
    fetchRechnung.mockResolvedValue(rechnungsansicht());
    zeige();

    const vermerk = await screen.findByText(/Entwurf – keine Rechnung/);
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

    expect(await screen.findByText(/keine Praxisstammdaten/)).toBeInTheDocument();
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

  describe('UXR-010', () => {
    /** Mit der echten Route: Der Rückweg kennt dann die Kennung der Rechnung. */
    function zeigeMitRoute() {
      return zeigeMitRouten(
        [{ path: '/abrechnung/rechnungen/:invoiceId/druck', element: <InvoicePrintPage /> }],
        '/abrechnung/rechnungen/r1/druck',
      );
    }

    it('führt schon beim Laden zurück zur Rechnung, mit dem Baustein (ABR-30, ABR-33)', async () => {
      fetchRechnung.mockReturnValue(new Promise(() => undefined));
      zeigeMitRoute();

      expect(await screen.findByText('Rechnung wird geladen …')).toBeInTheDocument();
      const zurueck = screen.getByRole('link', { name: /Zurück zur Rechnung/ });
      expect(zurueck).toHaveAttribute('href', '/abrechnung/rechnungen/r1');
      expect(zurueck.closest('.nicht-drucken')).not.toBeNull();
    });

    it('führt bei fehlenden Stammdaten dorthin und zurück (ABR-17, ABR-30)', async () => {
      fetchRechnung.mockRejectedValue(new KeineStammdaten());
      zeigeMitRoute();

      expect(await screen.findByRole('link', { name: 'Zu den Praxisstammdaten' })).toHaveAttribute(
        'href',
        '/abrechnung/stammdaten',
      );
      expect(screen.getByText(/Erfassen kann sie die Praxisinhaber:in/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Zurück zur Rechnung/ })).toBeInTheDocument();
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      fetchRechnung.mockRejectedValue(new Error('Netz weg'));
      zeige();

      expect(
        await screen.findByText('Bitte die Verbindung prüfen und erneut versuchen.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
    });

    it('legt die Anschrift ins Fenster des Umschlags (ABR-22)', async () => {
      // DIN 5008 Form B, Fenster links: 20 mm vom Rand (12 mm Seitenrand plus
      // 8 mm), 45 mm von oben (33 mm Kopf), 85 × 45 mm. Nur im Druck.
      fetchRechnung.mockResolvedValue(ausgestellt());
      zeige();

      const anschrift = (await screen.findByText('Erika Beispiel', { selector: 'span' })).closest(
        'address',
      )!.parentElement!;
      expect(anschrift).toHaveClass('print:ml-[8mm]', 'print:w-[85mm]', 'print:min-h-[45mm]');
      const kopf = screen.getByAltText('Own Motion').parentElement!;
      expect(kopf).toHaveClass('print:min-h-[33mm]');
      // Die Angaben rechts beginnen bei 125 mm und brechen nicht unter die Anschrift.
      expect(screen.getByText('Rechnungsnummer').closest('dl')!.parentElement).toHaveClass(
        'print:w-[73mm]',
        'print:ml-auto',
      );
    });

    it('stellt den Entwurfsvermerk unter das Anschriftfeld (ABR-22)', async () => {
      fetchRechnung.mockResolvedValue(rechnungsansicht());
      zeige();

      const vermerk = await screen.findByText(/Entwurf – keine Rechnung/);
      const empfaenger = screen.getByText('Erika Beispiel', { selector: 'address span' });
      expect(
        empfaenger.compareDocumentPosition(vermerk) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Und der Knopf heißt, was er druckt (ABR-26).
      expect(screen.getByRole('button', { name: 'Entwurf drucken' })).toBeInTheDocument();
    });

    it('hält die Wertespalte bei langen Namen und druckt Werte schwarz (ABR-B05, ABR-28)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      zeige();

      const beschriftung = await screen.findByText('Behandelte Person');
      expect(beschriftung).toHaveClass('w-40', 'shrink-0');
      expect(screen.getByText(/Bitte überweisen Sie den Betrag/)).toHaveClass('print:text-ink');
      expect(
        screen.getByText(/Steuerfreie Heilbehandlung nach § 4 Nr. 14/).closest('ul'),
      ).toHaveClass('print:text-ink');
    });

    it('macht die Leistungstabelle mit der Tastatur erreichbar (ABR-B04, UIK-24)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      zeige();

      const rahmen = await screen.findByRole('region', { name: 'Leistungen, waagerecht rollbar' });
      expect(rahmen).toHaveAttribute('tabindex', '0');
      expect(rahmen).toHaveClass('overflow-x-auto');
    });

    it('setzt die Überschrift in der Stufe H4 der Skala (ABR-34)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      zeige();

      expect(await screen.findByRole('heading', { name: 'Rechnung RG-2026-0001' })).toHaveClass(
        'text-h4',
        'font-bold',
      );
    });

    it('nennt im Kleingedruckten weder Projektkürzel noch „Datensatz" (ABR-26, WRT-02, WRT-03)', async () => {
      fetchRechnung.mockResolvedValue(ausgestellt());
      zeige();

      const hinweis = await screen.findByText(/legt sie nicht ab/);
      expect(hinweis.textContent).not.toMatch(/B14|Datensatz/);
      expect(hinweis.textContent).toMatch(/in der Anwendung/);
    });

    it('nennt die Grundlage mit den Wörtern der Akte (ABR-18)', async () => {
      fetchRechnung.mockResolvedValue(
        rechnungsansicht(
          { status: 'issued', invoice_number: 'RG-2026-0009' },
          { treatment_bases: [{ kind: 'self_pay', issued_on: '2026-09-03', prescriber: null }] },
        ),
      );
      zeige();

      expect(await screen.findByText('Selbstzahler seit 03.09.2026')).toBeInTheDocument();
      expect(screen.queryByText(/Selbstzahlerin/)).toBeNull();
    });
  });
});
