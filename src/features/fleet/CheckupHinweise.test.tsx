import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { CheckupErinnerung, CheckupKalenderhinweis } from './CheckupHinweise';
import { ANNA, NINA, testFlotte, testRad } from './testdaten';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const HEUTE = '2026-10-16'; // Freitag

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(
    testFlotte({
      bikes: [
        // Annas Rad: zuletzt am 1.10. geprüft, seit dem 15.10. fällig.
        testRad({ last_checkup_at: '2026-10-01T07:00:00+00:00' }),
        // Ninas Rad: gestern geprüft.
        testRad({
          id: 'rad-4',
          name: 'Lastenrad 4',
          regular_rider: NINA,
          planned_weekdays: [3, 4, 5],
          last_checkup_at: '2026-10-15T07:00:00+00:00',
        }),
      ],
    }),
  );
});

/** Hinweise auf den fälligen Check-Up (FLT-009, ANN-570) - kein Termin. */
describe('Hinweise auf den Check-Up', () => {
  it('erinnert in der Übersicht an das eigene fällige Rad und führt in den Check-Up', async () => {
    const { container } = renderWithProviders(
      <CheckupErinnerung heute={HEUTE} zone="Europe/Berlin" />,
      '/',
    );
    expect(
      await screen.findByRole('heading', { name: 'Fahrrad-Check-Up fällig' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Check-Up fällig seit 15\.10\.2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check-Up Lastenrad 1 starten' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/checkup?rad=rad-1',
    );
    expect(screen.queryByText('Lastenrad 4')).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('zeigt in der Übersicht nichts, wenn nichts fällig ist oder der Rhythmus aus ist', async () => {
    fetchFleet.mockResolvedValue(testFlotte({ checkup_interval_days: null }));
    const { container } = renderWithProviders(
      <CheckupErinnerung heute={HEUTE} zone="Europe/Berlin" />,
      '/',
    );
    await vi.waitFor(() => expect(fetchFleet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('schlägt im Kalender eine freie Lücke vor und führt ins Formular der Fehlzeit', async () => {
    renderWithProviders(
      <CheckupKalenderhinweis
        spalten={[
          {
            person: ANNA.id,
            tag: HEUTE,
            baender: [{ vonMinute: 8 * 60, bisMinute: 16 * 60 }],
            belegt: [{ vonMinute: 8 * 60, bisMinute: 12 * 60 }],
          },
          { person: NINA.id, tag: HEUTE, baender: null, belegt: [] },
        ]}
        heute={HEUTE}
        jetztMinute={7 * 60}
        zone="Europe/Berlin"
        rueckweg="/kalender?ansicht=tag"
      />,
      '/kalender',
    );
    const zusammenfassung = await screen.findByText('Fahrrad-Check-Up fällig');
    zusammenfassung.closest('details')?.setAttribute('open', '');
    const liste = screen.getByRole('list', { name: 'Fällige Check-Ups' });
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toHaveTextContent('Lastenrad 1 · Anna Beispiel');
    expect(zeilen[0]).toHaveTextContent('Frei: heute, 12:00–12:20');
    const link = within(zeilen[0]!).getByRole('link', { name: 'Check-Up Lastenrad 1 eintragen' });
    expect(link.getAttribute('href')).toContain('/termine/ereignis?datum=2026-10-16');
    expect(link.getAttribute('href')).toContain('beginn=12%3A00');
    expect(link.getAttribute('href')).toContain('zweck=checkup');
  });
});
