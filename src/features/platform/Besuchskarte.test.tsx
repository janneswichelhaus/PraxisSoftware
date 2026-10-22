import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Termin } from './api';
import { Besuchskarte } from './Besuchskarte';
import { uhrzeit } from './zeit';

/**
 * Der nächste Termin als Karte (Handoff 2026-10-22, Abschnitt 3). Synthetisch.
 */
const HAUSBESUCH = {
  id: '77777777-7777-4777-8777-000000000001',
  starts_at: new Date(2026, 9, 24, 9, 30).toISOString(),
  ends_at: new Date(2026, 9, 24, 10, 30).toISOString(),
  appointment_type: 'home_visit',
  staff_name: 'Anna Beispiel',
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  location_name: null,
} as unknown as Termin;

function zeige(termin: Termin) {
  return render(
    <MemoryRouter>
      <Besuchskarte termin={termin} to="/p/termine/77777777-7777-4777-8777-000000000001" />
    </MemoryRouter>,
  );
}

describe('Besuchskarte', () => {
  it('nennt Tag und Zeit groß, darunter die Person mit Bild, Art und Ort', () => {
    const { container } = zeige(HAUSBESUCH);
    const karte = screen.getByRole('link');
    expect(karte).toHaveAttribute('href', '/p/termine/77777777-7777-4777-8777-000000000001');
    expect(screen.getByText('Samstag, 24. Oktober')).toBeInTheDocument();
    expect(
      screen.getByText(`${uhrzeit(HAUSBESUCH.starts_at)} bis ${uhrzeit(HAUSBESUCH.ends_at)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Hausbesuch · Anna Beispiel kommt zu Ihnen')).toBeInTheDocument();
    expect(screen.getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
    const bild = container.querySelector('[data-personenbild]')!;
    expect(bild).toHaveTextContent('AB');
    expect(bild.className).toContain('size-14');
    expect(karte.className).toContain('shadow-plattform');
    expect(karte.className).toContain('active:scale-98');
  });

  it('zeigt ohne Namen kein Bild', () => {
    const { container } = zeige({ ...HAUSBESUCH, staff_name: null });
    expect(container.querySelector('[data-personenbild]')).toBeNull();
    expect(screen.getByText('Hausbesuch · Ihre Praxis kommt zu Ihnen')).toBeInTheDocument();
  });
});
