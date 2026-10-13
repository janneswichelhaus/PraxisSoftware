import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { BereichePage } from './BereichePage';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Die Bereichsübersicht hinter „Mehr" (BEF-049, Option 2, RAH-004).
 *
 * Bis zum Handoff vom 2026-10-05 versprach der Satz darunter eine
 * Kennzeichnung, die die Liste nicht trug („… sind als Vorschau
 * gekennzeichnet"). Jetzt sagt er den Stand: Vorschauen stehen in den
 * Untermenüs, die Kommunikation ist als Ganzes eine, und der Weg zum
 * Protokoll steht jeder Rolle offen.
 */
describe('BereichePage', () => {
  it('zeigt alle Bereiche der Rolle in Seitenleisten-Reihenfolge, die Kommunikation eingeschlossen', () => {
    renderWithProviders(<BereichePage user={testUser(['therapist'])} />, '/bereiche');
    const liste = screen.getByRole('list');
    const namen = Array.from(liste.querySelectorAll('a')).map(
      (link) => link.querySelector('.font-medium')?.textContent,
    );
    expect(namen).toEqual([
      'Übersicht',
      'Kalender',
      'Patient:innen',
      'Kommunikation',
      'Organisatorisches',
    ]);
  });

  it('sagt, was Vorschauen tun, und führt jede Rolle zum Vorschau-Protokoll', () => {
    renderWithProviders(
      <BereichePage user={testUser(['patient'], 'Max Mustermann')} />,
      '/bereiche',
    );
    // Kurz und als Kleingedrucktes (Design-Review T7); die Kommunikation ist
    // seit KOM-002 keine Vorschau mehr und steht deshalb nicht mehr darin.
    const satz = screen.getByText(/Vorschauen speichern nichts/);
    expect(satz).toHaveTextContent(
      'Vorschauen speichern nichts; was dort simuliert wurde, steht im Vorschau-Protokoll.',
    );
    expect(satz).toHaveClass('text-kleingedruckt');
    expect(satz).not.toHaveTextContent(/Kommunikation/);
    expect(screen.queryByText(/als Vorschau gekennzeichnet/)).toBeNull();
    const link = screen.getByRole('link', { name: 'Vorschau-Protokoll' });
    expect(link).toHaveAttribute('href', '/vorschau/protokoll');
    // Der Textlink des Systems: Hauptfarbe mit Unterstreichung (UIK-15).
    expect(link.className).toContain('underline');
  });
});
