import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import type { DayPlanEntry } from './api';
import { Tageskarte } from './Tagesliste';

/**
 * Die Tageskarte (UX-001) nach dem UX-Review (UXR-003): Name als erkennbarer
 * Link mit Rückweg, Freitexte, die umbrechen, und Pfeile, die nicht
 * mitgelesen werden.
 */

function eintrag(teil: Partial<DayPlanEntry> = {}): DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2026-09-28T07:00:00.000Z',
    ends_at: '2026-09-28T08:00:00.000Z',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    location_name: null,
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_city: 'Tuebingen',
    patient_phone: null,
    patient_phone_mobile: '+49 160 0000005',
    home_visit_access_note: '2. OG links, Klingel „Mustermann“.',
    special_note: 'Hund im Flur.',
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

describe('Tageskarte', () => {
  it('fuehrt ueber den Namen in die Akte - mit dem Weg zurueck in den Tag (UEB-13)', () => {
    renderWithProviders(<Tageskarte termin={eintrag()} />);

    const name = screen.getByRole('link', { name: 'Max Mustermann' });
    expect(name).toHaveAttribute('href', `/patienten/p1?zurueck=${encodeURIComponent('/')}`);
    // Als Link erkennbar ohne Maus und 44 px hoch (RSP-06, UIK-15).
    expect(name).toHaveClass('text-accent', 'underline', 'min-h-11');
  });

  it('nennt eine Fehlzeit beim Titel, ohne Link in eine Akte', () => {
    renderWithProviders(
      <Tageskarte
        termin={eintrag({
          kind: 'internal',
          patient_id: null,
          title: 'Teambesprechung',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
        })}
      />,
    );

    expect(screen.getByText('Teambesprechung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Teambesprechung' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fehlzeit öffnen' })).toBeInTheDocument();
  });

  it('heisst den Wohnungszugang „Zugangshinweis" wie in den Stammdaten (WRT-17)', () => {
    renderWithProviders(<Tageskarte termin={eintrag()} />);
    expect(screen.getByText('Zugangshinweis:')).toBeInTheDocument();
    expect(screen.queryByText('Zugang:')).toBeNull();
  });

  it('bricht Freitexte auch mitten im Wort um (UEB-16)', () => {
    const langesWort = 'Hinterhofeingangstuerschluesselkastenzahlenkombination';
    renderWithProviders(
      <Tageskarte
        termin={eintrag({ home_visit_access_note: langesWort, special_note: langesWort })}
      />,
    );

    for (const stelle of screen.getAllByText(langesWort)) {
      expect(stelle).toHaveClass('wrap-anywhere', 'min-w-0');
    }
    expect(screen.getByText('Beispielstrasse 12').closest('address')).toHaveClass('wrap-anywhere');
    expect(screen.getByRole('link', { name: 'Max Mustermann' }).closest('p')).toHaveClass(
      'wrap-anywhere',
    );
  });

  it('liest beim Termin-Link keinen Pfeil mit vor (WRT-08)', () => {
    renderWithProviders(<Tageskarte termin={eintrag()} />);

    const termin = screen.getByRole('link', { name: 'Termin öffnen' });
    expect(termin).toHaveAttribute('href', `/termine/t1?zurueck=${encodeURIComponent('/')}`);
    // Sichtbar steht der Pfeil noch da, nur ausgeblendet für Vorlesesoftware.
    expect(termin.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
  });
});
