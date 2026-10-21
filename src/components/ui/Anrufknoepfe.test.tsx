import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Anrufknoepfe } from './Anrufknoepfe';

describe('Anrufknoepfe (BEF-175)', () => {
  it('macht je Nummer einen Knopf auf `tel:`, den Fokus auf Wunsch bei der ersten', () => {
    render(
      <Anrufknoepfe
        fokusbeginn
        nummern={[
          { label: 'Mobil', anzeige: '0170 1234567', href: 'tel:01701234567' },
          { label: 'Telefon', anzeige: '0221 123456', href: 'tel:0221123456' },
        ]}
      />,
    );
    const mobil = screen.getByRole('link', { name: /Mobil anrufen/ });
    expect(mobil).toHaveAttribute('href', 'tel:01701234567');
    expect(mobil).toHaveAttribute('data-autofocus');
    expect(mobil).toHaveTextContent('0170 1234567');
    expect(screen.getByRole('link', { name: /Telefon anrufen/ })).not.toHaveAttribute(
      'data-autofocus',
    );
  });

  it('macht mit `hauptknopf` nur die erste Nummer zum Hauptknopf (BEF-192)', () => {
    render(
      <Anrufknoepfe
        hauptknopf
        nummern={[
          { label: 'Mobil', anzeige: '0170 1234567', href: 'tel:01701234567' },
          { label: 'Telefon', anzeige: '0221 123456', href: 'tel:0221123456' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /Mobil anrufen/ })).toHaveClass('bg-accent');
    expect(screen.getByRole('link', { name: /Telefon anrufen/ })).not.toHaveClass('bg-accent');
  });

  it('sagt ohne Nummer, dass keine hinterlegt ist', () => {
    render(<Anrufknoepfe nummern={[]} />);
    expect(screen.getByText('Keine Rufnummer hinterlegt.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
