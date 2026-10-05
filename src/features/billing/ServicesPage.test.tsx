import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchOffeneTermine = vi.fn();
const fetchLeistungen = vi.fn();
const fetchVorschlag = vi.fn();
const recordLeistungen = vi.fn();
const deleteLeistungen = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchOffeneTermine: () => fetchOffeneTermine() as Promise<BillingApi.OffenerTermin[]>,
    fetchLeistungen: () => fetchLeistungen() as Promise<BillingApi.Leistung[]>,
    fetchVorschlag: (id: string) => fetchVorschlag(id) as Promise<BillingApi.Vorschlag[]>,
    recordLeistungen: (...args: unknown[]) => recordLeistungen(...args) as Promise<void>,
    deleteLeistungen: (id: string) => deleteLeistungen(id) as Promise<void>,
  };
});

const { ServicesPage } = await import('./ServicesPage');
const { KeinKatalog, KeinTerminhonorar, KontingentAusgeschoepft } = await import('./api');

function termin(rest: Partial<BillingApi.OffenerTermin> = {}): BillingApi.OffenerTermin {
  return {
    appointment_id: 't1',
    patient_id: 'p1',
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-15',
    starts_at: '2026-09-15T08:00:00Z',
    status: 'documented',
    fee_basis: null,
    appointment_type: 'practice',
    suggestion_count: 1,
    ...rest,
  };
}

function vorschlag(rest: Partial<BillingApi.Vorschlag> = {}): BillingApi.Vorschlag {
  return {
    catalog_item_id: 'k1',
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    unit_price_cents: 4500,
    currency: 'EUR',
    service_area: 'therapy',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    suggested: true,
    in_session_fee: false,
    ...rest,
  };
}

function leistung(rest: Partial<BillingApi.Leistung> = {}): BillingApi.Leistung {
  return {
    id: 'l1',
    appointment_id: 't9',
    patient_id: 'p1',
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-10',
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    quantity: 1,
    unit_price_cents: 4500,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    status: 'billable',
    session_fee: false,
    ...rest,
  };
}

describe('ServicesPage', () => {
  beforeEach(() => {
    fetchOffeneTermine.mockReset();
    fetchLeistungen.mockReset();
    fetchVorschlag.mockReset();
    recordLeistungen.mockReset();
    deleteLeistungen.mockReset();
    fetchOffeneTermine.mockResolvedValue([]);
    fetchLeistungen.mockResolvedValue([]);
  });

  it('sagt, dass ohne finalisierte Dokumentation nicht abgerechnet wird', async () => {
    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    // ABR-26: „abgerechnet" statt „fakturiert".
    expect(
      await screen.findByText(/ohne finalisierte Dokumentation wird nicht abgerechnet/),
    ).toBeInTheDocument();
  });

  it('zeigt einen durchgefuehrten Trainingstermin mit seinem Bereich und ohne Grundlage (TRN-007)', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([
      termin({
        appointment_id: 'tr1',
        patient_id: null,
        training_relationship_id: 'v1',
        service_area: 'training',
        patient_name: 'Tina Training',
        status: 'completed',
        suggestion_count: 0,
      }),
    ]);
    fetchLeistungen.mockResolvedValue([
      leistung({
        appointment_id: 'tr0',
        patient_id: null,
        training_relationship_id: 'v1',
        service_area: 'training',
        patient_name: 'Tina Training',
        code: 'PT',
        label: 'Personal Training (Einzelstunde)',
        tax_treatment: 'taxable',
        tax_rate_permille: 190,
      }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    const karte = (await screen.findAllByText('Tina Training'))[0]!.closest('div')!;
    expect(within(karte).getByText('Training')).toBeInTheDocument();
    expect(within(karte).getByText('Durchgeführt')).toBeInTheDocument();
    expect(screen.queryByText('Dokumentiert')).not.toBeInTheDocument();

    // Zurücknehmen erwähnt keine Behandlungsgrundlage: Ein Trainingstermin hat keine.
    await nutzer.click(screen.getByRole('button', { name: 'Erfassung zurücknehmen' }));
    expect(
      await screen.findByText(/Alle Leistungen dieses Termins werden entfernt\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Behandlungsgrundlage/)).not.toBeInTheDocument();
  });

  it('unterscheidet einen dokumentierten Termin von einem Gebuehrenanlass', async () => {
    fetchOffeneTermine.mockResolvedValue([
      termin(),
      termin({
        appointment_id: 't2',
        fee_basis: 'late_cancellation',
        patient_name: 'Max Mustermann',
        suggestion_count: 0,
      }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    // TER-10: derselbe Anlass wie am Termin; ABR-16: eine Art, kein „!".
    // Der dokumentierte Termin trägt kein Abzeichen - er ist der Regelfall (UX-005i).
    const anlass = await screen.findByText('Absage weniger als 24 Stunden vorher');
    expect(screen.queryByText('Dokumentiert')).toBeNull();
    expect(anlass.textContent).toBe('Absage weniger als 24 Stunden vorher');
  });

  it('uebernimmt die Vorbelegung des Servers und erfasst die gewaehlten Positionen', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockResolvedValue([
      vorschlag(),
      vorschlag({
        catalog_item_id: 'k2',
        code: 'HB',
        label: 'Hausbesuchspauschale',
        suggested: false,
      }),
    ]);
    recordLeistungen.mockResolvedValue(undefined);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

    const kg = await screen.findByRole('checkbox', { name: /Krankengymnastik/ });
    const hb = screen.getByRole('checkbox', { name: /Hausbesuchspauschale/ });
    expect(kg).toBeChecked();
    expect(hb).not.toBeChecked();

    await nutzer.click(hb);
    await nutzer.click(screen.getByRole('button', { name: '2 Leistungen erfassen' }));

    expect(recordLeistungen).toHaveBeenCalledWith('t1', [
      { catalog_item_id: 'k1', quantity: 1 },
      { catalog_item_id: 'k2', quantity: 1 },
    ]);
  });

  it('nennt die Preisliste als fehlende Angabe, wenn es fuer den Tag keine gibt', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockRejectedValue(new KeinKatalog());

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

    expect(await screen.findByText(/keine Preisliste in Kraft/)).toBeInTheDocument();
  });

  it('erklaert eine ausgeschoepfte Leistungsmenge statt sie zu verschweigen', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockResolvedValue([vorschlag()]);
    recordLeistungen.mockRejectedValue(new KontingentAusgeschoepft());

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Eine Leistung erfassen' }));

    expect(
      await screen.findByText(/Leistungsmenge der Behandlungsgrundlage ist ausgeschöpft/),
    ).toBeInTheDocument();
  });

  it('fasst die Leistungen eines Termins mit ihrer Summe zusammen', async () => {
    fetchLeistungen.mockResolvedValue([
      leistung({ quantity: 2 }),
      leistung({ id: 'l2', code: 'HB', label: 'Hausbesuchspauschale', unit_price_cents: 1800 }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    // 2 × 45,00 € + 1 × 18,00 €
    expect(await screen.findByText('108,00 €')).toBeInTheDocument();
  });

  it('zeigt Heilmittel im Terminhonorar ohne eigenen Preis und mit Menge 1 (ABR-031)', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockResolvedValue([
      vorschlag({ in_session_fee: true }),
      vorschlag({
        catalog_item_id: 'k7',
        code: 'SZL',
        label: 'Selbstzahlerleistung',
        unit_price_cents: 6000,
        suggested: false,
      }),
    ]);
    recordLeistungen.mockResolvedValue(undefined);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');
    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

    expect(await screen.findByText('im Terminhonorar')).toBeInTheDocument();
    expect(screen.queryByText('45,00 €')).toBeNull();
    expect(screen.getByText('60,00 €')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Menge Krankengymnastik (KG)' })).toBeDisabled();

    await nutzer.click(screen.getByRole('button', { name: 'Eine Leistung erfassen' }));
    expect(recordLeistungen).toHaveBeenCalledWith('t1', [{ catalog_item_id: 'k1', quantity: 1 }]);
  });

  it('erklaert, wenn fuer den Tag kein Terminhonorar gilt (ABR-031)', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockResolvedValue([vorschlag({ in_session_fee: true })]);
    recordLeistungen.mockRejectedValue(new KeinTerminhonorar());

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');
    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Eine Leistung erfassen' }));

    expect(await screen.findByText(/Für diesen Tag gilt kein Terminhonorar/)).toBeInTheDocument();
  });

  it('kennzeichnet den Anteil am Terminhonorar in der Liste (ABR-031)', async () => {
    fetchLeistungen.mockResolvedValue([
      leistung({ unit_price_cents: 10000, session_fee: true }),
      leistung({
        id: 'l2',
        code: 'HB',
        label: 'Hausbesuchspauschale',
        unit_price_cents: 4000,
        session_fee: true,
      }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    expect(await screen.findByText('140,00 €')).toBeInTheDocument();
    expect(screen.getAllByText(/Anteil am Terminhonorar/)).toHaveLength(2);
  });

  it('nimmt eine Erfassung nach Rueckfrage zurueck', async () => {
    const nutzer = userEvent.setup();
    fetchLeistungen.mockResolvedValue([leistung()]);
    deleteLeistungen.mockResolvedValue(undefined);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Erfassung zurücknehmen' }));
    expect(
      screen.getByText(/genutzte Menge der Behandlungsgrundlage geht um denselben Betrag/),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));

    expect(deleteLeistungen).toHaveBeenCalledWith('t9');
  });

  it('bietet fuer eine abgerechnete Leistung kein Zuruecknehmen an', async () => {
    fetchLeistungen.mockResolvedValue([leistung({ status: 'invoiced' })]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    expect(await screen.findByText(/Storno und Neuausstellung/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Erfassung zurücknehmen' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt das Steuerkennzeichen an jeder erfassten Zeile', async () => {
    fetchLeistungen.mockResolvedValue([
      leistung({
        tax_treatment: 'not_taxable',
        item_kind: 'absence_fee',
        code: 'AUS',
        label: 'Ausfallhonorar',
      }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    const zeile = (await screen.findByText('(AUS)')).closest('li');
    expect(within(zeile!).getByText(/Nicht steuerbar/)).toBeInTheDocument();
    // Das Ausfallhonorar traegt daneben sein eigenes Kennzeichen: Es ist
    // keine Behandlung, und das soll man der Zeile ansehen.
    expect(within(zeile!).getAllByText('Ausfallhonorar').length).toBeGreaterThan(0);
  });

  describe('UXR-010', () => {
    async function oeffneErfassung(nutzer: ReturnType<typeof userEvent.setup>) {
      await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));
      return screen.findByLabelText('Menge Krankengymnastik (KG)');
    }

    it('lässt die Menge leeren und neu tippen - aus „3" wird nicht „13" (ABR-11)', async () => {
      const nutzer = userEvent.setup();
      fetchOffeneTermine.mockResolvedValue([termin()]);
      fetchVorschlag.mockResolvedValue([vorschlag()]);
      recordLeistungen.mockResolvedValue(undefined);

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      const menge = await oeffneErfassung(nutzer);
      await nutzer.clear(menge);
      expect(menge).toHaveValue('');
      await nutzer.type(menge, '3');
      expect(menge).toHaveValue('3');

      await nutzer.click(screen.getByRole('button', { name: 'Eine Leistung erfassen' }));
      // Derselbe Aufruf wie bisher, mit der getippten Menge.
      expect(recordLeistungen).toHaveBeenCalledWith('t1', [{ catalog_item_id: 'k1', quantity: 3 }]);
    });

    it('meldet eine Menge über 10 am Feld, statt sie abweisen zu lassen (ABR-11)', async () => {
      const nutzer = userEvent.setup();
      fetchOffeneTermine.mockResolvedValue([termin()]);
      fetchVorschlag.mockResolvedValue([vorschlag()]);

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      const menge = await oeffneErfassung(nutzer);
      await nutzer.clear(menge);
      await nutzer.type(menge, '12');
      await nutzer.click(screen.getByRole('button', { name: 'Eine Leistung erfassen' }));

      expect(menge).toHaveAttribute('aria-invalid', 'true');
      expect(menge).toHaveAccessibleDescription('Bitte eine Zahl von 1 bis 10 eingeben.');
      expect(menge).toHaveFocus();
      expect(recordLeistungen).not.toHaveBeenCalled();

      // Leer ist ebenso wenig eine Menge.
      await nutzer.clear(menge);
      expect(menge).not.toHaveAttribute('aria-invalid');
      await nutzer.click(screen.getByRole('button', { name: 'Eine Leistung erfassen' }));
      expect(menge).toHaveAttribute('aria-invalid', 'true');
      expect(recordLeistungen).not.toHaveBeenCalled();
    });

    it('zeigt den Laufzustand beim Erfassen (ZST-20)', async () => {
      const nutzer = userEvent.setup();
      fetchOffeneTermine.mockResolvedValue([termin()]);
      fetchVorschlag.mockResolvedValue([vorschlag()]);
      recordLeistungen.mockReturnValue(new Promise(() => undefined));

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      await oeffneErfassung(nutzer);
      await nutzer.click(screen.getByRole('button', { name: 'Eine Leistung erfassen' }));

      expect(await screen.findByRole('button', { name: 'Wird erfasst …' })).toBeDisabled();
    });

    it('erklärt, wenn die Preisliste für den Termin keine Position bietet (ABR-30)', async () => {
      const nutzer = userEvent.setup();
      fetchOffeneTermine.mockResolvedValue([termin()]);
      fetchVorschlag.mockResolvedValue([]);

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

      expect(
        await screen.findByText('Die geltende Preisliste bietet für diesen Termin keine Position.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /0 Leistungen erfassen/ })).toBeNull();
    });

    it('führt bei fehlender Preisliste zum Katalog (ABR-17)', async () => {
      const nutzer = userEvent.setup();
      fetchOffeneTermine.mockResolvedValue([termin()]);
      fetchVorschlag.mockRejectedValue(new KeinKatalog());

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

      expect(
        await screen.findByText(/Preislisten legt die Praxisinhaber:in an/),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Zum Leistungskatalog' })).toHaveAttribute(
        'href',
        '/abrechnung/katalog',
      );
    });

    it('führt bei ausgeschöpfter Menge zur Akte und nennt, wer sie erhöht (ABR-17)', async () => {
      const nutzer = userEvent.setup();
      fetchOffeneTermine.mockResolvedValue([termin()]);
      fetchVorschlag.mockResolvedValue([vorschlag()]);
      recordLeistungen.mockRejectedValue(new KontingentAusgeschoepft());

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      await oeffneErfassung(nutzer);
      await nutzer.click(screen.getByRole('button', { name: 'Eine Leistung erfassen' }));

      expect(
        await screen.findByText(/Therapeut:in oder Praxisinhaber:in erhöht die Menge/),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Zu den Behandlungsgrundlagen' })).toHaveAttribute(
        'href',
        '/patienten/p1/verordnungen?zurueck=%2Fabrechnung%2Fleistungen',
      );
    });

    it('trennt noch nicht Abgerechnetes vom Abgerechneten (ABR-27)', async () => {
      fetchLeistungen.mockResolvedValue([
        leistung(),
        leistung({
          id: 'l2',
          appointment_id: 't8',
          patient_name: 'Max Mustermann',
          status: 'invoiced',
        }),
      ]);

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      // Offen: mit Zurücknehmen, sichtbar.
      expect(
        await screen.findByRole('button', { name: 'Erfassung zurücknehmen' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Noch nicht abgerechnet.')).toBeInTheDocument();
      // Abgerechnet: eingeklappt darunter.
      const abgerechnet = screen.getByText('Max Mustermann').closest('details');
      expect(abgerechnet).not.toBeNull();
      expect(abgerechnet).not.toHaveAttribute('open');
      expect(within(abgerechnet!).getByText('Abgerechnet (1 Termin)')).toBeInTheDocument();
      expect(screen.getByText('Erika Beispiel').closest('details')).toBeNull();
    });

    it('zeigt eine Abweisung beim Zurücknehmen im offenen Kasten, samt Weg (ABR-03, ABR-B02)', async () => {
      const nutzer = userEvent.setup();
      fetchLeistungen.mockResolvedValue([leistung()]);
      deleteLeistungen.mockRejectedValue(
        new Error('Die Erfassung konnte nicht zurückgenommen werden.'),
      );

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      await nutzer.click(await screen.findByRole('button', { name: 'Erfassung zurücknehmen' }));
      await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));

      const meldung = await screen.findByRole('alert');
      expect(meldung).toHaveTextContent(/konnte nicht zurückgenommen werden/);
      expect(meldung).toHaveTextContent(/erst den Entwurf verwerfen/);
      expect(screen.getByRole('group', { name: 'Erfassung zurücknehmen' })).toBeInTheDocument();
    });

    it('stellt offene Termine als Karten mit Kartenaktion dar (ABR-24, ABR-33)', async () => {
      fetchOffeneTermine.mockResolvedValue([termin()]);

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      const knopf = await screen.findByRole('button', { name: 'Leistungen erfassen' });
      expect(knopf.className.split(/\s+/)).not.toContain('bg-accent');
      expect(knopf.closest('.rounded-card')).toHaveClass('bg-surface');
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      fetchOffeneTermine.mockRejectedValue(new Error('Netz weg'));

      renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

      expect(
        await screen.findByText('Die offenen Termine konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
    });
  });
});
