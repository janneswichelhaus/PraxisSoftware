import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, testUser } from '@/test-utils';
import { KENNZAHLEN, type Kennzahlen, type Ziele } from './kennzahlen';
import {
  beispielJePerson,
  beispielKennzahlen,
  beispielLeistungen,
  beispielMonate,
} from './testdaten';
import type * as StatistikApi from './api';

const fetchKennzahlen = vi.fn();
const fetchZiele = vi.fn();
const setzeZiel = vi.fn();
const fetchUmsatzMonate = vi.fn();
const fetchTopLeistungen = vi.fn();
const fetchUmsatzJePerson = vi.fn();
const sichereAlsDatei = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StatistikApi>();
  return {
    ...actual,
    fetchKennzahlen: (...args: unknown[]) => fetchKennzahlen(...args) as Promise<Kennzahlen>,
    fetchZiele: () => fetchZiele() as Promise<Ziele>,
    setzeZiel: (...args: unknown[]) => setzeZiel(...args) as Promise<void>,
    fetchUmsatzMonate: (...args: unknown[]) => fetchUmsatzMonate(...args) as Promise<unknown>,
    fetchTopLeistungen: (...args: unknown[]) => fetchTopLeistungen(...args) as Promise<unknown>,
    fetchUmsatzJePerson: (...args: unknown[]) => fetchUmsatzJePerson(...args) as Promise<unknown>,
  };
});

vi.mock('@/features/privacy/datenschutz/datei', () => ({
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
  return screen.getByRole('region', { name: (name) => name === titel });
}

describe('StatisticsPage (STA-003)', () => {
  beforeEach(() => {
    fetchKennzahlen.mockReset().mockResolvedValue(beispielKennzahlen());
    fetchZiele.mockReset().mockResolvedValue(keineZiele);
    setzeZiel.mockReset().mockResolvedValue(undefined);
    sichereAlsDatei.mockReset();
    fetchUmsatzMonate.mockReset().mockResolvedValue(beispielMonate());
    fetchTopLeistungen.mockReset().mockResolvedValue(beispielLeistungen());
    fetchUmsatzJePerson.mockReset().mockResolvedValue(beispielJePerson());
  });

  it('zeigt fuenf Kennzahlen mit Wert und je einer Handlung', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');

    expect(screen.getByRole('heading', { name: 'Statistiken', level: 1 })).toBeInTheDocument();
    expect(
      within(await screen.findByRole('region', { name: (name) => name === 'Umsatz' })).getByText(
        '12.345,00 €',
      ),
    ).toBeInTheDocument();
    expect(within(karte('Offene Posten')).getByText('225,00 €')).toBeInTheDocument();
    expect(within(karte('Auslastung')).getByText('75 %')).toBeInTheDocument();
    expect(within(karte('Verordnungen ohne Anschluss')).getByText('2')).toBeInTheDocument();
    // Der große Wert steht vor dem Balken mit derselben Zahl.
    expect(within(karte('Ausfälle')).getAllByText('4')[0]).toHaveClass('text-2xl');

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

  it('stellt die fuenf Kennzahlen als beschriftete Liste in einer Karte, ohne Kacheln (R2-O8)', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    await screen.findByRole('region', { name: (name) => name === 'Umsatz' });

    // Eine Liste mit dem Namen jeder Kennzahl als Beschriftung, in der
    // Reihenfolge der Kennzahlen.
    const liste = karte('Umsatz').closest('dl')!;
    expect(liste).not.toBeNull();
    const titel = KENNZAHLEN.map((kennzahl) => kennzahl.titel);
    expect(Array.from(liste.querySelectorAll('dt'), (dt) => dt.textContent)).toEqual(titel);

    // Eine Karte um alle fünf (DESIGN.md Regel 2) - keine Karte je Kennzahl.
    expect(liste.parentElement).toHaveClass('rounded-card');
    for (const name of titel) {
      const kennzahl = karte(name);
      expect(liste.contains(kennzahl)).toBe(true);
      expect(kennzahl.querySelector('.rounded-card')).toBeNull();
      // Jede trägt Ziel und nächsten Schritt.
      expect(within(kennzahl).getByText(/Ziel:/)).toBeInTheDocument();
      expect(within(kennzahl).getAllByRole('link')).toHaveLength(1);
    }
    expect(
      within(karte('Verordnungen ohne Anschluss')).getByRole('link', {
        name: 'Verordner:innen anfragen',
      }),
    ).toBeInTheDocument();
  });

  it('haelt Umsatz und Zahlungseingang in getrennten Zahlen', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    const umsatz = await screen.findByRole('region', { name: (name) => name === 'Umsatz' });
    expect(within(umsatz).getByText(/Rechnungsstellung brutto/)).toBeInTheDocument();
    expect(within(umsatz).getByText(/Zahlungseingang 9\.800,00 €/)).toBeInTheDocument();
  });

  it('zeigt ohne Ziel keinen Vergleich und mit Ziel den Stand', async () => {
    fetchZiele.mockResolvedValue({ ...keineZiele, revenue_cents: 2_000_000, absences: 5 });
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');

    const umsatz = await screen.findByRole('region', { name: (name) => name === 'Umsatz' });
    expect(await within(umsatz).findByText('Ziel verfehlt')).toBeInTheDocument();
    expect(within(karte('Ausfälle')).getByText('Ziel erreicht')).toBeInTheDocument();
    expect(within(karte('Auslastung')).queryByText(/Ziel (erreicht|verfehlt)/)).toBeNull();
    expect(within(karte('Auslastung')).getByText('Ziel: nicht gesetzt')).toBeInTheDocument();
  });

  it('setzt ein Ziel ueber das Formular der Kennzahl', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    const auslastung = await screen.findByRole('region', { name: (name) => name === 'Auslastung' });

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
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    const auswahl = await screen.findByLabelText('Monat für Umsatz und Zahlungseingang');
    await userEvent.selectOptions(auswahl, '2026-08-01');
    expect(fetchKennzahlen).toHaveBeenLastCalledWith('2026-08-01');
  });

  it('speichert die Zahlen als CSV ohne Personen', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    await userEvent.click(await screen.findByRole('button', { name: 'Als CSV speichern' }));

    expect(sichereAlsDatei).toHaveBeenCalledTimes(1);
    const [name, inhalt, typ] = sichereAlsDatei.mock.calls[0] as [string, string, string];
    expect(name).toBe('statistik-2026-09-stand-2026-09-29.csv');
    expect(typ).toMatch(/^text\/csv/);
    expect(inhalt).toContain('Umsatz (Rechnungsstellung, brutto)');
  });

  it('fuehrt nach einem Fehler beim Monatswechsel zurueck zum laufenden Monat', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    const auswahl = await screen.findByLabelText('Monat für Umsatz und Zahlungseingang');
    fetchKennzahlen.mockRejectedValueOnce(new Error('Die Statistik konnte nicht geladen werden.'));
    await userEvent.selectOptions(auswahl, '2026-08-01');

    await userEvent.click(await screen.findByRole('button', { name: 'Zum laufenden Monat' }));
    expect(fetchKennzahlen).toHaveBeenLastCalledWith(null);
    expect(
      await screen.findByRole('region', { name: (name) => name === 'Umsatz' }),
    ).toBeInTheDocument();
  });

  it('sagt es, wenn die Zahlen nicht kommen', async () => {
    fetchKennzahlen.mockRejectedValue(new Error('Die Statistik konnte nicht geladen werden.'));
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    expect(
      await screen.findByText('Die Statistik konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });

  it('zeigt den Verlauf als Grafiken mit Legende und Tabelle', async () => {
    renderWithProviders(<StatisticsPage user={testUser(['owner', 'therapist'])} />, '/statistiken');
    const verlauf = await screen.findByRole('region', { name: 'Umsatz der letzten 12 Monate' });
    expect(
      await within(verlauf).findByRole('group', {
        name: 'Umsatz und Zahlungseingang der letzten 12 Monate',
      }),
    ).toBeInTheDocument();
    // Legende und Tabellenkopf nennen die zweite Reihe.
    expect(within(verlauf).getAllByText('Zahlungseingang')).toHaveLength(2);
    expect(within(verlauf).getByRole('table')).toBeInTheDocument();

    // Umsatz je Person erst auf Wunsch.
    const personen = screen.getByRole('region', { name: 'Umsatz nach Therapeut:in' });
    expect(fetchUmsatzJePerson).not.toHaveBeenCalled();
    await userEvent.click(
      within(personen).getByRole('button', { name: 'Umsatz je Person anzeigen' }),
    );
    expect(await within(personen).findAllByText('Anna Beispiel')).toHaveLength(2);
    expect(fetchUmsatzJePerson).toHaveBeenCalledWith(6);

    const leistungen = screen.getByRole('region', { name: 'Umsatzstärkste Leistungen' });
    expect(await within(leistungen).findByText('4.620,00 €')).toBeInTheDocument();
  });

  it('zeigt einer Person mit Umsatzbeteiligung nur den eigenen Umsatz', async () => {
    const anna = { ...testUser(['therapist']), revenueShare: true };
    fetchUmsatzJePerson.mockResolvedValue(
      beispielJePerson().filter((z) => z.staff_name === 'Anna Beispiel'),
    );
    renderWithProviders(<StatisticsPage user={anna} />, '/statistiken');

    expect(await screen.findByRole('region', { name: 'Mein Umsatz' })).toBeInTheDocument();
    expect(fetchUmsatzJePerson).toHaveBeenCalledWith(12);
    expect(fetchKennzahlen).not.toHaveBeenCalled();
    expect(fetchUmsatzMonate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Als CSV speichern' })).toBeNull();
  });
});
