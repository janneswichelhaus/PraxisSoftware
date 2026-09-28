import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { zeigeMitRouten } from './testumgebung';

const fetchKatalogVersionen = vi.fn();
const fetchKatalogPositionen = vi.fn();
const createKatalogVersion = vi.fn();
const writeKatalogPositionen = vi.fn();
const publishKatalogVersion = vi.fn();
const deleteKatalogVersion = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchKatalogVersionen: () => fetchKatalogVersionen() as Promise<BillingApi.KatalogVersion[]>,
    fetchKatalogPositionen: (id: string) =>
      fetchKatalogPositionen(id) as Promise<BillingApi.KatalogPosition[]>,
    createKatalogVersion: (...args: unknown[]) => createKatalogVersion(...args) as Promise<string>,
    writeKatalogPositionen: (...args: unknown[]) =>
      writeKatalogPositionen(...args) as Promise<void>,
    publishKatalogVersion: (id: string) => publishKatalogVersion(id) as Promise<void>,
    deleteKatalogVersion: (id: string) => deleteKatalogVersion(id) as Promise<void>,
  };
});

const { CatalogPage } = await import('./CatalogPage');

function version(
  id: string,
  rest: Partial<BillingApi.KatalogVersion> = {},
): BillingApi.KatalogVersion {
  return {
    id,
    label: 'Preisliste 2026',
    valid_from: '2026-01-01',
    published_at: '2025-12-20T08:00:00Z',
    ...rest,
  };
}

function position(
  id: string,
  rest: Partial<BillingApi.KatalogPosition> = {},
): BillingApi.KatalogPosition {
  return {
    id,
    catalog_version_id: 'v1',
    sort_order: 1,
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    remedy: 'Krankengymnastik',
    unit_price_cents: 4500,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
    ...rest,
  };
}

describe('CatalogPage', () => {
  beforeEach(() => {
    fetchKatalogVersionen.mockReset();
    fetchKatalogPositionen.mockReset();
    createKatalogVersion.mockReset();
    writeKatalogPositionen.mockReset();
    publishKatalogVersion.mockReset();
    deleteKatalogVersion.mockReset();
    fetchKatalogPositionen.mockResolvedValue([position('p1')]);
  });

  it('nennt Preis und Steuerkennzeichen je Position', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('v1')]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    expect(await screen.findByText('45,00 €')).toBeInTheDocument();
    expect(screen.getByText(/Heilbehandlung, umsatzsteuerfrei/)).toBeInTheDocument();
    // Seit ABR-008 steht der Leistungsbereich an der Position (ADR-009 Punkt 16).
    expect(screen.getByText(/^Behandlung ·/)).toBeInTheDocument();
  });

  it('zeigt eine in Kraft gesetzte Preisliste ohne jede Schaltflaeche zum Aendern', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('v1')]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    expect(await screen.findByText('45,00 €')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf speichern' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In Kraft setzen' })).not.toBeInTheDocument();
    expect(screen.getByText(/unveränderlich/)).toBeInTheDocument();
  });

  it('macht einen Entwurf bearbeitbar und setzt ihn in Kraft', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([
      version('v2', { published_at: null, label: 'Entwurf 2027' }),
    ]);
    publishKatalogVersion.mockResolvedValue(undefined);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    expect(await screen.findByRole('button', { name: 'Entwurf speichern' })).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'In Kraft setzen' }));
    // Die Rueckfrage sagt, was unumkehrbar wird, bevor sie es tut.
    expect(screen.getByText(/unveränderlich/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'In Kraft setzen' }));

    expect(publishKatalogVersion).toHaveBeenCalledWith('v2');
  });

  it('setzt nichts in Kraft, solange Zeilen ungespeichert sind (R3-007)', async () => {
    // Veroeffentlicht wird der Serverstand. Eine im Formular geaenderte Zeile
    // waere dabei still verloren - und die Liste danach unveraenderlich.
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const preis = await screen.findByLabelText(/Preis/);
    await nutzer.clear(preis);
    await nutzer.type(preis, '99,00');

    expect(screen.getByRole('button', { name: 'In Kraft setzen' })).toBeDisabled();
    expect(screen.getByText(/ungespeicherte Änderungen/)).toBeInTheDocument();
    expect(publishKatalogVersion).not.toHaveBeenCalled();
  });

  it('setzt nach dem Speichern wieder in Kraft (R3-007)', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);
    writeKatalogPositionen.mockResolvedValue(undefined);
    publishKatalogVersion.mockResolvedValue(undefined);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const preis = await screen.findByLabelText(/Preis/);
    await nutzer.clear(preis);
    await nutzer.type(preis, '99,00');

    // Nach dem Speichern liefert der Server den gespeicherten Stand - genau
    // das macht den Unterschied zwischen "ungespeichert" und "gleich".
    fetchKatalogPositionen.mockResolvedValue([position('p1', { unit_price_cents: 9900 })]);
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    expect(await screen.findByText('Entwurf gespeichert.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In Kraft setzen' })).toBeEnabled();
  });

  it('speichert den Leistungsbereich mit der Position (ABR-008)', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);
    writeKatalogPositionen.mockResolvedValue(undefined);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    await nutzer.selectOptions(await screen.findByLabelText(/Bereich/), 'training');
    // Training ist keine Heilbehandlung (ADR-021); die Zeile sagt es, bevor
    // der Server sie abweist.
    expect(screen.getByText(/nicht umsatzsteuerfrei/)).toBeInTheDocument();

    await nutzer.selectOptions(screen.getByLabelText(/Steuer/), 'taxable');
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    expect(writeKatalogPositionen).toHaveBeenCalledWith('v2', [
      expect.objectContaining({ service_area: 'training', tax_treatment: 'taxable' }),
    ]);
  });

  it('weist eine Position ohne gueltigen Preis zurueck, bevor gespeichert wird', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const preis = await screen.findByLabelText(/Preis/);
    await nutzer.clear(preis);
    await nutzer.type(preis, 'viel');

    // ABR-21: kein Alarm beim Tippen; der Tipp auf „Entwurf speichern" zeigt,
    // was fehlt und wo - gespeichert wird weiterhin nicht.
    expect(screen.queryByRole('alert')).toBeNull();
    const speichern = screen.getByRole('button', { name: 'Entwurf speichern' });
    expect(speichern).toBeEnabled();
    await nutzer.click(speichern);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Position 1, Preis: Bitte einen Preis wie 45,00 eingeben.',
    );
    expect(preis).toHaveAttribute('aria-invalid', 'true');
    expect(preis).toHaveAccessibleDescription(/Bitte einen Preis wie 45,00 eingeben\./);
    expect(writeKatalogPositionen).not.toHaveBeenCalled();
  });

  it('bietet dem Office keine Pflege an - die Grenze zieht der Server', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);

    renderWithProviders(<CatalogPage user={testUser(['office'])} />, '/abrechnung/katalog');

    expect(await screen.findByText('45,00 €')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neue Preisliste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf speichern' })).not.toBeInTheDocument();
  });

  it('belegt „Gültig ab" mit dem Praxistag, nicht mit dem UTC-Tag (R3-006)', async () => {
    // Zwischen Mitternacht und 01:00/02:00 Praxiszeit ist in UTC noch der
    // Vortag. Vorbelegt wurde bisher der UTC-Tag - und genau so gespeichert,
    // weil niemand das Feld anfasst, wenn es schon gefüllt aussieht.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-15T22:30:00Z')); // Berlin: 16.06., 00:30
    try {
      const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fetchKatalogVersionen.mockResolvedValue([version('v1')]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'Neue Preisliste' }));

      expect(screen.getByLabelText(/Gültig ab/)).toHaveValue('2026-06-16');
    } finally {
      vi.useRealTimers();
    }
  });

  it('legt eine neue Preisliste als Kopie der geltenden an', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v1')]);
    createKatalogVersion.mockResolvedValue('v9');

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    await nutzer.click(await screen.findByRole('button', { name: 'Neue Preisliste' }));
    await nutzer.type(screen.getByLabelText(/Bezeichnung/), 'Preisliste 2027');
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf anlegen' }));

    expect(createKatalogVersion).toHaveBeenCalledWith('Preisliste 2027', expect.any(String), 'v1');
  });

  it('sagt, dass ohne Preisliste keine Leistung erfasst werden kann', async () => {
    fetchKatalogVersionen.mockResolvedValue([]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const leer = await screen.findByText('Noch keine Preisliste');
    expect(leer).toBeInTheDocument();
    expect(screen.getByText(/lässt sich keine Leistung erfassen/)).toBeInTheDocument();
  });

  it('trennt Entwurf und geltende Liste sichtbar', async () => {
    fetchKatalogVersionen.mockResolvedValue([
      version('v2', { published_at: null, label: 'Preisliste 2027', valid_from: '2027-01-01' }),
      version('v1'),
    ]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const liste = await screen.findByRole('list');
    expect(within(liste).getByText('Entwurf')).toBeInTheDocument();
    expect(within(liste).getByText('In Kraft')).toBeInTheDocument();
  });

  describe('UXR-010', () => {
    const entwurf = () => version('v2', { published_at: null, label: 'Entwurf 2027' });

    it('gilt nach dem Speichern von „50" als gespeichert (ABR-04)', async () => {
      // Der Server legt 5000 Cent ab; das Formular zeigt weiter „50". Beides
      // ist derselbe Preis - „In Kraft setzen" wird frei.
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);
      writeKatalogPositionen.mockResolvedValue(undefined);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      const preis = await screen.findByLabelText(/Preis/);
      await nutzer.clear(preis);
      await nutzer.type(preis, '50');
      expect(screen.getByText(/ungespeicherte Änderungen/)).toBeInTheDocument();

      fetchKatalogPositionen.mockResolvedValue([position('p1', { unit_price_cents: 5000 })]);
      await nutzer.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

      expect(await screen.findByText('Entwurf gespeichert.')).toBeInTheDocument();
      expect(screen.queryByText(/ungespeicherte Änderungen/)).toBeNull();
      expect(screen.getByRole('button', { name: 'In Kraft setzen' })).toBeEnabled();
      // Gespeichert wurde, was der Aufruf schon immer schickte: Cent, getrimmt.
      expect(writeKatalogPositionen).toHaveBeenCalledWith('v2', [
        expect.objectContaining({ code: 'KG', unit_price_cents: 5000 }),
      ]);
    });

    it('hält „45" und „45,00" für denselben Preis (ABR-04)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      const preis = await screen.findByLabelText(/Preis/);
      await nutzer.clear(preis);
      await nutzer.type(preis, '45');

      expect(screen.queryByText(/ungespeicherte Änderungen/)).toBeNull();
      expect(screen.getByRole('button', { name: 'In Kraft setzen' })).toBeEnabled();
    });

    it('nimmt „Entwurf gespeichert." mit der nächsten Änderung zurück (ABR-04, UIK-21)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);
      writeKatalogPositionen.mockResolvedValue(undefined);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'Entwurf speichern' }));
      const meldung = await screen.findByText('Entwurf gespeichert.');
      // Erfolg trägt sein Zeichen (UIK-21).
      expect(meldung).toHaveTextContent('✓');

      await nutzer.type(screen.getByLabelText('Bezeichnung'), ' neu');
      expect(screen.queryByText('Entwurf gespeichert.')).toBeNull();
    });

    it('zeigt ein abgewiesenes Inkraftsetzen im offenen Kasten (ABR-03)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);
      publishKatalogVersion.mockRejectedValue(
        new Error('Die Preisliste konnte nicht in Kraft gesetzt werden.'),
      );

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'In Kraft setzen' }));
      await nutzer.click(screen.getByRole('button', { name: 'In Kraft setzen' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /konnte nicht in Kraft gesetzt werden\. Bitte die Verbindung prüfen/,
      );
      expect(screen.getByRole('group', { name: 'In Kraft setzen' })).toBeInTheDocument();
    });

    it('zeigt ein abgewiesenes Verwerfen im offenen Kasten und fragt mit „Ja, …" (ABR-03, WRT-21)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);
      deleteKatalogVersion.mockRejectedValue(
        new Error('Der Entwurf konnte nicht verworfen werden.'),
      );

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
      await nutzer.click(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Der Entwurf konnte nicht verworfen werden\./,
      );
      expect(deleteKatalogVersion).toHaveBeenCalledWith('v2');
      expect(screen.getByRole('group', { name: 'Entwurf verwerfen' })).toBeInTheDocument();
    });

    it('sperrt „In Kraft setzen" ohne Position und nennt den Grund (ABR-03)', async () => {
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);
      fetchKatalogPositionen.mockResolvedValue([]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      expect(
        await screen.findByText(/ohne Position lässt sich nicht in Kraft setzen/),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'In Kraft setzen' })).toBeDisabled();
      expect(publishKatalogVersion).not.toHaveBeenCalled();
    });

    it('meldet eine neue Position erst nach dem Verlassen eines Felds (ABR-21)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);
      writeKatalogPositionen.mockResolvedValue(undefined);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'Position hinzufügen' }));
      // Kein Alarm vor der ersten Eingabe.
      expect(screen.queryByRole('alert')).toBeNull();
      const kuerzel = document.getElementById('position-2-code')!;
      expect(kuerzel).not.toHaveAttribute('aria-invalid');

      // Kürzel betreten und leer verlassen: Die Meldung steht am Feld, nicht
      // an der Karte, und die übrigen Felder bleiben ruhig.
      await nutzer.click(kuerzel);
      await nutzer.tab();
      expect(kuerzel).toHaveAttribute('aria-invalid', 'true');
      expect(kuerzel).toHaveAccessibleDescription('Bitte ausfüllen.');
      expect(document.getElementById('position-2-label')).not.toHaveAttribute('aria-invalid');

      // Speichern ist nicht gesperrt; der Tipp sammelt alle Mängel oben.
      await nutzer.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
      const zusammenfassung = await screen.findByRole('alert');
      expect(zusammenfassung).toHaveTextContent('Position 2, Kürzel: Bitte ausfüllen.');
      expect(zusammenfassung).toHaveTextContent('Position 2, Bezeichnung: Bitte ausfüllen.');
      expect(zusammenfassung).toHaveTextContent('Position 2, Preis: Bitte einen Preis wie 45,00');
      expect(writeKatalogPositionen).not.toHaveBeenCalled();
    });

    it('fragt beim Wechsel zu einer anderen Liste, solange etwas ungespeichert ist (ABR-14)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf(), version('v1')]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      const preis = await screen.findByLabelText(/Preis/);
      await nutzer.clear(preis);
      await nutzer.type(preis, '49,00');
      await nutzer.click(screen.getByRole('button', { name: /Preisliste 2026/ }));

      const frage = screen.getByRole('group', { name: 'Ungespeicherte Preisliste' });
      expect(frage).toHaveTextContent(/Änderungen an „Entwurf 2027“ sind noch nicht gespeichert/);
      expect(within(frage).getByRole('button', { name: 'Verwerfen und wechseln' })).toHaveFocus();

      // Hier bleiben: Der Entwurf steht mit der Eingabe da.
      await nutzer.click(within(frage).getByRole('button', { name: 'Hier bleiben' }));
      expect(screen.getByLabelText(/Preis/)).toHaveValue('49,00');

      // Verwerfen und wechseln: die geltende Liste, ohne Formular.
      await nutzer.click(screen.getByRole('button', { name: /Preisliste 2026/ }));
      await nutzer.click(screen.getByRole('button', { name: 'Verwerfen und wechseln' }));
      expect(await screen.findByText('45,00 €')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Preis/)).toBeNull();
    });

    it('hält das Verlassen der Seite an, solange etwas ungespeichert ist (ABR-14, NAV-01)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);

      const { router } = zeigeMitRouten(
        [
          {
            path: '/abrechnung/katalog',
            element: (
              <>
                <CatalogPage user={testUser(['owner'])} />
                <Link to="/abrechnung">Rechnungen</Link>
              </>
            ),
          },
          { path: '/abrechnung', element: <p>Rechnungsliste</p> },
        ],
        '/abrechnung/katalog',
      );

      const preis = await screen.findByLabelText(/Preis/);
      await nutzer.clear(preis);
      await nutzer.type(preis, '49,00');
      await nutzer.click(screen.getByRole('link', { name: 'Rechnungen' }));

      expect(
        await screen.findByText(
          'Die Eingaben sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
        ),
      ).toBeInTheDocument();
      // Ein Entwurf ist ein Speicherstand: alle drei Wege.
      expect(screen.getByRole('button', { name: 'Speichern und weitergehen' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hier bleiben' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/abrechnung/katalog');
    });

    it('zeigt die gewählte Liste sichtbar und eine künftige als „Gilt ab" (ABR-13)', async () => {
      fetchKatalogVersionen.mockResolvedValue([
        version('v3', { label: 'Preisliste 2099', valid_from: '2099-01-01' }),
        version('v1'),
      ]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      const kuenftig = await screen.findByRole('button', { name: /Preisliste 2099/ });
      expect(kuenftig).toHaveAttribute('aria-current', 'true');
      expect(kuenftig.closest('li')).toHaveClass('bg-accent-soft');
      expect(kuenftig).toHaveTextContent('✓');
      expect(screen.getByText('Gilt ab 01.01.2099')).toBeInTheDocument();
      // Die heute geltende heißt weiter „In Kraft" und ist nicht gewählt.
      const geltend = screen.getByRole('button', { name: /Preisliste 2026/ });
      expect(geltend.closest('li')).not.toHaveClass('bg-accent-soft');
      expect(within(geltend.closest('li')!).getByText('In Kraft')).toBeInTheDocument();
    });

    it('sagt in der Rückfrage, ab wann die Liste gilt (ABR-13)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([
        version('v2', { published_at: null, label: 'Entwurf 2027', valid_from: '2027-01-01' }),
      ]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'In Kraft setzen' }));
      expect(screen.getByText(/Mit dem Inkraftsetzen wird „Entwurf 2027“/).textContent).toMatch(
        /sie gilt für Leistungen ab 01\.01\.2027/,
      );
    });

    it('nennt dem Office, wer Preislisten anlegt, und keinen Satz übers Ändern (ABR-17)', async () => {
      fetchKatalogVersionen.mockResolvedValue([]);

      renderWithProviders(<CatalogPage user={testUser(['office'])} />, '/abrechnung/katalog');

      expect(
        await screen.findByText(/Preislisten legt die Praxisinhaber:in an/),
      ).toBeInTheDocument();
    });

    it('zeigt dem Office am Entwurf keinen Hinweis aufs Ändern (ABR-17)', async () => {
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);

      renderWithProviders(<CatalogPage user={testUser(['office'])} />, '/abrechnung/katalog');

      expect(await screen.findByText('45,00 €')).toBeInTheDocument();
      expect(screen.queryByText(/Änderbar, solange/)).toBeNull();
    });

    it('nennt die Art nur, wo sie etwas unterscheidet (ABR-B06)', async () => {
      fetchKatalogVersionen.mockResolvedValue([version('v1')]);
      fetchKatalogPositionen.mockResolvedValue([
        position('p1'),
        position('p2', {
          code: 'AUS',
          label: 'Ausfall',
          item_kind: 'absence_fee',
          remedy: null,
          tax_treatment: 'not_taxable',
        }),
      ]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      expect(
        await screen.findByText('Behandlung · Heilbehandlung, umsatzsteuerfrei'),
      ).toBeInTheDocument();
      expect(screen.getByText('Behandlung · Ausfallhonorar · Nicht steuerbar')).toBeInTheDocument();
      expect(screen.queryByText(/Behandlung · Behandlung/)).toBeNull();
    });

    it('setzt nur die erwartete Aktion als Hauptknopf (ABR-24)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      const hauptknopf = (name: string) =>
        screen.getByRole('button', { name }).className.split(/\s+/).includes('bg-accent');

      await screen.findByRole('button', { name: 'Entwurf speichern' });
      expect(hauptknopf('Neue Preisliste')).toBe(false);
      expect(hauptknopf('Entwurf speichern')).toBe(false);
      expect(hauptknopf('In Kraft setzen')).toBe(true);

      await nutzer.type(screen.getByLabelText('Bezeichnung'), ' neu');
      expect(hauptknopf('Entwurf speichern')).toBe(true);
      expect(hauptknopf('In Kraft setzen')).toBe(false);
    });

    it('lässt die Steuer umbrechen statt schrumpfen und nennt „Kein Heilmittel" (ABR-12, WRT-14)', async () => {
      fetchKatalogVersionen.mockResolvedValue([entwurf()]);

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      const steuer = await screen.findByLabelText('Steuer');
      expect(steuer.closest('.sm\\:basis-64')).toHaveClass('sm:grow', 'min-w-0');
      expect(screen.getByRole('option', { name: 'Kein Heilmittel' })).toBeInTheDocument();
    });

    it('zeigt den Laufzustand beim Speichern und Anlegen (ZST-20)', async () => {
      const nutzer = userEvent.setup();
      fetchKatalogVersionen.mockResolvedValue([entwurf(), version('v1')]);
      writeKatalogPositionen.mockReturnValue(new Promise(() => undefined));
      createKatalogVersion.mockReturnValue(new Promise(() => undefined));

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      await nutzer.click(await screen.findByRole('button', { name: 'Entwurf speichern' }));
      expect(await screen.findByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();

      await nutzer.click(screen.getByRole('button', { name: 'Neue Preisliste' }));
      const neu = screen.getByRole('heading', { name: 'Neue Preisliste' }).closest('section')!;
      await nutzer.type(within(neu).getByLabelText('Bezeichnung'), 'Preisliste 2028');
      // WRT-06: Das Zitat schließt mit “, nicht mit einem geraden Zeichen.
      expect(
        within(neu).getByRole('checkbox', { name: 'Positionen aus „Preisliste 2026“ übernehmen' }),
      ).toBeInTheDocument();
      await nutzer.click(within(neu).getByRole('button', { name: 'Entwurf anlegen' }));
      expect(await screen.findByRole('button', { name: 'Wird angelegt …' })).toBeDisabled();
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      fetchKatalogVersionen.mockRejectedValue(new Error('Netz weg'));

      renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

      expect(
        await screen.findByText('Die Preislisten konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
      await waitFor(() => expect(fetchKatalogVersionen).toHaveBeenCalledTimes(1));
    });
  });
});
