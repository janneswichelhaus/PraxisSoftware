import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import type { Kennzahlen, Ziele } from './kennzahlen';
import { beispielKennzahlen } from './testdaten';
import type * as StatistikApi from './api';

const fetchKennzahlen = vi.fn();
const fetchZiele = vi.fn();
const setzeZiel = vi.fn();
const sichereAlsDatei = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StatistikApi>();
  return {
    ...actual,
    fetchKennzahlen: (...args: unknown[]) => fetchKennzahlen(...args) as Promise<Kennzahlen>,
    fetchZiele: () => fetchZiele() as Promise<Ziele>,
    setzeZiel: (...args: unknown[]) => setzeZiel(...args) as Promise<void>,
  };
});

vi.mock('@/features/datenschutz/datei', () => ({
  sichereAlsDatei: (...args: unknown[]) => sichereAlsDatei(...args) as void,
}));

const { StatisticsPage } = await import('./StatisticsPage');

const keineZiele: Ziele = {
  revenue_cents: null,
  open_items_cents: null,
  utilization_percent: null,
  ending_bases: null,
  absences: null,
};

function karte(titel: string): HTMLElement {
  return screen.getByRole('region', { name: titel });
}

describe('StatisticsPage (STA-003)', () => {
  beforeEach(() => {
    fetchKennzahlen.mockReset().mockResolvedValue(beispielKennzahlen());
    fetchZiele.mockReset().mockResolvedValue(keineZiele);
    setzeZiel.mockReset().mockResolvedValue(undefined);
    sichereAlsDatei.mockReset();
  });

  it('zeigt fuenf Karten mit Wert und je einer Handlung', async () => {
    renderWithProviders(<StatisticsPage />, '/statistiken');

    expect(screen.getByRole('heading', { name: 'Statistiken', level: 1 })).toBeInTheDocument();
    expect(
      within(await screen.findByRole('region', { name: 'Umsatz' })).getByText('12.345,00 €'),
    ).toBeInTheDocument();
    expect(within(karte('Offene Posten')).getByText('225,00 €')).toBeInTheDocument();
    expect(within(karte('Auslastung')).getByText('75 %')).toBeInTheDocument();
    expect(within(karte('Verordnungen ohne Anschluss')).getByText('2')).toBeInTheDocument();
    expect(within(karte('Ausfälle')).getByText('4')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Offene Posten mahnen' })).toHaveAttribute(
      'href',
      '/abrechnung',
    );
    expect(screen.getByRole('link', { name: 'Anrufliste für morgen' })).toHaveAttribute(
      'href',
      '/offen/anrufe',
    );
    expect(screen.getByRole('link', { name: 'Verordner:innen anfragen' })).toHaveAttribute(
      'href',
      '/offen',
    );
    expect(
      screen.getByRole('link', { name: 'Freie Fenster aus der Warteliste füllen' }),
    ).toHaveAttribute('href', '/warteliste');
  });

  it('haelt Umsatz und Zahlungseingang in getrennten Zahlen', async () => {
    renderWithProviders(<StatisticsPage />, '/statistiken');
    const umsatz = await screen.findByRole('region', { name: 'Umsatz' });
    expect(within(umsatz).getByText(/Rechnungsstellung brutto/)).toBeInTheDocument();
    expect(within(umsatz).getByText(/Zahlungseingang 9\.800,00 €/)).toBeInTheDocument();
  });

  it('zeigt ohne Ziel keinen Vergleich und mit Ziel den Stand', async () => {
    fetchZiele.mockResolvedValue({ ...keineZiele, revenue_cents: 2_000_000, absences: 5 });
    renderWithProviders(<StatisticsPage />, '/statistiken');

    const umsatz = await screen.findByRole('region', { name: 'Umsatz' });
    expect(await within(umsatz).findByText('Ziel verfehlt')).toBeInTheDocument();
    expect(within(karte('Ausfälle')).getByText('Ziel erreicht')).toBeInTheDocument();
    expect(within(karte('Auslastung')).queryByText(/Ziel (erreicht|verfehlt)/)).toBeNull();
    expect(within(karte('Auslastung')).getByText('Ziel: nicht gesetzt')).toBeInTheDocument();
  });

  it('setzt ein Ziel ueber das Formular der Karte', async () => {
    renderWithProviders(<StatisticsPage />, '/statistiken');
    const auslastung = await screen.findByRole('region', { name: 'Auslastung' });

    await userEvent.click(await within(auslastung).findByText('Ändern'));
    const feld = within(auslastung).getByLabelText(/Ziel Auslastung/);
    await userEvent.type(feld, '150');
    await userEvent.click(within(auslastung).getByRole('button', { name: 'Ziel speichern' }));
    expect(within(auslastung).getByText(/ganze Zahl von 0 bis 100/)).toBeInTheDocument();
    expect(setzeZiel).not.toHaveBeenCalled();

    await userEvent.clear(feld);
    await userEvent.type(feld, '85');
    await userEvent.click(within(auslastung).getByRole('button', { name: 'Ziel speichern' }));
    expect(setzeZiel).toHaveBeenCalledWith('utilization_percent', 85);
  });

  it('fragt beim Monatswechsel den gewaehlten Monat', async () => {
    renderWithProviders(<StatisticsPage />, '/statistiken');
    const auswahl = await screen.findByLabelText('Monat für Umsatz und Zahlungseingang');
    await userEvent.selectOptions(auswahl, '2026-08-01');
    expect(fetchKennzahlen).toHaveBeenLastCalledWith('2026-08-01');
  });

  it('speichert die Zahlen als CSV ohne Personen', async () => {
    renderWithProviders(<StatisticsPage />, '/statistiken');
    await userEvent.click(await screen.findByRole('button', { name: 'Als CSV speichern' }));

    expect(sichereAlsDatei).toHaveBeenCalledTimes(1);
    const [name, inhalt, typ] = sichereAlsDatei.mock.calls[0] as [string, string, string];
    expect(name).toBe('statistik-2026-09-stand-2026-09-29.csv');
    expect(typ).toMatch(/^text\/csv/);
    expect(inhalt).toContain('Umsatz (Rechnungsstellung, brutto)');
  });

  it('fuehrt nach einem Fehler beim Monatswechsel zurueck zum laufenden Monat', async () => {
    renderWithProviders(<StatisticsPage />, '/statistiken');
    const auswahl = await screen.findByLabelText('Monat für Umsatz und Zahlungseingang');
    fetchKennzahlen.mockRejectedValueOnce(new Error('Die Statistik konnte nicht geladen werden.'));
    await userEvent.selectOptions(auswahl, '2026-08-01');

    await userEvent.click(await screen.findByRole('button', { name: 'Zum laufenden Monat' }));
    expect(fetchKennzahlen).toHaveBeenLastCalledWith(null);
    expect(await screen.findByRole('region', { name: 'Umsatz' })).toBeInTheDocument();
  });

  it('sagt es, wenn die Zahlen nicht kommen', async () => {
    fetchKennzahlen.mockRejectedValue(new Error('Die Statistik konnte nicht geladen werden.'));
    renderWithProviders(<StatisticsPage />, '/statistiken');
    expect(
      await screen.findByText('Die Statistik konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});
