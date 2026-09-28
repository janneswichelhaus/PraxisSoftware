import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { zeigeMitRouten } from './testumgebung';

const fetchPraxisStammdaten = vi.fn();
const savePraxisStammdaten = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchPraxisStammdaten: () =>
      fetchPraxisStammdaten() as Promise<BillingApi.PraxisStammdaten | null>,
    savePraxisStammdaten: (...args: unknown[]) => savePraxisStammdaten(...args) as Promise<void>,
  };
});

const { PracticeProfilePage } = await import('./PracticeProfilePage');

function stammdaten(rest: Partial<BillingApi.PraxisStammdaten> = {}): BillingApi.PraxisStammdaten {
  return {
    legal_name: 'Test Praxis Tuebingen',
    street: 'Musterallee',
    house_number: '1',
    postal_code: '72070',
    city: 'Tuebingen',
    phone: null,
    email: null,
    tax_number: '86123/45678',
    vat_id: null,
    small_business: false,
    bank_name: null,
    account_holder: null,
    iban: 'DE02120300000000202051',
    bic: null,
    invoice_number_prefix: 'RG',
    training_invoice_number_prefix: 'TR',
    payment_term_days: 14,
    ...rest,
  };
}

describe('PracticeProfilePage', () => {
  beforeEach(() => {
    fetchPraxisStammdaten.mockReset();
    savePraxisStammdaten.mockReset();
    savePraxisStammdaten.mockResolvedValue(undefined);
  });

  it('zeigt dem Office die Angaben als Auskunft, ohne Formular (ANN-074)', async () => {
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['office'])} />,
      '/abrechnung/stammdaten',
    );

    expect(await screen.findByText('Test Praxis Tuebingen')).toBeInTheDocument();
    expect(screen.getByText('Regelbesteuerung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
  });

  it('sagt dem Office, dass ohne Stammdaten keine Rechnung entsteht', async () => {
    fetchPraxisStammdaten.mockResolvedValue(null);

    renderWithProviders(
      <PracticeProfilePage user={testUser(['office'])} />,
      '/abrechnung/stammdaten',
    );

    expect(await screen.findByText(/noch keine Praxisstammdaten erfasst/)).toBeInTheDocument();
  });

  it('belegt den Umsatzsteuerstatus nicht vor, wenn es noch keine Angabe gibt', async () => {
    fetchPraxisStammdaten.mockResolvedValue(null);

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const auswahl = await screen.findByLabelText(/Umsatzsteuerlicher Status/);
    expect(auswahl).toHaveValue('');
  });

  it('weist das Speichern ohne Umsatzsteuerstatus ab, statt ihn zu raten', async () => {
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const auswahl = await screen.findByLabelText(/Umsatzsteuerlicher Status/);
    await nutzer.selectOptions(auswahl, '');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    // ABR-20: Die Meldung steht am Feld, die Zusammenfassung nennt es.
    expect(auswahl).toHaveAttribute('aria-invalid', 'true');
    expect(auswahl).toHaveAccessibleDescription(/Bitte wählen\./);
    expect(screen.getByRole('alert')).toHaveTextContent('Umsatzsteuerlicher Status: Bitte wählen.');
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('weist eine unvollstaendige IBAN ab, bevor gespeichert wird', async () => {
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const iban = await screen.findByLabelText('IBAN *');
    await nutzer.clear(iban);
    await nutzer.type(iban, 'DE02');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(iban).toHaveAccessibleDescription('Bitte die vollständige IBAN eingeben.');
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('weist eine IBAN mit falscher Pruefziffer ab (R3-010)', async () => {
    // Vollständig, aber vertippt: Die Form stimmt, die Prüfziffer nicht. Der
    // Server weist dasselbe ab — hier fällt es auf, bevor die Nummer in den
    // Snapshot der nächsten Rechnung wandert.
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const iban = await screen.findByLabelText('IBAN *');
    await nutzer.clear(iban);
    await nutzer.type(iban, 'DE00123456780000000000');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(iban).toHaveAccessibleDescription('Die IBAN stimmt nicht – bitte die Ziffern prüfen.');
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('weist zwei gleiche Kuerzel der Rechnungsnummer ab (ABR-010)', async () => {
    // Zwei lückenlose Kreise mit demselben Kürzel ergäben dieselbe Nummer
    // zweimal (ADR-009 Punkt 17). Der Server weist dasselbe ab; hier fällt es
    // auf, bevor abgeschickt wird.
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const training = await screen.findByLabelText(/Kürzel der Rechnungsnummer \(Training\)/);
    await nutzer.clear(training);
    await nutzer.type(training, 'RG');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      screen.getByText('Die beiden Kürzel der Rechnungsnummer müssen sich unterscheiden.'),
    ).toBeInTheDocument();
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('speichert die Angaben und sagt, dass ausgestellte Rechnungen unberuehrt bleiben', async () => {
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten({ small_business: true }));

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const name = await screen.findByLabelText('Praxis *');
    await nutzer.clear(name);
    await nutzer.type(name, 'Praxis Neu');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    // Derselbe Aufruf wie bisher: alle Angaben, der Status als Wahrheitswert.
    expect(savePraxisStammdaten).toHaveBeenCalledWith({
      ...stammdaten({ small_business: true }),
      legal_name: 'Praxis Neu',
    });
    const meldung = await screen.findByText(/Ausgestellte Rechnungen bleiben davon unberührt/);
    // UIK-21: Erfolg mit Ton und Zeichen.
    expect(meldung).toHaveTextContent('✓');
    expect(meldung).toHaveClass('text-positiv');
  });

  describe('UXR-010', () => {
    it('heißt wie im Menü (ABR-26)', async () => {
      fetchPraxisStammdaten.mockResolvedValue(stammdaten());

      renderWithProviders(
        <PracticeProfilePage user={testUser(['owner'])} />,
        '/abrechnung/stammdaten',
      );

      expect(await screen.findByRole('heading', { name: 'Praxisstammdaten' })).toBeInTheDocument();
    });

    it('meldet alle fehlenden Angaben auf einmal, jede am Feld (ABR-20)', async () => {
      const nutzer = userEvent.setup();
      fetchPraxisStammdaten.mockResolvedValue(null);

      renderWithProviders(
        <PracticeProfilePage user={testUser(['owner'])} />,
        '/abrechnung/stammdaten',
      );

      await nutzer.click(await screen.findByRole('button', { name: 'Speichern' }));

      const zusammenfassung = screen.getByRole('alert');
      expect(zusammenfassung).toHaveFocus();
      for (const eintrag of [
        'Praxis: Bitte ausfüllen.',
        'Straße: Bitte ausfüllen.',
        'PLZ: Bitte ausfüllen.',
        'Ort: Bitte ausfüllen.',
        'Steuernummer: Bitte ausfüllen.',
        'Umsatzsteuerlicher Status: Bitte wählen.',
        'Bitte die vollständige IBAN eingeben.',
      ]) {
        expect(within(zusammenfassung).getByRole('link', { name: eintrag })).toBeInTheDocument();
      }
      expect(screen.getByLabelText('Praxis *')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Ort *')).toHaveAttribute('aria-invalid', 'true');
      expect(savePraxisStammdaten).not.toHaveBeenCalled();

      // Die nächste Eingabe am Feld nimmt seine Meldung zurück.
      await nutzer.type(screen.getByLabelText('Praxis *'), 'Praxis Neu');
      expect(screen.getByLabelText('Praxis *')).not.toHaveAttribute('aria-invalid');
    });

    it('markiert Pflichtfelder und öffnet die passende Tastatur (ABR-20, RSP-12)', async () => {
      fetchPraxisStammdaten.mockResolvedValue(stammdaten());

      renderWithProviders(
        <PracticeProfilePage user={testUser(['owner'])} />,
        '/abrechnung/stammdaten',
      );

      expect(
        await screen.findByText('Mit * markierte Felder sind erforderlich.'),
      ).toBeInTheDocument();
      const plz = screen.getByLabelText('PLZ *');
      expect(plz).toHaveAttribute('inputmode', 'numeric');
      expect(plz).toHaveAttribute('autocomplete', 'postal-code');
      expect(screen.getByLabelText('Telefon')).toHaveAttribute('type', 'tel');
      // Tastatur mit @, aber keine Prüfung des Browsers beim Absenden.
      expect(screen.getByLabelText('E-Mail')).toHaveAttribute('inputmode', 'email');
      expect(screen.getByLabelText('E-Mail')).not.toHaveAttribute('type', 'email');
      const iban = screen.getByLabelText('IBAN *');
      expect(iban).toHaveAttribute('autocapitalize', 'characters');
      expect(iban).toHaveAttribute('spellcheck', 'false');
    });

    it('nennt den Status kurz und die Folge im Hinweis (ABR-B07, WRT-14)', async () => {
      fetchPraxisStammdaten.mockResolvedValue(null);

      renderWithProviders(
        <PracticeProfilePage user={testUser(['owner'])} />,
        '/abrechnung/stammdaten',
      );

      const auswahl = await screen.findByLabelText(/Umsatzsteuerlicher Status/);
      expect([...auswahl.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
        'Bitte wählen …',
        'Kleinunternehmer:in (§ 19 UStG)',
        'Regelbesteuerung',
      ]);
      expect(auswahl).toHaveAccessibleDescription(
        /Bei Regelbesteuerung weist die Rechnung Umsatzsteuer aus, als Kleinunternehmer:in nicht\./,
      );
    });

    it('hält das Verlassen mit geänderten Angaben an - ohne Speicherweg (ABR-14, NAV-01)', async () => {
      const nutzer = userEvent.setup();
      fetchPraxisStammdaten.mockResolvedValue(stammdaten());

      const { router } = zeigeMitRouten(
        [
          {
            path: '/abrechnung/stammdaten',
            element: (
              <>
                <PracticeProfilePage user={testUser(['owner'])} />
                <Link to="/abrechnung">Rechnungen</Link>
              </>
            ),
          },
          { path: '/abrechnung', element: <p>Rechnungsliste</p> },
        ],
        '/abrechnung/stammdaten',
      );

      await nutzer.type(await screen.findByLabelText('Ort *'), ' Süd');
      await nutzer.click(screen.getByRole('link', { name: 'Rechnungen' }));

      const frage = await screen.findByRole('group', { name: 'Ungespeicherte Praxisstammdaten' });
      expect(
        within(frage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
      ).toBeInTheDocument();
      expect(within(frage).getByRole('button', { name: 'Hier bleiben' })).toBeInTheDocument();
      // Stammdaten kennen keinen Entwurf: kein „Speichern und weitergehen".
      expect(within(frage).queryByRole('button', { name: /Speichern/ })).toBeNull();
      expect(router.state.location.pathname).toBe('/abrechnung/stammdaten');
    });

    it('zeigt dem Office Status, IBAN und Rolle in der Form der Anwendung (ABR-18, ABR-28)', async () => {
      fetchPraxisStammdaten.mockResolvedValue(stammdaten({ small_business: true }));

      renderWithProviders(
        <PracticeProfilePage user={testUser(['office'])} />,
        '/abrechnung/stammdaten',
      );

      expect(await screen.findByText('Kleinunternehmer:in (§ 19 UStG)')).toBeInTheDocument();
      expect(screen.getByText('DE02 1203 0000 0000 2020 51')).toBeInTheDocument();
    });

    it('nennt dem Office die Rolle, die erfasst (ABR-18)', async () => {
      fetchPraxisStammdaten.mockResolvedValue(null);

      renderWithProviders(
        <PracticeProfilePage user={testUser(['office'])} />,
        '/abrechnung/stammdaten',
      );

      expect(
        await screen.findByText(/erfassen kann sie die Praxisinhaber:in\./),
      ).toBeInTheDocument();
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      fetchPraxisStammdaten.mockRejectedValue(new Error('Netz weg'));

      renderWithProviders(
        <PracticeProfilePage user={testUser(['owner'])} />,
        '/abrechnung/stammdaten',
      );

      expect(
        await screen.findByText('Die Praxisstammdaten konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
    });
  });
});
