import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import type { CalendarEntry } from './api';
import { CalendarGrid } from './CalendarGrid';

/**
 * Kalender-Kacheln nach dem Design-Handoff vom 2026-10-01 (Abschnitt 3,
 * letzte Zeile): ohne Schatten, die Linie links trägt den Zustand statt einer
 * Farbe je Person. Das Wort steht weiter in der Kachel (KAL-23).
 */
function termin(teil: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'ter-1',
    patient_id: 'pat-1',
    staff_member_id: 'st-1',
    location_id: null,
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: null,
    ...teil,
  };
}

const ZUSTAENDE: Array<[CalendarEntry['status'], string, string]> = [
  ['confirmed', 'Bestätigt', 'border-l-accent'],
  ['completed', 'Abgeschlossen', 'border-l-line-strong'],
  ['documented', 'Dokumentiert', 'border-l-line-strong'],
  ['no_show', 'Nicht angetroffen', 'border-l-warnung'],
  ['cancelled', 'Abgesagt', 'border-l-danger'],
];

describe('Kalender-Kachel', () => {
  it.each(ZUSTAENDE)('zeigt %s mit 3-px-Linie in der Farbe des Zustands', (status, _, linie) => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            eintrag: termin({ status, patient_family_name: `Muster-${status}` }),
            spalteId: 'st-1',
            beginnMinute: 540,
            endeMinute: 600,
            ziehbar: status === 'confirmed',
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );

    const kachel = screen
      .getAllByRole('link')
      .find((link) => link.textContent?.includes(`Muster-${status}`))!;
    expect(kachel).toHaveClass('border-l-[3px]', linie);
    // Keine Farbe je Person mehr und kein Schatten.
    expect(kachel.style.borderLeftColor).toBe('');
    expect(kachel.className).not.toMatch(/shadow/);
  });

  it('nennt einen abweichenden Zustand weiter als Zeichen und Wort', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            eintrag: termin({ status: 'no_show' }),
            spalteId: 'st-1',
            beginnMinute: 540,
            endeMinute: 600,
            ziehbar: false,
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    expect(screen.getByTestId('kachel-status')).toHaveTextContent('! Nicht angetroffen');
  });
});

describe('Belegt-Block (ABN-021, BEF-112)', () => {
  it('zeigt eine belegte Zeit als „belegt“ mit Uhrzeit für Vorlesesoftware, ohne Link', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[
          {
            id: 'st-1',
            titel: 'Tom Training',
            baender: [],
            belegt: [{ vonMinute: 540, bisMinute: 600 }],
          },
        ]}
        eintraege={[]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    const block = screen.getByTestId('belegt');
    expect(block).toHaveTextContent('belegt 09:00 bis 10:00');
    expect(block.closest('a')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
